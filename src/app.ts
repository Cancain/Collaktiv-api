import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { logger } from "./utils/logger";
import { apiKeyAuth } from "./middleware/auth";
import ticketsRouter from "./routes/tickets";

export const createApp = (): Express => {
  const app = express();

  // CORS configuration
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
    : [];

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (process.env.NODE_ENV === "development") {
        return callback(null, true);
      }

      if (allowedOrigins.length === 0) {
        return callback(
          new Error("CORS_ORIGINS must be configured in production")
        );
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  };

  app.use(cors(corsOptions));
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
