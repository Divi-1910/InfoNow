import { Router } from "express";
import authRouter from "./api/auth.js";
import userRouter from "./api/user.js";
import topicRouter from "./api/topic.js";

const mainRouter = Router();

mainRouter.use("/auth", authRouter);
mainRouter.use("/user", userRouter);
mainRouter.use("/topics", topicRouter);

export default mainRouter;
