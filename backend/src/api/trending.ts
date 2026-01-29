import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../middlewares/auth.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../utils/logger.js";
import type { DataType, Prisma } from "@prisma/client";

const trendingRouter = Router();

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
 */
trendingRouter.get("/", optionalAuthMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const {
      topicId,
      subTopicId,
      type,
      limit = "20",
      timeRange = "24h",
    } = req.query;

    const limitNum = Math.min(Math.max(parseInt(limit as string) || 20, 1), 50);

    // Calculate time cutoff based on timeRange
    const now = new Date();
    let timeCutoff: Date;
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
            },
            orderBy: { fetchedAt: "desc" },
            take: limitNum,
          })
        : [],
    ]);

    // Calculate trending scores and combine
    interface TrendingItem {
      dataPoint: any;
      trendingScore: number;
    }

    const allItems: TrendingItem[] = [
      ...redditPosts.map((dp) => ({
        dataPoint: dp,
        trendingScore: (dp.rawReddit?.score || 0) + (dp.rawReddit?.numComments || 0) * 2,
      })),
      ...youtubePosts.map((dp) => ({
        dataPoint: dp,
        trendingScore:
          Number(dp.rawYoutube?.viewCount || 0) / 1000 +
          Number(dp.rawYoutube?.likeCount || 0),
      })),
      ...newsPosts.map((dp) => ({
        dataPoint: dp,
        // News: enriched articles get bonus score, plus recency factor
        trendingScore:
          (dp.enrichedNews ? 1000 : 0) +
          new Date(dp.fetchedAt).getTime() / 100000000,
      })),
    ];

    // Sort by trending score and take top items
    allItems.sort((a, b) => b.trendingScore - a.trendingScore);
    const topItems = allItems.slice(0, limitNum);

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
      pagination: {
        nextCursor: null, // Trending doesn't support cursor pagination
        hasMore: false,
      },
      timeRange,
    });
  } catch (error) {
    logger.error("Trending fetch error:", error);
    return res.status(500).json({ message: "Failed to fetch trending content" });
  }
});

export default trendingRouter;
