export type TicketStatus = "OK" | "Rejected" | "NotValidated";

export interface TicketStatusResponse {
  result: TicketStatus;
}

export interface ValidateTicketRequest {
  ticketId: string | number;
}

export interface ValidateTicketResponse {
  success: boolean;
  ticketId: string | number;
  status: TicketStatus;
  message?: string;
}

export interface XTrafikConfig {
  baseUrl: string;
  clientCert?: string;
  clientKey?: string;
}
