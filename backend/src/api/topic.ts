import { Router } from "express";
import type { Request, Response } from "express";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../utils/logger.js";

const topicRouter = Router();

topicRouter.use(authMiddleware);

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

topicRouter.post("/user-topics", async (req: AuthRequest, res: Response) => {
  try {
    const { topicIds } = req.body;
    const userId = req.user!.userId;

    await prisma.userTopic.deleteMany({ where: { userId } });

    const userTopics = await prisma.userTopic.createMany({
      data: topicIds.map((topicId: number) => ({ userId, topicId })),
    });

    return res.status(200).json({ message: "Topics updated", userTopics });
  } catch (error) {
    logger.error("Update user topics error:", error);
    return res.status(500).json({ message: "Failed to update topics" });
  }
});

topicRouter.post("/user-subtopics", async (req: AuthRequest, res: Response) => {
  try {
    const { subTopicIds } = req.body;
    const userId = req.user!.userId;

    await prisma.userSubTopic.deleteMany({ where: { userId } });

    const userSubTopics = await prisma.userSubTopic.createMany({
      data: subTopicIds.map((subTopicId: number) => ({ userId, subTopicId })),
    });

    return res
      .status(200)
      .json({ message: "Subtopics updated", userSubTopics });
  } catch (error) {
    logger.error("Update user subtopics error:", error);
    return res.status(500).json({ message: "Failed to update subtopics" });
  }
});

topicRouter.get(
  "/user-preferences",
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.userId;
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          userTopics: { include: { topic: true } },
          userSubTopics: { include: { subTopic: true } },
        },
      });

      return res.status(200).json({
        topics: user?.userTopics.map((ut) => ut.topic) || [],
        subtopics: user?.userSubTopics.map((ust) => ust.subTopic) || [],
      });
    } catch (error) {
      logger.error("Get user preferences error:", error);
      return res.status(500).json({ message: "Failed to fetch preferences" });
    }
  }
);

export default topicRouter;
