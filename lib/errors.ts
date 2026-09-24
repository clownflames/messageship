import { z } from "zod";
import type { JsonValue } from "@/db/schema";

export type ApiErrorCode =
  | "INVALID_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "EXTERNAL_SERVICE_ERROR"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: JsonValue;

  constructor(code: ApiErrorCode, message: string, status: number, details?: JsonValue) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function invalidRequest(message: string, details?: JsonValue): AppError {
  return new AppError("INVALID_REQUEST", message, 400, details);
}

export function unauthorized(message = "Authentication is required"): AppError {
  return new AppError("UNAUTHORIZED", message, 401);
}

export function forbidden(message = "You do not have permission to perform this action"): AppError {
  return new AppError("FORBIDDEN", message, 403);
}

export function notFound(message = "The requested resource was not found"): AppError {
  return new AppError("NOT_FOUND", message, 404);
}

export function conflict(message: string): AppError {
  return new AppError("CONFLICT", message, 409);
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  if (error instanceof z.ZodError) {
    const flattened = z.flattenError(error);
    return invalidRequest("Request validation failed", flattened as unknown as JsonValue);
  }
  return new AppError("INTERNAL_ERROR", "An unexpected error occurred", 500);
}

export function apiSuccess<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data }, { status });
}

export function apiFailure(error: unknown): Response {
  const appError = toAppError(error);
  return Response.json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details === undefined ? {} : { details: appError.details }),
    },
  }, { status: appError.status });
}

export async function parseJsonBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw invalidRequest("Request body must be valid JSON");
  }
  return schema.parse(body);
}
