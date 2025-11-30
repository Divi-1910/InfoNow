import { Router } from "express";
import authRouter from "./api/auth.js";
import userRouter from "./api/user.js";

const mainRouter = Router();

mainRouter.use("/auth", authRouter);
mainRouter.use("/user", userRouter);

export default mainRouter;
