import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../middlewares/auth.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../utils/logger.js";
import type { DataType, Prisma } from "@prisma/client";

const trendingRouter = Router();
type TimeRange = "24h" | "7d" | "30d";

interface RankedItem {
  dataPoint: any;
  score: number;
}

interface TrendingTopic {
  id: number;
  name: string;
  slug: string;
  count: number;
  score: number;
}

/**
 * Optional auth middleware - same as in feed.ts
 * Populates req.user if authenticated, allows guest access
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
    logger.debug("Optional auth - no valid token, continuing as guest");
  }
  next();
};

/**
 * GET /api/trending
 * Get trending/popular content
 *
 * Trending logic:
 * - Reddit: Sort by score + numComments (engagement)
 * - YouTube: Sort by viewCount + likeCount (popularity)
 * - News: Prioritize enriched articles, then by recency
 *
 * Query params:
 * - topicId: number - filter by specific topic
 * - subTopicId: number - filter by specific subtopic
 * - type: 'News' | 'Reddit' | 'Youtube' - filter by source type
 * - limit: number - items per page (default: 20, max: 50)
 * - timeRange: '24h' | '7d' | '30d' (default: 24h)
 * - topicLimit: number - top trending topics to return (default: 6, max: 20)
 */
trendingRouter.get("/", optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const {
      topicId,
      subTopicId,
      type,
      limit = "20",
      timeRange = "24h",
      topicLimit = "6",
    } = req.query;

    const limitNum = Math.min(Math.max(parseInt(limit as string) || 20, 1), 50);
    const topicLimitNum = Math.min(
      Math.max(parseInt(topicLimit as string) || 6, 1),
      20
    );

    // Calculate time cutoff based on timeRange
    const now = new Date();
    let timeCutoff: Date;
    const selectedTimeRange: TimeRange =
      timeRange === "7d" || timeRange === "30d" ? timeRange : "24h";
    switch (timeRange) {
      case "7d":
        timeCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        timeCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default: // 24h
        timeCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const halfLifeHoursByRange: Record<TimeRange, number> = {
      "24h": 12,
      "7d": 48,
      "30d": 168,
    };
    const halfLifeHours = halfLifeHoursByRange[selectedTimeRange];

    // Build base where clause
    const baseWhere: Prisma.DataPointWhereInput = {
      fetchedAt: { gte: timeCutoff },
      ...(topicId && { topicId: parseInt(topicId as string) }),
      ...(subTopicId && { subTopicId: parseInt(subTopicId as string) }),
      ...(type && { type: type as DataType }),
    };

    // Fetch by type with type-specific ordering
    const [redditPosts, youtubePosts, newsPosts] = await Promise.all([
      // Reddit: Order by score (engagement)
      !type || type === "Reddit"
        ? prisma.dataPoint.findMany({
            where: { ...baseWhere, type: "Reddit" },
            include: {
              topic: { select: { id: true, name: true, slug: true } },
              subTopic: { select: { id: true, name: true, slug: true } },
              rawReddit: true,
              enrichedNews: { select: { summary: true } },
              enrichedYoutube: { select: { summary: true } },
            },
            orderBy: { rawReddit: { score: "desc" } },
            take: limitNum,
          })
        : [],

      // YouTube: Order by viewCount (popularity)
      !type || type === "Youtube"
        ? prisma.dataPoint.findMany({
            where: { ...baseWhere, type: "Youtube" },
            include: {
              topic: { select: { id: true, name: true, slug: true } },
              subTopic: { select: { id: true, name: true, slug: true } },
              rawYoutube: true,
              enrichedNews: { select: { summary: true } },
              enrichedYoutube: { select: { summary: true } },
            },
            orderBy: { rawYoutube: { viewCount: "desc" } },
            take: limitNum,
          })
        : [],

      // News: Order by recency, enriched content prioritized
      !type || type === "News"
        ? prisma.dataPoint.findMany({
            where: { ...baseWhere, type: "News" },
            include: {
              topic: { select: { id: true, name: true, slug: true } },
              subTopic: { select: { id: true, name: true, slug: true } },
              rawNews: true,
              enrichedNews: { select: { summary: true } },
              enrichedYoutube: { select: { summary: true } },
            },
            orderBy: { fetchedAt: "desc" },
            take: limitNum,
          })
        : [],
    ]);

    const rank = (dp: any): number => {
      const ageHours = Math.max(
        0,
        (Date.now() - new Date(dp.fetchedAt).getTime()) / (1000 * 60 * 60)
      );
      const recencyWeight = Math.exp(-ageHours / halfLifeHours);
      const hasSummary = Boolean(dp.enrichedNews?.summary || dp.enrichedYoutube?.summary);

      if (dp.type === "Reddit" && dp.rawReddit) {
        const base =
          1.4 * Math.log1p(Number(dp.rawReddit.score || 0)) +
          1.8 * Math.log1p(Number(dp.rawReddit.numComments || 0)) +
          (hasSummary ? 0.75 : 0);
        return base * recencyWeight + 0.2;
      }
      if (dp.type === "Youtube" && dp.rawYoutube) {
        const base =
          1.1 * Math.log1p(Number(dp.rawYoutube.viewCount || 0)) +
          1.6 * Math.log1p(Number(dp.rawYoutube.likeCount || 0)) +
          (hasSummary ? 1.1 : 0);
        return base * recencyWeight + 0.25;
      }
      if (dp.type === "News" && dp.rawNews) {
        const summaryLen = Number(dp.enrichedNews?.summary?.length || 0);
        const base =
          2.6 +
          (hasSummary ? 1.2 : 0) +
          Math.min(summaryLen / 500, 1.4);
        return base * recencyWeight + 0.3;
      }
      return 0;
    };

    const rankedItems: RankedItem[] = [...redditPosts, ...youtubePosts, ...newsPosts]
      .map((dp) => ({ dataPoint: dp, score: rank(dp) }))
      .sort((a, b) => b.score - a.score);

    // Diversify source ordering to avoid long streaks of a single type.
    const diversified: RankedItem[] = [];
    const pool = [...rankedItems];
    while (pool.length > 0 && diversified.length < limitNum) {
      const lastType = diversified.length
        ? diversified[diversified.length - 1].dataPoint.type
        : null;
      const prevType =
        diversified.length > 1
          ? diversified[diversified.length - 2].dataPoint.type
          : null;
      const avoidType = lastType && prevType && lastType === prevType ? lastType : null;
      let nextIndex = 0;
      if (avoidType) {
        const candidateIndex = pool.findIndex((p) => p.dataPoint.type !== avoidType);
        if (candidateIndex !== -1) {
          nextIndex = candidateIndex;
        }
      }
      diversified.push(pool.splice(nextIndex, 1)[0]);
    }

    const topItems = diversified;

    // Build trending topics from ranked candidates.
    const topicAgg = new Map<number, TrendingTopic>();
    for (const ranked of rankedItems) {
      const topic = ranked.dataPoint.topic;
      if (!topic?.id) continue;
      const existing = topicAgg.get(topic.id);
      if (existing) {
        existing.count += 1;
        existing.score += ranked.score;
      } else {
        topicAgg.set(topic.id, {
          id: topic.id,
          name: topic.name,
          slug: topic.slug,
          count: 1,
          score: ranked.score,
        });
      }
    }
    const trendingTopics = [...topicAgg.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, topicLimitNum);

    // Get saved IDs if user is authenticated
    let savedIds: Set<string> = new Set();
    if (req.user) {
      const saved = await prisma.savedItem.findMany({
        where: { userId: req.user.userId },
        select: { dataPointId: true },
      });
      savedIds = new Set(saved.map((s) => s.dataPointId));
    }

    // Transform to response format
    const feedItems = topItems.map(({ dataPoint: dp }) => {
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
        };
      }

      return {
        id: dp.id,
        type: dp.type,
        fetchedAt: dp.fetchedAt.toISOString(),
        topic: dp.topic,
        subTopic: dp.subTopic,
        content,
        enriched: dp.enrichedNews
          ? {
              summary: dp.enrichedNews.summary,
              hasFullContent: true,
            }
          : undefined,
        isSaved: savedIds.has(dp.id),
      };
    });

    return res.status(200).json({
      items: feedItems,
      trendingTopics,
      pagination: {
        nextCursor: null, // Trending doesn't support cursor pagination
        hasMore: false,
      },
      timeRange: selectedTimeRange,
    });
  } catch (error) {
    logger.error("Trending fetch error:", error);
    return res.status(500).json({ message: "Failed to fetch trending content" });
  }
});

export default trendingRouter;
