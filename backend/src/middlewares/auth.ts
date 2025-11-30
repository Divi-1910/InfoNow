import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { logger } from "../utils/logger.js";

export interface AuthRequest extends Request {
  user?: {
    userId: number;
    email: string;
  };
}

export const authMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const accessToken = req.cookies.accessToken;

    if (!accessToken) {
      return res.status(401).json({ message: "Unauthorized", redirect: "/" });
    }

    const payload = verifyAccessToken(accessToken);
    req.user = payload;
    next();
  } catch (error) {
    logger.error("Auth middleware error:", error);
    return res.status(401).json({ message: "Invalid token", redirect: "/" });
  }
};
