import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../middlewares/auth.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { prisma } from "../lib/prisma.js";
import { getOpenSearchClient, MEGA_INDEX } from "../lib/opensearch.js";
import { hitToFeedItem } from "../lib/megaTransform.js";
import { logger } from "../utils/logger.js";
import type { DataType } from "@prisma/client";

const feedRouter = Router();

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
    } = req.query;

    const limitNum = Math.min(Math.max(parseInt(limit as string) || 20, 1), 50);
    const order = sortOrder === "asc" ? "asc" : "desc";
    const feedMode = (mode as string) || (req.user ? "personalized" : "browse");

    const filter: any[] = [];

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

    // Decode cursor (search_after: [epochMs, data_point_id])
    let searchAfter: [number, string] | undefined;
    if (cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(cursor as string, "base64url").toString("utf-8")
        ) as [number, string];
        if (Array.isArray(decoded) && decoded.length === 2) {
          searchAfter = decoded;
        }
      } catch {
        // Stale or invalid cursor — start fresh
      }
    }

    const os = getOpenSearchClient();
    const osBody: any = {
      query: { bool: { filter } },
      size: limitNum + 1,
      sort: [{ fetch_timestamp: { order } }, { data_point_id: { order } }],
    };
    if (searchAfter) {
      osBody.search_after = searchAfter;
    }

    const result = await os.search({ index: MEGA_INDEX, body: osBody });
    const hits: any[] = result.body?.hits?.hits ?? [];

    const hasMore = hits.length > limitNum;
    const pageHits = hasMore ? hits.slice(0, -1) : hits;

    // Build next cursor from last hit's sort values
    let nextCursor: string | null = null;
    if (hasMore && pageHits.length > 0) {
      const lastSort = pageHits[pageHits.length - 1].sort as [number, string];
      nextCursor = Buffer.from(JSON.stringify(lastSort)).toString("base64url");
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
