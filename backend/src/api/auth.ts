import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../utils/logger";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../lib/prisma";
import {
  generateAccessToken,
  generateRefreshToken,
  storeRefreshToken,
  verifyRefreshToken,
  deleteRefreshToken,
} from "../utils/jwt.js";

const authRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID) {
  logger.error("GOOGLE_CLIENT_ID not found in the environment variables");
  throw new Error("GOOGLE_CLIENT_ID not found in the environment variables");
}

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

authRouter.post("/google-login", async (req: Request, res: Response) => {
  const { data } = req.body;
  const token: string = data?.token;

  if (!token) {
    logger.error("No token found in the request");
    return res.status(400).send("No token found in the request");
  }
  logger.info(
    `Got Google token for authentication , Token Length ${token.length}`
  );

  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });

    const userPayload = ticket.getPayload();

    if (!userPayload) {
      logger.error("No user payload found in the google token");
      throw new Error("No user payload found in the google token");
    }

    const userId = userPayload["sub"];
    const email = userPayload["email"];
    const name = userPayload["name"];
    const pictureUrl = userPayload["picture"];

    logger.info(`Successfully Verified User : ${email}`);

    const user = await prisma.user.findUnique({
      where: {
        email: email!,
      },
      include: {
        userTopics: true,
        userSubTopics: true,
      },
    });

    if (!user) {
      const newUser = await prisma.user.create({
        data: {
          email: email!,
          name: name!,
          pictureUrl: pictureUrl!,
        },
      });

      logger.info(`Created new user : ${newUser.email}`);

      const accessToken = generateAccessToken({
        userId: newUser.id,
        email: newUser.email,
      });
      const refreshToken = generateRefreshToken({
        userId: newUser.id,
        email: newUser.email,
      });
      await storeRefreshToken(newUser.id, refreshToken);

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000, // 15 minutes
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return res.status(200).json({
        message: "User created successfully",
        user: newUser,
        redirect: "/home?modal=preferences",
      });
    } else {
      logger.info(`User already exists : ${user.email}`);

      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
      });
      const refreshToken = generateRefreshToken({
        userId: user.id,
        email: user.email,
      });
      await storeRefreshToken(user.id, refreshToken);

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 15 * 60 * 1000,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.status(200).json({
        message: "User Already Exists",
        user: user,
        redirect: "/home",
      });
    }
  } catch (error) {
    logger.error("Error verifying Google token:", error);
    return res.status(401).json({
      message: "Authentication failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

authRouter.post("/refresh", async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (!refreshToken) {
      return res
        .status(401)
        .json({ message: "Refresh token not found", redirect: "/" });
    }

    const payload = verifyRefreshToken(refreshToken);

    const tokenExists = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!tokenExists) {
      return res
        .status(401)
        .json({ message: "Invalid refresh token", redirect: "/" });
    }

    const newAccessToken = generateAccessToken({
      userId: payload.userId,
      email: payload.email,
    });

    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 15 * 60 * 1000,
    });

    return res.status(200).json({ message: "Token refreshed" });
  } catch (error) {
    logger.error("Refresh token error:", error);
    return res
      .status(401)
      .json({ message: "Invalid refresh token", redirect: "/" });
  }
});

authRouter.post("/logout", async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken;

    if (refreshToken) {
      await deleteRefreshToken(refreshToken);
    }

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (error) {
    logger.error("Logout error:", error);
    return res.status(500).json({ message: "Logout failed" });
  }
});

export default authRouter;
