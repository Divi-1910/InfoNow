import { Router } from "express";
import type { Response } from "express";
import { authMiddleware } from "../middlewares/auth.js";
import type { AuthRequest } from "../middlewares/auth.js";
import { prisma } from "../lib/prisma.js";
import { getOpenSearchClient, MEGA_INDEX } from "../lib/opensearch.js";
import { logger } from "../utils/logger.js";

const adminRouter = Router();

// Parse allowed admin user IDs from ADMIN_USER_IDS env var (comma-separated integers).
// Example: ADMIN_USER_IDS=1,42
const adminUserIds = new Set(
  (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n))
);

/**
 * POST /api/admin/opensearch/backfill
 *
 * One-time operation: indexes all existing DataPoints into mega_index.
 * Responds immediately with { status: "started" } and runs the backfill async.
 * Uses plain index (not op_type=create) so re-runs are safe / idempotent.
 * Restricted to user IDs listed in ADMIN_USER_IDS env var.
 */
adminRouter.post("/opensearch/backfill", authMiddleware, async (req: AuthRequest, res: Response) => {
  if (!req.user || !adminUserIds.has(req.user.userId)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  // Respond immediately — backfill runs in background
  res.status(202).json({ status: "started" });

  runBackfill().catch((err) => {
    logger.error("Backfill failed:", err);
  });
});

async function runBackfill() {
  const os = getOpenSearchClient();
  const BATCH = 500;
  let cursor: string | undefined;
  let total = 0;

  logger.info("OpenSearch backfill: starting");

  while (true) {
    const dataPoints = await prisma.dataPoint.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      include: {
        topic: { select: { id: true, name: true, slug: true } },
        subTopic: { select: { id: true, name: true, slug: true } },
        rawNews: true,
        rawYoutube: true,
        enrichedNews: { select: { summary: true } },
        enrichedYoutube: { select: { summary: true } },
      },
    });

    if (dataPoints.length === 0) break;
    cursor = dataPoints[dataPoints.length - 1].id;

    const body: any[] = [];
    for (const dp of dataPoints) {
      const hasEnriched = !!(dp.enrichedNews || dp.enrichedYoutube);
      const sourceType = dp.type.toLowerCase(); // "news", "youtube", "reddit"

      let doc: Record<string, any> = {
        data_point_id: dp.id,
        source_type: sourceType,
        fetch_timestamp: dp.fetchedAt.toISOString(),
        topic_id: dp.topic?.id ?? null,
        topic_name: dp.topic?.name ?? "",
        topic_slug: dp.topic?.slug ?? "",
        subtopic_id: dp.subTopic?.id ?? null,
        subtopic_name: dp.subTopic?.name ?? "",
        subtopic_slug: dp.subTopic?.slug ?? "",
        has_enriched: hasEnriched,
      };

      if (dp.type === "News" && dp.rawNews) {
        doc = {
          ...doc,
          title: dp.rawNews.title,
          description: dp.rawNews.description ?? null,
          published_at: dp.rawNews.publishedAt.toISOString(),
          url: dp.rawNews.url,
          source_name: dp.rawNews.sourceName ?? null,
          author: dp.rawNews.author ?? null,
          image_url: dp.rawNews.imageUrl ?? null,
          summary: dp.enrichedNews?.summary ?? null,
        };
      } else if (dp.type === "Youtube" && dp.rawYoutube) {
        doc = {
          ...doc,
          title: dp.rawYoutube.title,
          description: dp.rawYoutube.description ?? null,
          published_at: dp.rawYoutube.publishedAt.toISOString(),
          video_id: dp.rawYoutube.videoId,
          channel_id: dp.rawYoutube.channelId,
          channel_title: dp.rawYoutube.channelTitle,
          thumbnail_url: dp.rawYoutube.thumbnailUrl ?? null,
          duration: dp.rawYoutube.duration ?? null,
          view_count: Number(dp.rawYoutube.viewCount),
          like_count: Number(dp.rawYoutube.likeCount),
          summary: dp.enrichedYoutube?.summary ?? null,
        };
      } else {
        // Reddit or unknown — skip
        continue;
      }

      body.push({ index: { _index: MEGA_INDEX, _id: dp.id } });
      body.push(doc);
    }

    if (body.length > 0) {
      const result = await os.bulk({ body });
      const batchSize = body.length / 2;
      if (result.body.errors) {
        const failed = (result.body.items as any[]).filter((i) => i.index?.error).length;
        logger.warn(`OpenSearch backfill: ${failed}/${batchSize} docs failed in this batch`);
        total += batchSize - failed;
      } else {
        total += batchSize;
      }
      logger.info(`OpenSearch backfill: indexed ${total} documents so far`);
    }
  }

  logger.info(`OpenSearch backfill: complete — ${total} documents indexed`);
}

export default adminRouter;
