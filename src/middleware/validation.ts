import { Request, Response, NextFunction } from "express";
import { UpdateTicketPriceRequest, ValidateTicketRequest } from "../types";

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

export const validateRegisterTicketRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { ticketId, price } = req.body;

  if (!ticketId) {
    res.status(400).json({ error: "Missing required field: ticketId" });
    return;
  }

  if (typeof ticketId !== "string" && typeof ticketId !== "number") {
    res.status(400).json({ error: "ticketId must be a string or number" });
    return;
  }

  if (price === undefined || price === null) {
    res.status(400).json({ error: "Missing required field: price" });
    return;
  }

  const numPrice = typeof price === "string" ? parseFloat(price) : Number(price);
  if (isNaN(numPrice) || numPrice < 0) {
    res.status(400).json({ error: "price must be a non-negative number" });
    return;
  }

  next();
};

export const validateUpdateTicketPriceRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { price } = req.body as UpdateTicketPriceRequest;

  if (price === undefined || price === null) {
    res.status(400).json({ error: "Missing required field: price" });
    return;
  }

  const numPrice = typeof price === "string" ? parseFloat(price) : Number(price);
  if (isNaN(numPrice) || numPrice < 0) {
    res.status(400).json({ error: "price must be a non-negative number" });
    return;
  }

  next();
};
