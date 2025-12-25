import { Router } from "express";
import type { Response } from "express";
import { authMiddleware, type AuthRequest } from "../middlewares/auth.js";
import { prisma } from "../lib/prisma.js";
import { logger } from "../utils/logger.js";

const userRouter = Router();

userRouter.use(authMiddleware);

userRouter.get("/me", async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: {
        userTopics: true,
        userSubTopics: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user });
  } catch (error) {
    logger.error("Get user error:", error);
    return res.status(500).json({ message: "Failed to fetch user" });
  }
});

userRouter.put("/profile", async (req: AuthRequest, res: Response) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: "Name is required" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { name: name.trim() },
    });

    return res.status(200).json({ user: updatedUser });
  } catch (error) {
    logger.error("Update profile error:", error);
    return res.status(500).json({ message: "Failed to update profile" });
  }
});

userRouter.post("/user-topics", async (req: AuthRequest, res: Response) => {
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

userRouter.post("/user-subtopics", async (req: AuthRequest, res: Response) => {
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

userRouter.get("/user-preferences", async (req: AuthRequest, res: Response) => {
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
});

export default userRouter;
