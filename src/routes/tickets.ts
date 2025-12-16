import { Router, Request, Response } from "express";
import { XTrafikAPI } from "../services/xtrafik-api";
import { logger } from "../utils/logger";
import { validateTicketRequest } from "../middleware/validation";
import { ValidateTicketRequest, ValidateTicketResponse } from "../types";

const router = Router();

const xtrafikAPI = new XTrafikAPI({
  baseUrl: process.env.XTRAFIK_BASE_URL || "",
  clientCert: process.env.XTRAFIK_CLIENT_CERT,
  clientKey: process.env.XTRAFIK_CLIENT_KEY,
});

router.get("/test-connection", async (req: Request, res: Response) => {
  const testTicketId = "4b2f5e56-7d3e-4a9d-8e6e-0f7e2d9d3e8f";
  const baseUrl = process.env.XTRAFIK_BASE_URL || "";
  const testUrl = `${baseUrl}/api/Tickets/${testTicketId}`;

  const diagnostics = {
    configuration: {
      baseUrl: baseUrl || "NOT SET",
      hasClientCert: !!process.env.XTRAFIK_CLIENT_CERT,
      hasClientKey: !!process.env.XTRAFIK_CLIENT_KEY,
      fullTestUrl: testUrl,
    },
    test: {
      ticketId: testTicketId,
      timestamp: new Date().toISOString(),
    },
  };

  logger.info("Test connection request", diagnostics);

  const startTime = Date.now();

  try {
    if (!baseUrl) {
      return res.status(500).json({
        ...diagnostics,
        error: "XTRAFIK_BASE_URL not configured",
      });
    }

    const ticketStatus = await xtrafikAPI.getTicketStatus(testTicketId);
    const duration = Date.now() - startTime;

    res.json({
      ...diagnostics,
      success: true,
      result: ticketStatus,
      duration: `${duration}ms`,
      message: "Connection successful!",
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error("Test connection failed", {
      ...diagnostics,
      error: errorMessage,
      duration: `${duration}ms`,
    });

    res.status(500).json({
      ...diagnostics,
      success: false,
      error: errorMessage,
      errorDetails:
        process.env.NODE_ENV === "development" ? errorStack : undefined,
      duration: `${duration}ms`,
      message: "Connection test failed",
    });
  }
});

router.post(
  "/validate-ticket",
  validateTicketRequest,
  async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { ticketId } = req.body as ValidateTicketRequest;
    const clientIp = req.ip || req.socket.remoteAddress || "unknown";

    logger.info("Ticket validation request", {
      ticketId,
      ip: clientIp,
      timestamp: new Date().toISOString(),
    });

    try {
      if (!process.env.XTRAFIK_BASE_URL) {
        logger.error("X-trafik API base URL not configured");
        return res.status(500).json({
          success: false,
          ticketId,
          status: "NotValidated",
          message: "Server configuration error",
        } as ValidateTicketResponse);
      }

      const ticketStatus = await xtrafikAPI.getTicketStatus(ticketId);

      const response: ValidateTicketResponse = {
        success: true,
        ticketId,
        status: ticketStatus.result,
      };

      const duration = Date.now() - startTime;
      logger.info("Ticket validation completed", {
        ticketId,
        status: ticketStatus.result,
        ip: clientIp,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      res.json(response);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      logger.error("Ticket validation failed", {
        ticketId,
        error: errorMessage,
        ip: clientIp,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      let status: "OK" | "Rejected" | "NotValidated" = "NotValidated";
      if (errorMessage.includes("not found")) {
        status = "Rejected";
      }

      const response: ValidateTicketResponse = {
        success: false,
        ticketId,
        status,
        message: errorMessage,
      };

      if (errorMessage.includes("Invalid client certificate")) {
        res.status(502).json(response);
      } else if (errorMessage.includes("not found")) {
        res.status(404).json(response);
      } else {
        res.status(500).json(response);
      }
    }
  }
);

export default router;
