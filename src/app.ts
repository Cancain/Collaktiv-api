import express, { Express, Request, Response, NextFunction } from "express";
import { logger } from "./utils/logger";
import { apiKeyAuth } from "./middleware/auth";
import ticketsRouter from "./routes/tickets";

export const createApp = (): Express => {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use((req: Request, res: Response, next: NextFunction) => {
    logger.info("Incoming request", {
      method: req.method,
      path: req.path,
      ip: req.ip || req.socket.remoteAddress,
    });
    next();
  });

  app.get("/health", (req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "xtrafik-api",
    });
  });

  app.use("/api", apiKeyAuth, ticketsRouter);

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error("Unhandled error", {
      error: err.message,
      stack: err.stack,
      path: req.path,
    });

    res.status(500).json({
      error: "Internal server error",
      message: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  });

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: "Not found",
      path: req.path,
    });
  });

  return app;
};
