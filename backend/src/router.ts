import { Router } from "express";
import authRouter from "./api/auth.js";
import userRouter from "./api/user.js";
import topicRouter from "./api/topic.js";
import feedRouter from "./api/feed.js";
import savedRouter from "./api/saved.js";
import trendingRouter from "./api/trending.js";

const mainRouter = Router();

mainRouter.use("/auth", authRouter);
mainRouter.use("/user", userRouter);
mainRouter.use("/topics", topicRouter);
mainRouter.use("/feed", feedRouter);
mainRouter.use("/saved", savedRouter);
mainRouter.use("/trending", trendingRouter);

export default mainRouter;
