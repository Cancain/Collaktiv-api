import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import { logger } from "./utils/logger";
import { apiKeyAuth } from "./middleware/auth";
import ticketsRouter from "./routes/tickets";

export const createApp = (): Express => {
  const app = express();

  // Trust proxy headers from Fly.io (required for proper Host header handling)
  app.set('trust proxy', true);

  // CORS configuration
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim())
    : [];

  // Allowed subdomain patterns (for Lovable preview domains)
  const allowedSubdomainPatterns = [".lovable.app", ".lovableproject.com"];
  
  // Allowed production domains
  const allowedProductionDomains = ["collaktiv.se"];

  const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
      // Log the origin for debugging
      logger.info("CORS origin check", { origin, nodeEnv: process.env.NODE_ENV });

      if (!origin) {
        // Allow requests with no origin (e.g., mobile apps, Postman)
        return callback(null, true);
      }

      if (process.env.NODE_ENV === "development") {
        return callback(null, true);
      }

      // Check exact match from CORS_ORIGINS
      if (allowedOrigins.includes(origin)) {
        logger.info("CORS allowed: exact match", { origin });
        return callback(null, true);
      }

      // Check subdomain patterns (for Lovable preview domains)
      const isAllowedSubdomain = allowedSubdomainPatterns.some((pattern) =>
        origin.endsWith(pattern)
      );
      if (isAllowedSubdomain) {
        logger.info("CORS allowed: Lovable subdomain", { origin });
        return callback(null, true);
      }

      // Check production domains (with or without protocol)
      const originHost = origin.replace(/^https?:\/\//, "");
      const isAllowedProductionDomain = allowedProductionDomains.some((domain) =>
        originHost === domain || originHost.endsWith(`.${domain}`)
      );
      if (isAllowedProductionDomain) {
        logger.info("CORS allowed: production domain", { origin, originHost });
        return callback(null, true);
      }

      // Origin doesn't match any allowed pattern
      logger.warn("CORS rejected", { 
        origin, 
        originHost,
        allowedOrigins,
        allowedProductionDomains 
      });
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true, // Allow credentials, but don't require them
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
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
    // Handle CORS errors specifically
    if (err.message === "Not allowed by CORS") {
      logger.warn("CORS error", {
        error: err.message,
        path: req.path,
        origin: req.headers.origin,
        method: req.method,
      });
      return res.status(403).json({
        error: "CORS policy violation",
        message: "Origin not allowed",
      });
    }

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
    logger.warn("404 - Route not found", {
      method: req.method,
      path: req.path,
      origin: req.headers.origin,
      url: req.url,
    });
    res.status(404).json({
      error: "Not found",
      path: req.path,
    });
  });

  return app;
};
