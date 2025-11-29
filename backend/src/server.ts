import dotenv from "dotenv";
dotenv.config();

import express from "express";
import type { Application, Request, Response } from "express";
import mainRouter from "./router.js";
import { httpLogger } from "./middlewares/httpLogger.js";
import { logger } from "./utils/logger.js";

const app: Application = express();
const PORT = process.env.PORT;

app.use(httpLogger);
app.use(express.json());

app.use("/api", mainRouter);

app.get("/healthy", (req: Request, res: Response) => {
  logger.info("Server is healthy");
  res.send("Server is healthy");
});

app.listen(PORT, () => {
  logger.info(`Server running on the port ${PORT}`);
});
