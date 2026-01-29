import { Router } from "express";
import type { Response } from "express";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../utils/logger.js";
import type { DataType, Prisma } from "@prisma/client";

const savedRouter = Router();

// All routes require authentication
savedRouter.use(authMiddleware);

/**
 * POST /api/saved/:dataPointId
 * Save an item to user's saved list
 */
savedRouter.post("/:dataPointId", async (req: AuthRequest, res: Response) => {
  try {
    const { dataPointId } = req.params;
    const userId = req.user!.userId;

    // Check if dataPoint exists
    const dataPoint = await prisma.dataPoint.findUnique({
      where: { id: dataPointId },
    });

    if (!dataPoint) {
      return res.status(404).json({ message: "Item not found" });
    }

    // Create saved item (upsert to avoid duplicates)
    const savedItem = await prisma.savedItem.upsert({
      where: {
        userId_dataPointId: { userId, dataPointId },
      },
      create: { userId, dataPointId },
      update: {}, // No update needed, just return existing
    });

    return res.status(200).json({ saved: true, savedAt: savedItem.savedAt });
  } catch (error) {
    logger.error("Save item error:", error);
    return res.status(500).json({ message: "Failed to save item" });
  }
});

/**
 * DELETE /api/saved/:dataPointId
 * Remove an item from user's saved list
 */
savedRouter.delete("/:dataPointId", async (req: AuthRequest, res: Response) => {
  try {
    const { dataPointId } = req.params;
    const userId = req.user!.userId;

    await prisma.savedItem.deleteMany({
      where: { userId, dataPointId },
    });

    return res.status(200).json({ saved: false });
  } catch (error) {
    logger.error("Unsave item error:", error);
    return res.status(500).json({ message: "Failed to unsave item" });
  }
});

/**
 * GET /api/saved
 * Get user's saved items with pagination and filters
 *
 * Query params: topicId, subTopicId, type, cursor, limit, sortOrder
 */
savedRouter.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const {
      topicId,
      subTopicId,
      type,
      cursor,
      limit = "20",
      sortOrder = "desc",
    } = req.query;

    const limitNum = Math.min(Math.max(parseInt(limit as string) || 20, 1), 50);
    const userId = req.user!.userId;

    // Build where clause for the DataPoint filter
    const dataPointWhere: Prisma.DataPointWhereInput = {};

    if (topicId) dataPointWhere.topicId = parseInt(topicId as string);
    if (subTopicId) dataPointWhere.subTopicId = parseInt(subTopicId as string);
    if (type) dataPointWhere.type = type as DataType;

    // Build SavedItem where clause
    const savedItemWhere: Prisma.SavedItemWhereInput = {
      userId,
      dataPoint: dataPointWhere,
    };

    // Cursor-based pagination using savedItem.id
    if (cursor) {
      savedItemWhere.id = { lt: parseInt(cursor as string) };
    }

    const savedItems = await prisma.savedItem.findMany({
      where: savedItemWhere,
      include: {
        dataPoint: {
          include: {
            topic: { select: { id: true, name: true, slug: true } },
            subTopic: { select: { id: true, name: true, slug: true } },
            rawNews: true,
            rawReddit: true,
            rawYoutube: true,
            enrichedNews: { select: { summary: true } },
          },
        },
      },
      orderBy: { savedAt: sortOrder as "asc" | "desc" },
      take: limitNum + 1,
    });

    const hasMore = savedItems.length > limitNum;
    const items = hasMore ? savedItems.slice(0, -1) : savedItems;
    const nextCursor = hasMore ? String(items[items.length - 1]?.id) : null;

    // Transform to feed item format (with isSaved: true)
    const feedItems = items.map((si) => transformDataPoint(si.dataPoint, si.savedAt));

    return res.status(200).json({
      items: feedItems,
      pagination: { nextCursor, hasMore },
    });
  } catch (error) {
    logger.error("Get saved items error:", error);
    return res.status(500).json({ message: "Failed to fetch saved items" });
  }
});

/**
 * GET /api/saved/ids
 * Get just the dataPointIds of saved items (for bulk checking save status)
 */
savedRouter.get("/ids", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;

    const savedItems = await prisma.savedItem.findMany({
      where: { userId },
      select: { dataPointId: true },
    });

    return res.status(200).json({
      savedIds: savedItems.map((si) => si.dataPointId),
    });
  } catch (error) {
    logger.error("Get saved IDs error:", error);
    return res.status(500).json({ message: "Failed to fetch saved IDs" });
  }
});

// Helper function to transform DataPoint to FeedItem format
function transformDataPoint(dp: any, savedAt?: Date) {
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
    isSaved: true,
    savedAt: savedAt?.toISOString(),
  };
}

export default savedRouter;
