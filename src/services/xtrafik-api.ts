import https from "https";
import fs from "fs";
import { logger } from "../utils/logger";
import { Ticket, TicketStatus, TicketStatusResponse, UpdateTicketPriceDto, XTrafikConfig } from "../types";

function normalizePem(pem: string): string {
  if (typeof pem !== "string") return pem;
  return pem.replace(/\\n/g, "\n").trim();
}

export class XTrafikAPI {
  private baseUrl: string;
  private pathPrefix: string;
  private agentOptions: https.AgentOptions | null = null;
  private hostHeader: string;
  private readonly requestTimeoutMs = 30000;

  constructor(config: XTrafikConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.pathPrefix = (config.pathPrefix ?? "/api").replace(/\/$/, "");
    const url = new URL(this.baseUrl);
    this.hostHeader = url.host;

    const hasCert = !!config.clientCert;
    const hasKey = !!config.clientKey;
    if (config.clientCert && config.clientKey) {
      try {
        let cert = config.clientCert.includes("-----BEGIN")
          ? normalizePem(config.clientCert)
          : fs.readFileSync(config.clientCert, "utf8");
        let key = config.clientKey.includes("-----BEGIN")
          ? normalizePem(config.clientKey)
          : fs.readFileSync(config.clientKey, "utf8");
        let ca: string | undefined;
        if (config.caCert) {
          ca = config.caCert.includes("-----BEGIN") ? normalizePem(config.caCert) : fs.readFileSync(config.caCert, "utf8");
        }

        this.agentOptions = {
          cert,
          key,
          ca,
          rejectUnauthorized: true,
          servername: url.hostname,
          keepAlive: false,
        };
        if (config.clientKeyPassphrase) {
          this.agentOptions.passphrase = config.clientKeyPassphrase;
        }

        const certLooksValid = cert.includes("-----BEGIN") && cert.includes("-----END");
        logger.info("Client certificate loaded for X-trafik API", {
          withCaBundle: !!config.caCert,
          certFromEnv: config.clientCert.includes("-----BEGIN"),
          certPemValid: certLooksValid,
        });
      } catch (error) {
        logger.error("Failed to load client certificate", { error });
        throw new Error("Failed to load client certificate");
      }
    } else if (hasCert !== hasKey) {
      logger.warn("X-trafik client cert incomplete: only one of XTRAFIK_CLIENT_CERT and XTRAFIK_CLIENT_KEY is set; requests will not use client certificate");
    } else {
      logger.warn("X-trafik client certificate not configured (XTRAFIK_CLIENT_CERT and XTRAFIK_CLIENT_KEY); requests will not use client certificate");
    }
  }

  private requestRaw(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: string
  ): Promise<{ statusCode?: number; body: string }> {
    if (!this.agentOptions) {
      throw new Error("Client certificate not configured");
    }
    const url = new URL(`${this.baseUrl}${path}`);
    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      Host: this.hostHeader,
    };
    if (body) {
      headers["Content-Length"] = Buffer.byteLength(body);
    }
    const opts: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method,
      cert: this.agentOptions.cert,
      key: this.agentOptions.key,
      ca: this.agentOptions.ca,
      servername: url.hostname,
      rejectUnauthorized: this.agentOptions.rejectUnauthorized,
      headers,
    };

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();
      logger.info("X-trafik API request", { method: method.toLowerCase(), url: path });
      const req = https.request(opts, (resp) => {
        let resBody = "";
        resp.on("data", (chunk) => { resBody += chunk; });
        resp.on("end", () => {
          const durationMs = Date.now() - startedAt;
          logger.info("X-trafik API response", { status: resp.statusCode, url: path, durationMs });
          resolve({ statusCode: resp.statusCode, body: resBody });
        });
      });

      const hardTimeout = setTimeout(() => {
        req.destroy(new Error("Request timeout"));
      }, this.requestTimeoutMs);

      req.on("error", (err) => {
        clearTimeout(hardTimeout);
        reject(new Error(`Network error: ${err.message}`));
      });
      req.on("close", () => {
        clearTimeout(hardTimeout);
      });

      if (body) req.write(body);
      req.end();
    });
  }

  async getTicketStatus(
    ticketId: string | number
  ): Promise<TicketStatusResponse> {
    const path = `${this.pathPrefix}/Tickets/${ticketId}`;
    let response: { statusCode?: number; body: string };
    try {
      response = await this.requestRaw("GET", path);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Request timeout") || message.includes("Network error")) {
        response = await this.requestRaw("GET", path);
      } else {
        throw error;
      }
    }

    if (response.statusCode === 200) {
      try {
        const data = response.body ? JSON.parse(response.body) : {};
        logger.info("X-trafik API raw response received", { ticketId, status: 200, data });
        return data as TicketStatusResponse;
      } catch {
        throw new Error("Invalid JSON response from X-trafik");
      }
    }
    if (response.statusCode === 401 || response.statusCode === 403) {
      throw new Error("Invalid client certificate - access denied");
    }
    if (response.statusCode === 404) {
      logger.warn("X-trafik API: Ticket not found", { ticketId });
      throw new Error("Ticket not found");
    }
    if (response.statusCode === 500) {
      throw new Error("X-trafik API server error");
    }
    throw new Error(`Unexpected response status: ${response.statusCode}`);
  }

  async createTicket(ticket: Ticket): Promise<void> {
    const ticketId =
      typeof ticket.ticketId === "string" && /^\d+$/.test(ticket.ticketId)
        ? parseInt(ticket.ticketId, 10)
        : ticket.ticketId;
    const payload = {
      id: ticket.id ?? undefined,
      ticketId,
      price: ticket.price,
    };
    const body = JSON.stringify(payload);
    const response = await this.requestRaw("POST", `${this.pathPrefix}/Tickets`, body);
    if (response.statusCode === 201) return;
    if (response.statusCode === 400) {
      throw new Error("Bad request: invalid ticket data");
    }
    if (response.statusCode === 401 || response.statusCode === 403) {
      throw new Error("Invalid client certificate - access denied");
    }
    if (response.statusCode === 500) {
      const isDuplicate =
        response.body.includes("PRIMARY KEY") ||
        response.body.includes("duplicate key") ||
        response.body.includes("PK_TicketStatus");
      throw new Error(
        isDuplicate
          ? "Denna biljett är redan registrerad hos X-trafik. Du kan inte få poäng två gånger för samma biljett."
          : "X-trafik kunde inte registrera biljetten (serverfel). Försök igen senare eller kontakta Region Gävleborg."
      );
    }
    throw new Error(`Unexpected response status: ${response.statusCode}`);
  }

  async updateTicketPrice(ticketId: string | number, price: number): Promise<void> {
    const body = JSON.stringify({ price });
    const response = await this.requestRaw("PUT", `${this.pathPrefix}/Tickets/${ticketId}`, body);
    if (response.statusCode === 204) return;
    if (response.statusCode === 400) throw new Error("Bad request: invalid price");
    if (response.statusCode === 401 || response.statusCode === 403) throw new Error("Invalid client certificate - access denied");
    if (response.statusCode === 404) throw new Error("Ticket not found");
    throw new Error(`Unexpected response status: ${response.statusCode}`);
  }
}
