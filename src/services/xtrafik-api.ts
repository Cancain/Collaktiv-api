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

  async getTicketStatus(
    ticketId: string | number
  ): Promise<TicketStatusResponse> {
    if (!this.agentOptions) {
      throw new Error("Client certificate not configured");
    }
    const url = new URL(`${this.baseUrl}${this.pathPrefix}/Tickets/${ticketId}`);
    const opts: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "GET",
      cert: this.agentOptions.cert,
      key: this.agentOptions.key,
      ca: this.agentOptions.ca,
      servername: url.hostname,
      rejectUnauthorized: this.agentOptions.rejectUnauthorized,
      headers: {
        "Content-Type": "application/json",
        Host: this.hostHeader,
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(opts, (resp) => {
        let resBody = "";
        resp.on("data", (chunk) => { resBody += chunk; });
        resp.on("end", () => {
          logger.info("X-trafik API request", { method: "get", url: `${this.pathPrefix}/Tickets/${ticketId}` });
          logger.info("X-trafik API response", { status: resp.statusCode, url: `${this.pathPrefix}/Tickets/${ticketId}` });
          if (resp.statusCode === 200) {
            try {
              const data = resBody ? JSON.parse(resBody) : {};
              logger.info("X-trafik API raw response received", { ticketId, status: 200, data });
              return resolve(data as TicketStatusResponse);
            } catch {
              return reject(new Error("Invalid JSON response from X-trafik"));
            }
          }
          if (resp.statusCode === 401 || resp.statusCode === 403) {
            return reject(new Error("Invalid client certificate - access denied"));
          }
          if (resp.statusCode === 404) {
            logger.warn("X-trafik API: Ticket not found", { ticketId });
            return reject(new Error("Ticket not found"));
          }
          if (resp.statusCode === 500) {
            return reject(new Error("X-trafik API server error"));
          }
          reject(new Error(`Unexpected response status: ${resp.statusCode}`));
        });
      });
      req.on("error", (err) => reject(new Error(`Network error: ${err.message}`)));
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
      req.end();
    });
  }

  async createTicket(ticket: Ticket): Promise<void> {
    if (!this.agentOptions) {
      throw new Error("Client certificate not configured");
    }
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
    const url = new URL(`${this.baseUrl}${this.pathPrefix}/Tickets`);
    const opts: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "POST",
      cert: this.agentOptions.cert,
      key: this.agentOptions.key,
      ca: this.agentOptions.ca,
      servername: url.hostname,
      rejectUnauthorized: this.agentOptions.rejectUnauthorized,
      headers: {
        "Content-Type": "application/json",
        Host: this.hostHeader,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(opts, (resp) => {
        let resBody = "";
        resp.on("data", (chunk) => { resBody += chunk; });
        resp.on("end", () => {
          logger.info("X-trafik API request", { method: "post", url: `${this.pathPrefix}/Tickets` });
          logger.info("X-trafik API response", { status: resp.statusCode, url: `${this.pathPrefix}/Tickets` });
          if (resp.statusCode === 201) {
            return resolve();
          }
          if (resp.statusCode === 400) {
            return reject(new Error("Bad request: invalid ticket data"));
          }
          if (resp.statusCode === 401 || resp.statusCode === 403) {
            return reject(new Error("Invalid client certificate - access denied"));
          }
          if (resp.statusCode === 500) {
            const isDuplicate =
              resBody.includes("PRIMARY KEY") ||
              resBody.includes("duplicate key") ||
              resBody.includes("PK_TicketStatus");
            return reject(
              new Error(
                isDuplicate
                  ? "Denna biljett är redan registrerad hos X-trafik. Du kan inte få poäng två gånger för samma biljett."
                  : "X-trafik kunde inte registrera biljetten (serverfel). Försök igen senare eller kontakta Region Gävleborg."
              )
            );
          }
          reject(new Error(`Unexpected response status: ${resp.statusCode}`));
        });
      });
      req.on("error", (err) => reject(new Error(`Network error: ${err.message}`)));
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
      req.write(body);
      req.end();
    });
  }

  async updateTicketPrice(ticketId: string | number, price: number): Promise<void> {
    if (!this.agentOptions) {
      throw new Error("Client certificate not configured");
    }
    const body = JSON.stringify({ price });
    const url = new URL(`${this.baseUrl}${this.pathPrefix}/Tickets/${ticketId}`);
    const opts: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "PUT",
      cert: this.agentOptions.cert,
      key: this.agentOptions.key,
      ca: this.agentOptions.ca,
      servername: url.hostname,
      rejectUnauthorized: this.agentOptions.rejectUnauthorized,
      headers: {
        "Content-Type": "application/json",
        Host: this.hostHeader,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(opts, (resp) => {
        resp.on("data", () => {});
        resp.on("end", () => {
          logger.info("X-trafik API request", { method: "put", url: `${this.pathPrefix}/Tickets/${ticketId}` });
          logger.info("X-trafik API response", { status: resp.statusCode });
          if (resp.statusCode === 204) return resolve();
          if (resp.statusCode === 400) return reject(new Error("Bad request: invalid price"));
          if (resp.statusCode === 401 || resp.statusCode === 403) return reject(new Error("Invalid client certificate - access denied"));
          if (resp.statusCode === 404) return reject(new Error("Ticket not found"));
          reject(new Error(`Unexpected response status: ${resp.statusCode}`));
        });
      });
      req.on("error", (err) => reject(new Error(`Network error: ${err.message}`)));
      req.setTimeout(30000, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });
      req.write(body);
      req.end();
    });
  }
}
