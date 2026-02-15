import { Router } from "express";
import type { Response } from "express";
import type { AuthRequest } from "../middlewares/auth.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { prisma } from "../lib/prisma.js";
import { getOpenSearchClient, MEGA_INDEX } from "../lib/opensearch.js";
import { hitToFeedItem } from "../lib/megaTransform.js";
import { logger } from "../utils/logger.js";

const searchRouter = Router();

// Optional auth — we need it to populate isSaved
searchRouter.use((req: AuthRequest, _res, next) => {
  try {
    const token = req.cookies?.accessToken;
    if (token) req.user = verifyAccessToken(token);
  } catch {
    // no-op
  }
  next();
});

/**
 * GET /api/search
 * Query Parameters:
 * - q: search query (required for ranked results; omit for match_all)
 * - type: 'News' | 'Youtube' (optional)
 * - topicId: number (optional)
 * - subTopicId: number (optional)
 * - limit: number (default: 20, max: 50)
 */
searchRouter.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { q, type, topicId, subTopicId, limit = "20" } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit as string) || 20, 1), 50);

    const must: any[] = q
      ? [
          {
            multi_match: {
              query: q as string,
              fields: [
                "title^3",
                "description^2",
                "summary^2",
                "channel_title",
                "source_name",
              ],
              fuzziness: "AUTO",
            },
          },
        ]
      : [{ match_all: {} }];

    const filter: any[] = [];
    if (type) {
      filter.push({ term: { source_type: (type as string).toLowerCase() } });
    }
    if (topicId) {
      filter.push({ term: { topic_id: Number(topicId) } });
    }
    if (subTopicId) {
      filter.push({ term: { subtopic_id: Number(subTopicId) } });
    }

    const os = getOpenSearchClient();
    const result = await os.search({
      index: MEGA_INDEX,
      body: {
        query: { bool: { must, filter } },
        size: limitNum,
        sort: [
          { _score: { order: "desc" } },
          { fetch_timestamp: { order: "desc" } },
          { data_point_id: { order: "asc" } },
        ],
      },
    });

    const hits: any[] = result.body?.hits?.hits ?? [];
    const itemIds = hits.map((h: any) => h._source?.data_point_id ?? h._id);

    // Resolve isSaved for authenticated users
    let savedIds = new Set<string>();
    if (req.user && itemIds.length > 0) {
      const saved = await prisma.savedItem.findMany({
        where: { userId: req.user.userId, dataPointId: { in: itemIds } },
        select: { dataPointId: true },
      });
      savedIds = new Set(saved.map((s) => s.dataPointId));
    }

    const items = hits.map((h: any) => hitToFeedItem(h, savedIds));

    return res.status(200).json({ items });
  } catch (error) {
    logger.error("Search error:", error);
    return res.status(500).json({ message: "Search failed" });
  }
});

export default searchRouter;
