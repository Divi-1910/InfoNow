import { Router } from "express";
import type { Request, Response } from "express";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../utils/logger.js";

const topicRouter = Router();

topicRouter.get("/all-topics", async (req: AuthRequest, res: Response) => {
  try {
    const topics = await prisma.topic.findMany({
      include: {
        subTopics: true,
      },
    });
    return res.status(200).json({ topics });
  } catch (error) {
    logger.error("Get all topics error:", error);
    return res.status(500).json({ message: "Failed to fetch topics" });
  }
});

topicRouter.get("/:slug/subtopics", async (req: AuthRequest, res: Response) => {
  try {
    const { slug } = req.params;
    const topic = await prisma.topic.findUnique({
      where: { slug },
      include: { subTopics: true },
    });

    if (!topic) {
      return res.status(404).json({ message: "Topic not found" });
    }

    return res.status(200).json({ subtopics: topic.subTopics });
  } catch (error) {
    logger.error("Get subtopics error:", error);
    return res.status(500).json({ message: "Failed to fetch subtopics" });
  }
});

export default topicRouter;
