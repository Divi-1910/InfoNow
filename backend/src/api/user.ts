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

export default userRouter;
