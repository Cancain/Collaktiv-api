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
