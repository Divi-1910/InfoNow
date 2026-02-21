import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../middlewares/auth.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { prisma } from "../lib/prisma.js";
import { getOpenSearchClient, MEGA_INDEX } from "../lib/opensearch.js";
import { hitToFeedItem } from "../lib/megaTransform.js";
import { logger } from "../utils/logger.js";

const feedRouter = Router();
type SmartSort = [number, number, string];
type RecentSort = [boolean, number, string];
type BlendSource = "news" | "youtube";

type BlendCursor = {
  v: 2;
  mode: "blend";
  news: SmartSort | null;
  youtube: SmartSort | null;
  nextSource: BlendSource;
};

/**
 * Optional auth middleware - populates req.user if authenticated,
 * but doesn't reject unauthenticated requests (allows browse mode)
 */
const optionalAuthMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const accessToken = req.cookies.accessToken;
    if (accessToken) {
      const payload = verifyAccessToken(accessToken);
      req.user = payload;
    }
  } catch (error) {
    // Token invalid or expired - continue without auth (browse mode)
    logger.debug("Optional auth - no valid token, continuing as guest");
  }
  next();
};

/**
 * GET /api/feed
 *
 * Powered by mega_index in OpenSearch. Supports cursor pagination via search_after.
 *
 * Query Parameters:
 * - mode: 'personalized' | 'browse' (default: personalized if authenticated)
 * - topicId: number - filter by specific topic
 * - subTopicId: number - filter by specific subtopic
 * - type: 'News' | 'Youtube' - filter by source type
 * - dateFrom: ISO date string - filter by date range start
 * - dateTo: ISO date string - filter by date range end
 * - cursor: opaque base64url string from previous response
 * - limit: number - items per page (default: 20, max: 50)
 * - sortOrder: 'asc' | 'desc' (default: desc)
 * - strategy: 'smart' | 'recent' (default: smart)
 */
feedRouter.get("/", optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const {
      mode,
      topicId,
      subTopicId,
      type,
      dateFrom,
      dateTo,
      cursor,
      limit = "20",
      sortOrder = "desc",
      strategy = "smart",
    } = req.query;

    const limitNum = Math.min(Math.max(parseInt(limit as string) || 20, 1), 50);
    const order = sortOrder === "asc" ? "asc" : "desc";
    const rankingStrategy = strategy === "recent" ? "recent" : "smart";
    const feedMode = (mode as string) || (req.user ? "personalized" : "browse");

    const filter: any[] = [];
    let subscribedTopicIds: number[] = [];
    let subscribedSubTopicIds: number[] = [];

    // Personalized mode: OR filter across topic and subtopic subscriptions
    if (feedMode === "personalized" && req.user) {
      const [userTopics, userSubTopics] = await Promise.all([
        prisma.userTopic.findMany({
          where: { userId: req.user.userId },
          select: { topicId: true },
        }),
        prisma.userSubTopic.findMany({
          where: { userId: req.user.userId },
          select: { subTopicId: true },
        }),
      ]);

      const topicIds = userTopics.map((ut) => ut.topicId);
      const subTopicIds = userSubTopics.map((ust) => ust.subTopicId);
      subscribedTopicIds = topicIds;
      subscribedSubTopicIds = subTopicIds;

      if (topicIds.length === 0 && subTopicIds.length === 0) {
        return res.status(200).json({
          items: [],
          pagination: { nextCursor: null, hasMore: false },
          message: "Subscribe to topics to see personalized feed",
        });
      }

      filter.push({
        bool: {
          should: [
            ...(topicIds.length > 0 ? [{ terms: { topic_id: topicIds } }] : []),
            ...(subTopicIds.length > 0 ? [{ terms: { subtopic_id: subTopicIds } }] : []),
          ],
          minimum_should_match: 1,
        },
      });
    }

    // Explicit filters
    if (topicId) filter.push({ term: { topic_id: Number(topicId) } });
    if (subTopicId) filter.push({ term: { subtopic_id: Number(subTopicId) } });
    if (type) filter.push({ term: { source_type: (type as string).toLowerCase() } });

    // Date range
    if (dateFrom || dateTo) {
      filter.push({
        range: {
          fetch_timestamp: {
            ...(dateFrom && { gte: dateFrom as string }),
            ...(dateTo && { lte: dateTo as string }),
          },
        },
      });
    }

    const decodeCursor = () => {
      if (!cursor) return null;
      try {
        return JSON.parse(
          Buffer.from(cursor as string, "base64url").toString("utf-8")
        ) as unknown;
      } catch {
        return null;
      }
    };

    // Smart mode without explicit type filter uses two-stream blending.
    const explicitType = (type as string | undefined)?.toLowerCase();
    const shouldBlendSources = rankingStrategy === "smart" && !explicitType;
    const decodedCursor = decodeCursor();

    const os = getOpenSearchClient();
    const should: any[] = [];
    if (rankingStrategy === "smart") {
      should.push({ term: { has_enriched: { value: true, boost: 4.0 } } });
      if (subscribedSubTopicIds.length > 0) {
        should.push({
          terms: {
            subtopic_id: subscribedSubTopicIds,
            boost: 3.0,
          },
        });
      }
      if (subscribedTopicIds.length > 0) {
        should.push({
          terms: {
            topic_id: subscribedTopicIds,
            boost: 2.0,
          },
        });
      }
    }

    const baseQuery: any = {
      bool: {
        filter,
        ...(should.length > 0 ? { should, minimum_should_match: 0 } : {}),
      },
    };
    const buildSmartQuery = (extraFilter: any[] = []) => ({
      function_score: {
        query: {
          bool: {
            filter: [...filter, ...extraFilter],
            ...(should.length > 0 ? { should, minimum_should_match: 0 } : {}),
          },
        },
        functions: [
          {
            gauss: {
              fetch_timestamp: {
                origin: "now",
                scale: "3d",
                offset: "6h",
                decay: 0.5,
              },
            },
            weight: 1.5,
          },
        ],
        score_mode: "sum",
        boost_mode: "sum",
      },
    });

    let pageHits: any[] = [];
    let hasMore = false;
    let nextCursor: string | null = null;

    if (shouldBlendSources) {
      const blendCursor: BlendCursor | null =
        decodedCursor &&
        typeof decodedCursor === "object" &&
        !Array.isArray(decodedCursor) &&
        (decodedCursor as any).mode === "blend" &&
        (decodedCursor as any).v === 2
          ? (decodedCursor as BlendCursor)
          : null;

      const perSourceSize = limitNum + 1;
      const [newsResult, ytResult] = await Promise.all([
        os.search({
          index: MEGA_INDEX,
          body: {
            query: buildSmartQuery([{ term: { source_type: "news" } }]) as any,
            size: perSourceSize,
            sort: [
              { _score: { order: "desc" } },
              { fetch_timestamp: { order } },
              { data_point_id: { order } },
            ],
            ...(blendCursor?.news ? { search_after: blendCursor.news } : {}),
          },
        }),
        os.search({
          index: MEGA_INDEX,
          body: {
            query: buildSmartQuery([{ term: { source_type: "youtube" } }]) as any,
            size: perSourceSize,
            sort: [
              { _score: { order: "desc" } },
              { fetch_timestamp: { order } },
              { data_point_id: { order } },
            ],
            ...(blendCursor?.youtube ? { search_after: blendCursor.youtube } : {}),
          },
        }),
      ]);

      const newsHits: any[] = newsResult.body?.hits?.hits ?? [];
      const ytHits: any[] = ytResult.body?.hits?.hits ?? [];
      const newsHasMore = newsHits.length === perSourceSize;
      const ytHasMore = ytHits.length === perSourceSize;

      let ni = 0;
      let yi = 0;
      const merged: any[] = [];
      let nextSource: BlendSource = blendCursor?.nextSource ?? "news";

      while (
        merged.length < limitNum + 1 &&
        (ni < newsHits.length || yi < ytHits.length)
      ) {
        if (nextSource === "news") {
          if (ni < newsHits.length) {
            merged.push(newsHits[ni++]);
            nextSource = "youtube";
          } else if (yi < ytHits.length) {
            merged.push(ytHits[yi++]);
          }
        } else {
          if (yi < ytHits.length) {
            merged.push(ytHits[yi++]);
            nextSource = "news";
          } else if (ni < newsHits.length) {
            merged.push(newsHits[ni++]);
          }
        }
      }

      hasMore = merged.length > limitNum || newsHasMore || ytHasMore;
      pageHits = merged.slice(0, limitNum);

      if (hasMore) {
        const newsConsumed = pageHits.filter(
          (h) => h._source?.source_type === "news"
        );
        const ytConsumed = pageHits.filter(
          (h) => h._source?.source_type === "youtube"
        );
        const lastNewsSort = newsConsumed.length
          ? (newsConsumed[newsConsumed.length - 1].sort as SmartSort)
          : blendCursor?.news ?? null;
        const lastYoutubeSort = ytConsumed.length
          ? (ytConsumed[ytConsumed.length - 1].sort as SmartSort)
          : blendCursor?.youtube ?? null;
        const cursorPayload: BlendCursor = {
          v: 2,
          mode: "blend",
          news: lastNewsSort,
          youtube: lastYoutubeSort,
          nextSource,
        };
        nextCursor = Buffer.from(JSON.stringify(cursorPayload)).toString(
          "base64url"
        );
      }
    } else {
      let searchAfter: [number | boolean, number, string] | undefined;
      if (Array.isArray(decodedCursor) && decodedCursor.length === 3) {
        const [first, second, third] = decodedCursor;
        const isValidRecentCursor =
          rankingStrategy === "recent" &&
          typeof first === "boolean" &&
          typeof second === "number" &&
          typeof third === "string";
        const isValidSmartCursor =
          rankingStrategy === "smart" &&
          typeof first === "number" &&
          typeof second === "number" &&
          typeof third === "string";
        if (isValidRecentCursor || isValidSmartCursor) {
          searchAfter = decodedCursor as [number | boolean, number, string];
        }
      }

      const osBody: any = {
        query: rankingStrategy === "smart" ? (buildSmartQuery() as any) : baseQuery,
        size: limitNum + 1,
        sort:
          rankingStrategy === "smart"
            ? [
                { _score: { order: "desc" } },
                { fetch_timestamp: { order } },
                { data_point_id: { order } },
              ]
            : [
                {
                  has_enriched: {
                    order: "desc",
                    missing: "_last",
                    unmapped_type: "boolean",
                  },
                },
                { fetch_timestamp: { order } },
                { data_point_id: { order } },
              ],
      };
      if (searchAfter) {
        osBody.search_after = searchAfter;
      }

      const result = await os.search({ index: MEGA_INDEX, body: osBody });
      const hits: any[] = result.body?.hits?.hits ?? [];

      hasMore = hits.length > limitNum;
      pageHits = hasMore ? hits.slice(0, -1) : hits;

      if (hasMore && pageHits.length > 0) {
        const lastSort = pageHits[pageHits.length - 1].sort as
          | SmartSort
          | RecentSort;
        nextCursor = Buffer.from(JSON.stringify(lastSort)).toString(
          "base64url"
        );
      }
    }

    // Resolve isSaved
    const itemIds = pageHits.map(
      (h: any) => h._source?.data_point_id ?? h._id
    );
    let savedIds = new Set<string>();
    if (req.user && itemIds.length > 0) {
      const saved = await prisma.savedItem.findMany({
        where: { userId: req.user.userId, dataPointId: { in: itemIds } },
        select: { dataPointId: true },
      });
      savedIds = new Set(saved.map((s) => s.dataPointId));
    }

    const feedItems = pageHits.map((h: any) => hitToFeedItem(h, savedIds));

    return res.status(200).json({
      items: feedItems,
      pagination: { nextCursor, hasMore },
    });
  } catch (error) {
    logger.error("Feed fetch error:", error);
    return res.status(500).json({ message: "Failed to fetch feed" });
  }
});

/**
 * GET /api/feed/:id
 * Returns a single feed item with full enriched content
 */
feedRouter.get("/:id", optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const dp = await prisma.dataPoint.findUnique({
      where: { id: req.params.id },
      include: {
        topic: { select: { id: true, name: true, slug: true } },
        subTopic: { select: { id: true, name: true, slug: true } },
        rawNews: true,
        rawReddit: true,
        rawYoutube: true,
        enrichedNews: true,
        enrichedYoutube: true,
      },
    });

    if (!dp) {
      return res.status(404).json({ message: "Item not found" });
    }

    let content: any = null;
    if (dp.type === "News" && dp.rawNews) {
      content = {
        title: dp.rawNews.title,
        url: dp.rawNews.url,
        description: dp.rawNews.description,
        publishedAt: dp.rawNews.publishedAt,
        sourceName: dp.rawNews.sourceName,
        author: dp.rawNews.author,
        imageUrl: dp.rawNews.imageUrl,
      };
    } else if (dp.type === "Reddit" && dp.rawReddit) {
      content = {
        postId: dp.rawReddit.postId,
        subreddit: dp.rawReddit.subreddit,
        title: dp.rawReddit.title,
        selftext: dp.rawReddit.selftext,
        author: dp.rawReddit.author,
        score: dp.rawReddit.score,
        numComments: dp.rawReddit.numComments,
        permalink: dp.rawReddit.permalink,
        createdUtc: dp.rawReddit.createdUtc,
        thumbnail: dp.rawReddit.thumbnail,
      };
    } else if (dp.type === "Youtube" && dp.rawYoutube) {
      content = {
        videoId: dp.rawYoutube.videoId,
        channelId: dp.rawYoutube.channelId,
        channelTitle: dp.rawYoutube.channelTitle,
        title: dp.rawYoutube.title,
        description: dp.rawYoutube.description,
        thumbnailUrl: dp.rawYoutube.thumbnailUrl,
        publishedAt: dp.rawYoutube.publishedAt,
        viewCount: Number(dp.rawYoutube.viewCount),
        likeCount: Number(dp.rawYoutube.likeCount),
        duration: dp.rawYoutube.duration,
      };
    }

    let isSaved = false;
    if (req.user) {
      const saved = await prisma.savedItem.findUnique({
        where: { userId_dataPointId: { userId: req.user.userId, dataPointId: dp.id } },
      });
      isSaved = !!saved;
    }

    let enriched = undefined;
    if (dp.enrichedNews) {
      enriched = {
        summary: dp.enrichedNews.summary,
        fullContent: dp.enrichedNews.fullContent,
        hasFullContent: true,
      };
    } else if (dp.enrichedYoutube) {
      enriched = {
        summary: dp.enrichedYoutube.summary,
        fullContent: dp.enrichedYoutube.transcript,
        hasFullContent: true,
      };
    }

    return res.status(200).json({
      id: dp.id,
      type: dp.type,
      fetchedAt: dp.fetchedAt.toISOString(),
      topic: dp.topic,
      subTopic: dp.subTopic,
      content,
      enriched,
      isSaved,
    });
  } catch (error) {
    logger.error("Feed item fetch error:", error);
    return res.status(500).json({ message: "Failed to fetch item" });
  }
});

export default feedRouter;
