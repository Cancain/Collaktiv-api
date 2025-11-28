import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";

export const apiKeyAuth = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const apiKey = process.env.API_KEY;

  if (!apiKey || apiKey.trim() === "") {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    logger.warn("API request without authorization header", {
      ip: req.ip,
      path: req.path,
    });
    res.status(401).json({ error: "Missing authorization header" });
    return;
  }

  const token = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7)
    : authHeader;

  if (token !== apiKey) {
    logger.warn("API request with invalid API key", {
      ip: req.ip,
      path: req.path,
    });
    res.status(403).json({ error: "Invalid API key" });
    return;
  }

  next();
};
