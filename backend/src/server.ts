import dotenv from "dotenv";
import express from "express";
import type { Application, Request, Response } from "express";
import mainRouter from "./router.js";
import { httpLogger } from "./middlewares/httpLogger.js";
import { logger } from "./utils/logger.js";
import { prisma } from "./lib/prisma.js";
import cors from "cors";
import cookieParser from "cookie-parser";
import { originMiddleware } from "./middlewares/origin.js";

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT;

app.use(httpLogger);
app.use(originMiddleware);

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Origin"],
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

app.use("/api", mainRouter);

app.get("/healthy", (req: Request, res: Response) => {
  logger.info("Server is healthy");
  res.send("Server is healthy");
});

app.listen(PORT, async () => {
  logger.info(`Server running on the port ${PORT}`);

  try {
    await prisma.$connect();
    logger.info("Database connected successfully");
  } catch (error) {
    logger.error("Database connection failed:", error);
  }
});
