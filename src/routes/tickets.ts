import { createHash } from "crypto";
import https from "https";
import { Router, Request, Response } from "express";
import { XTrafikAPI } from "../services/xtrafik-api";
import { logger } from "../utils/logger";

function normalizePem(pem: string): string {
  return (pem || "").replace(/\\n/g, "\n").trim();
}
import {
  validateRegisterTicketRequest,
  validateTicketRequest,
  validateUpdateTicketPriceRequest,
} from "../middleware/validation";
import { ValidateTicketRequest, ValidateTicketResponse } from "../types";

const router = Router();

const NAMESPACE = "xtrafik-fixkod-v1";

function normalizeTicketId(ticketId: string | number): string {
  return String(ticketId);
}

function ticketIdToXtrafikId(ticketId: string | number): string {
  const hex = createHash("sha256")
    .update(NAMESPACE + "-" + normalizeTicketId(ticketId))
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const xtrafikAPI = new XTrafikAPI({
  baseUrl: process.env.XTRAFIK_BASE_URL || "",
  pathPrefix: process.env.XTRAFIK_PATH_PREFIX,
  clientCert: process.env.XTRAFIK_CLIENT_CERT,
  clientKey: process.env.XTRAFIK_CLIENT_KEY,
  clientKeyPassphrase: process.env.XTRAFIK_CLIENT_KEY_PASSPHRASE || undefined,
  caCert: process.env.XTRAFIK_CA_CERT,
  apiKey: process.env.XTRAFIK_API_KEY,
});

router.get("/test-xtrafik-transport", (req: Request, res: Response) => {
  const baseUrl = process.env.XTRAFIK_BASE_URL || "";
  const pathPrefix = (process.env.XTRAFIK_PATH_PREFIX ?? "/api").replace(/\/$/, "");
  const testId = "4b2f5e56-7d3e-4a9d-8e6e-0f7e2d9d3e8f";
  const url = new URL(`${baseUrl}${pathPrefix}/Tickets/${testId}`);
  const certPem = process.env.XTRAFIK_CLIENT_CERT?.includes("-----BEGIN") ? normalizePem(process.env.XTRAFIK_CLIENT_CERT) : undefined;
  const keyPem = process.env.XTRAFIK_CLIENT_KEY?.includes("-----BEGIN") ? normalizePem(process.env.XTRAFIK_CLIENT_KEY) : undefined;
  const caPem = process.env.XTRAFIK_CA_CERT?.includes("-----BEGIN") ? normalizePem(process.env.XTRAFIK_CA_CERT) : undefined;

  if (!certPem || !keyPem) {
    return res.status(500).json({ error: "XTRAFIK_CLIENT_CERT/XTRAFIK_CLIENT_KEY not set or not PEM" });
  }

  const opts: https.RequestOptions = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: "GET",
    cert: certPem,
    key: keyPem,
    ca: caPem,
    servername: url.hostname,
    rejectUnauthorized: true,
  };

  const start = Date.now();
  const reqOut = https.request(opts, (resp) => {
    let body = "";
    resp.on("data", (chunk) => { body += chunk; });
    resp.on("end", () => {
      const duration = Date.now() - start;
      logger.info("test-xtrafik-transport: raw Node https", { statusCode: resp.statusCode, duration });
      res.json({
        transport: "Node https (no axios)",
        statusCode: resp.statusCode,
        duration: `${duration}ms`,
        certSent: "cert/key set on TLS options",
        url: url.toString(),
        pathPrefix,
      });
    });
  });
  reqOut.on("error", (err) => {
    logger.error("test-xtrafik-transport error", { error: err.message });
    res.status(502).json({ error: err.message, transport: "Node https" });
  });
  reqOut.end();
});

router.post("/test-xtrafik-transport-post", (req: Request, res: Response) => {
  const baseUrl = process.env.XTRAFIK_BASE_URL || "";
  const pathPrefix = (process.env.XTRAFIK_PATH_PREFIX ?? "/api").replace(/\/$/, "");
  const url = new URL(`${baseUrl}${pathPrefix}/Tickets`);
  const certPem = process.env.XTRAFIK_CLIENT_CERT?.includes("-----BEGIN") ? normalizePem(process.env.XTRAFIK_CLIENT_CERT) : undefined;
  const keyPem = process.env.XTRAFIK_CLIENT_KEY?.includes("-----BEGIN") ? normalizePem(process.env.XTRAFIK_CLIENT_KEY) : undefined;
  const caPem = process.env.XTRAFIK_CA_CERT?.includes("-----BEGIN") ? normalizePem(process.env.XTRAFIK_CA_CERT) : undefined;

  if (!certPem || !keyPem) {
    return res.status(500).json({ error: "XTRAFIK_CLIENT_CERT/XTRAFIK_CLIENT_KEY not set or not PEM" });
  }

  const body = JSON.stringify({ ticketId: 99999999, price: 0 });
  const opts: https.RequestOptions = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname,
    method: "POST",
    cert: certPem,
    key: keyPem,
    ca: caPem,
    servername: url.hostname,
    rejectUnauthorized: true,
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const start = Date.now();
  const reqOut = https.request(opts, (resp) => {
    let resBody = "";
    resp.on("data", (chunk) => { resBody += chunk; });
    resp.on("end", () => {
      const duration = Date.now() - start;
      logger.info("test-xtrafik-transport-post: raw Node https", { statusCode: resp.statusCode, duration });
      res.json({
        transport: "Node https POST (no axios)",
        statusCode: resp.statusCode,
        duration: `${duration}ms`,
        url: url.toString(),
      });
    });
  });
  reqOut.on("error", (err) => {
    logger.error("test-xtrafik-transport-post error", { error: err.message });
    res.status(502).json({ error: err.message });
  });
  reqOut.write(body);
  reqOut.end();
});

router.get("/test-connection", async (req: Request, res: Response) => {
  const testTicketId = "4b2f5e56-7d3e-4a9d-8e6e-0f7e2d9d3e8f";
  const baseUrl = process.env.XTRAFIK_BASE_URL || "";
  const pathPrefix = (process.env.XTRAFIK_PATH_PREFIX ?? "/api").replace(/\/$/, "");
  const testUrl = `${baseUrl}${pathPrefix}/Tickets/${testTicketId}`;

  const diagnostics = {
    configuration: {
      baseUrl: baseUrl || "NOT SET",
      pathPrefix: pathPrefix || "(default /api)",
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

      const xtrafikId = ticketIdToXtrafikId(ticketId);
      const ticketStatus = await xtrafikAPI.getTicketStatus(xtrafikId);

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

router.post(
  "/register-ticket",
  validateRegisterTicketRequest,
  async (req: Request, res: Response) => {
    const { ticketId, price } = req.body;
    const numPrice = typeof req.body.price === "string" ? parseFloat(req.body.price) : Number(req.body.price);

    try {
      if (!process.env.XTRAFIK_BASE_URL) {
        return res.status(500).json({
          success: false,
          message: "Server configuration error",
        });
      }

      const xtrafikId = ticketIdToXtrafikId(ticketId);
      await xtrafikAPI.createTicket({
        id: xtrafikId,
        ticketId,
        price: numPrice,
      });

      res.status(201).json({
        success: true,
        ticketId,
        xtrafikId,
        price: numPrice,
        message: "Ticket registered",
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const axiosError = error && typeof error === "object" && "response" in error
        ? (error as { response?: { status?: number; data?: unknown } })
        : null;
      logger.error("Register ticket failed", {
        ticketId,
        error: errorMessage,
        xtrafikStatus: axiosError?.response?.status,
        xtrafikData: axiosError?.response?.data,
      });

      if (errorMessage.includes("Invalid client certificate")) {
        res.status(502).json({ success: false, message: errorMessage });
      } else if (errorMessage.includes("Bad request")) {
        res.status(400).json({ success: false, message: errorMessage });
      } else {
        res.status(500).json({ success: false, message: errorMessage });
      }
    }
  }
);

router.put(
  "/update-ticket/:id",
  validateUpdateTicketPriceRequest,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const numPrice = typeof req.body.price === "string" ? parseFloat(req.body.price) : Number(req.body.price);

    if (!/^\d{7,10}$/.test(id)) {
      return res.status(400).json({ success: false, message: "Ticket id must be 7–10 digits" });
    }

    try {
      if (!process.env.XTRAFIK_BASE_URL) {
        return res.status(500).json({
          success: false,
          message: "Server configuration error",
        });
      }

      const xtrafikId = ticketIdToXtrafikId(id);
      await xtrafikAPI.updateTicketPrice(xtrafikId, numPrice);

      res.status(204).send();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error("Update ticket price failed", { ticketId: id, error: errorMessage });

      if (errorMessage.includes("Invalid client certificate")) {
        res.status(502).json({ success: false, message: errorMessage });
      } else if (errorMessage.includes("Bad request")) {
        res.status(400).json({ success: false, message: errorMessage });
      } else if (errorMessage.includes("not found")) {
        res.status(404).json({ success: false, message: errorMessage });
      } else {
        res.status(500).json({ success: false, message: errorMessage });
      }
    }
  }
);

export default router;
