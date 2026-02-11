// Matches TicketResult enum from X-trafik API Swagger spec
export type TicketResult = "OK" | "Rejected" | "NotValidated";

// Matches TicketStatus schema from X-trafik API Swagger spec
export interface TicketStatus {
  id: string | null;
  result: TicketResult;
}

// Alias for API response (matches TicketStatus from Swagger)
export type TicketStatusResponse = TicketStatus;

export interface ValidateTicketRequest {
  ticketId: string | number;
}

export interface ValidateTicketResponse {
  success: boolean;
  ticketId: string | number;
  status: TicketResult;
  message?: string;
}

export interface XTrafikConfig {
  baseUrl: string;
  clientCert?: string;
  clientKey?: string;
}

export interface Ticket {
  id?: string | null;
  ticketId: number | string;
  price: number;
}

export interface UpdateTicketPriceDto {
  id?: string | null;
  price: number;
}

export interface RegisterTicketRequest {
  ticketId: string | number;
  price: number;
}

export interface UpdateTicketPriceRequest {
  price: number;
}

export interface ProblemDetails {
  type?: string | null;
  title?: string | null;
  status?: number | null;
  detail?: string | null;
  instance?: string | null;
  [key: string]: unknown; // additionalProperties
}
