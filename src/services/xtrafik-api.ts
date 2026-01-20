import axios, { AxiosInstance, AxiosError } from "axios";
import https from "https";
import fs from "fs";
import { logger } from "../utils/logger";
import { TicketStatus, TicketStatusResponse, XTrafikConfig } from "../types";

export class XTrafikAPI {
  private client: AxiosInstance;
  private baseUrl: string;

  constructor(config: XTrafikConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");

    let httpsAgent;
    if (config.clientCert && config.clientKey) {
      try {
        const cert = fs.readFileSync(config.clientCert, "utf8");
        const key = fs.readFileSync(config.clientKey, "utf8");

        httpsAgent = new https.Agent({
          cert,
          key,
          rejectUnauthorized: true,
        });

        logger.info("Client certificate loaded for X-trafik API");
      } catch (error) {
        logger.error("Failed to load client certificate", { error });
        throw new Error("Failed to load client certificate");
      }
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      httpsAgent,
      timeout: 30000, // Increased to 30 seconds for testing
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.client.interceptors.request.use(
      (config) => {
        logger.info("X-trafik API request", {
          method: config.method,
          url: config.url,
        });
        return config;
      },
      (error) => {
        logger.error("X-trafik API request error", { error: error.message });
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info("X-trafik API response", {
          status: response.status,
          url: response.config.url,
          data: response.data, // Log the actual response data from X-trafik
        });
        return response;
      },
      (error: AxiosError) => {
        logger.error("X-trafik API response error", {
          status: error.response?.status,
          statusText: error.response?.statusText,
          url: error.config?.url,
          message: error.message,
          responseData: error.response?.data, // Log error response data from X-trafik
        });
        return Promise.reject(error);
      }
    );
  }

  async getTicketStatus(
    ticketId: string | number
  ): Promise<TicketStatusResponse> {
    try {
      const response = await this.client.get<TicketStatusResponse>(
        `/api/Tickets/${ticketId}`
      );

      // Log the raw response from X-trafik API
      logger.info("X-trafik API raw response received", {
        ticketId,
        status: response.status,
        headers: response.headers,
        data: response.data,
        fullResponse: JSON.stringify(response.data, null, 2),
      });

      if (response.status === 200 && response.data) {
        return response.data;
      }

      throw new Error(`Unexpected response status: ${response.status}`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        if (axiosError.response?.status === 403) {
          logger.error("X-trafik API: Invalid client certificate (403)");
          throw new Error("Invalid client certificate - access denied");
        }

        if (axiosError.response?.status === 404) {
          logger.warn("X-trafik API: Ticket not found", {
            ticketId,
            responseData: axiosError.response?.data,
            responseHeaders: axiosError.response?.headers,
          });
          throw new Error("Ticket not found");
        }

        if (axiosError.response?.status === 500) {
          logger.error("X-trafik API: Server error (500)");
          throw new Error("X-trafik API server error");
        }

        if (!axiosError.response) {
          logger.error("X-trafik API: Network error", {
            message: axiosError.message,
            code: axiosError.code,
            config: {
              url: axiosError.config?.url,
              baseURL: axiosError.config?.baseURL,
              method: axiosError.config?.method,
            },
          });
          throw new Error(
            `Network error: ${axiosError.message}${
              axiosError.code ? ` (${axiosError.code})` : ""
            }`
          );
        }
      }

      throw error;
    }
  }
}
