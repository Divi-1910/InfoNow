import type { Request, Response, NextFunction } from "express";

export const originMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const originHeader = req.headers["x-origin"];

  if (originHeader !== "Info" && originHeader !== "Ingest") {
    return res.status(403).json({ message: "Forbidden" });
  }

  next();
};
