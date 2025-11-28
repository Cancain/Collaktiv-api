import { Request, Response, NextFunction } from "express";
import { ValidateTicketRequest } from "../types";

export const validateTicketRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { ticketId } = req.body as ValidateTicketRequest;

  if (!ticketId) {
    res.status(400).json({
      error: "Missing required field: ticketId",
    });
    return;
  }

  if (typeof ticketId !== "string" && typeof ticketId !== "number") {
    res.status(400).json({
      error: "ticketId must be a string or number",
    });
    return;
  }

  next();
};
