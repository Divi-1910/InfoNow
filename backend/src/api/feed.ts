import { Router } from "express";
import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../middlewares/auth.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../utils/logger.js";
import type { DataType, Prisma } from "@prisma/client";

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
 * Query Parameters:
 * - mode: 'personalized' | 'browse' (default: personalized if authenticated)
 * - topicId: number - filter by specific topic
 * - subTopicId: number - filter by specific subtopic
 * - type: 'News' | 'Reddit' | 'Youtube' - filter by source type
 * - dateFrom: ISO date string - filter by date range start
 * - dateTo: ISO date string - filter by date range end
 * - cursor: string - DataPoint.id for cursor-based pagination
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

    // Parse and validate limit
    const limitNum = Math.min(Math.max(parseInt(limit as string) || 20, 1), 50);

    // Determine mode - default to personalized if authenticated
    const feedMode = mode as string || (req.user ? "personalized" : "browse");

    // Build where clause
    const where: Prisma.DataPointWhereInput = {};

    // Personalized mode: filter by user's subscribed topics/subtopics
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

      // If user has subscriptions, filter by them
      if (topicIds.length > 0 || subTopicIds.length > 0) {
        where.OR = [
          ...(topicIds.length > 0 ? [{ topicId: { in: topicIds } }] : []),
          ...(subTopicIds.length > 0 ? [{ subTopicId: { in: subTopicIds } }] : []),
        ];
      }
      // If no subscriptions, show nothing in personalized mode (user needs to subscribe)
      else {
        return res.status(200).json({
          items: [],
          pagination: { nextCursor: null, hasMore: false },
          message: "Subscribe to topics to see personalized feed",
        });
      }
    }

    // Explicit filters (apply in both modes)
    if (topicId) {
      where.topicId = parseInt(topicId as string);
    }
    if (subTopicId) {
      where.subTopicId = parseInt(subTopicId as string);
    }
    if (type) {
      where.type = type as DataType;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      where.fetchedAt = {
        ...(dateFrom && { gte: new Date(dateFrom as string) }),
        ...(dateTo && { lte: new Date(dateTo as string) }),
      };
    }

    // Cursor-based pagination
    if (cursor) {
      where.id = { lt: cursor as string };
    }

    // Query with includes
    const dataPoints = await prisma.dataPoint.findMany({
      where,
      include: {
        topic: { select: { id: true, name: true, slug: true } },
        subTopic: { select: { id: true, name: true, slug: true } },
        rawNews: true,
        rawReddit: true,
        rawYoutube: true,
        enrichedNews: { select: { summary: true } },
      },
      orderBy: { fetchedAt: sortOrder as "asc" | "desc" },
      take: limitNum + 1, // +1 to check if there are more items
    });

    // Determine pagination
    const hasMore = dataPoints.length > limitNum;
    const items = hasMore ? dataPoints.slice(0, -1) : dataPoints;
    const nextCursor = hasMore ? items[items.length - 1]?.id : null;

    // Get saved IDs if user is authenticated
    let savedIds: Set<string> = new Set();
    if (req.user && items.length > 0) {
      const saved = await prisma.savedItem.findMany({
        where: {
          userId: req.user.userId,
          dataPointId: { in: items.map((dp) => dp.id) },
        },
        select: { dataPointId: true },
      });
      savedIds = new Set(saved.map((s) => s.dataPointId));
    }

    // Transform to response format
    const feedItems = items.map((dp) => {
      // Determine content based on type
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
        nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    logger.error("Feed fetch error:", error);
    return res.status(500).json({ message: "Failed to fetch feed" });
  }
});

export default feedRouter;
