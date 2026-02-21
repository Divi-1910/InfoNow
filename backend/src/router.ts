import { Router } from "express";
import authRouter from "./api/auth.js";
import userRouter from "./api/user.js";
import topicRouter from "./api/topic.js";
import feedRouter from "./api/feed.js";
import savedRouter from "./api/saved.js";
import trendingRouter from "./api/trending.js";
import searchRouter from "./api/search.js";
import adminRouter from "./api/admin.js";
import assistantRouter from "./api/assistant.js";

const mainRouter = Router();

mainRouter.use("/auth", authRouter);
mainRouter.use("/user", userRouter);
mainRouter.use("/topics", topicRouter);
mainRouter.use("/feed", feedRouter);
mainRouter.use("/saved", savedRouter);
mainRouter.use("/trending", trendingRouter);
mainRouter.use("/search", searchRouter);
mainRouter.use("/admin", adminRouter);
mainRouter.use("/assistant", assistantRouter);

export default mainRouter;
