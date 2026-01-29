import type { Request, Response, NextFunction } from "express";

export const originMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Skip OPTIONS requests (CORS preflight) - they don't include custom headers
  if (req.method === "OPTIONS") {
    return next();
  }

  const originHeader = req.headers["x-origin"];

  if (originHeader !== "Info" && originHeader !== "Ingest") {
    return res.status(403).json({ message: "Forbidden" });
  }

  next();
};
