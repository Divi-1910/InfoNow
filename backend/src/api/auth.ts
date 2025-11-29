import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../utils/logger";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../lib/prisma";

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

    if (userPayload["iss"] != "accounts.google.com") {
      throw new Error("Invalid Issuer");
    }

    const userId = userPayload["sub"];
    const email = userPayload["email"];
    const name = userPayload["name"];
    const pictureUrl = userPayload["picture"];

    logger.info(`Successfully Verified User : ${email}`);

    const user = await prisma.user.findUnique({
      where: {
        email,
      },
      include: {
        topics: true,
        subTopics: true,
      },
    });

    if (!user) {
      const newUser = await prisma.user.create({
        data: {
          email,
          name,
          pictureUrl,
        },
      });

      logger.info(`Created new user : ${newUser.email}`);
      return res.status(200).json({
        message: "User created successfully",
        user: newUser,
        redirect: "/preferences",
      });
    } else {
      logger.info(`User already exists : ${user.email}`);
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

export default authRouter;
