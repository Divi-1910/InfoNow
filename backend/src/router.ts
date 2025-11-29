import { Router } from "express";
import authRouter from "./api/auth.js";

const mainRouter = Router();

mainRouter.use("/auth", authRouter);

export default mainRouter;
