import dotenv from "dotenv";
import { createApp } from "./app";
import { logger } from "./utils/logger";

dotenv.config();

const PORT = process.env.PORT || 3000;

const requiredEnvVars = ["XTRAFIK_BASE_URL"];
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error("Missing required environment variables", {
    missing: missingVars,
  });
  process.exit(1);
}

const app = createApp();

app.listen(PORT, () => {
  logger.info(`X-trafik API server started`, {
    port: PORT,
    environment: process.env.NODE_ENV || "development",
    xtrafikBaseUrl: process.env.XTRAFIK_BASE_URL,
  });
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});
