import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "STORAGE_LIMIT_EXCEEDED"
  | "PLAN_LIMIT"
  | "INTERNAL_ERROR";

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown
) {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return apiError("VALIDATION_ERROR", "Invalid input.", 400, err.flatten(i => i.message));
  }

  if (err instanceof ApiException) {
    return apiError(err.code, err.message, err.status);
  }

  Sentry.captureException(err);
  console.error(err);
  return apiError("INTERNAL_ERROR", "An unexpected error occurred.", 500);
}

export class ApiException extends Error {
  constructor(
    public code: ApiErrorCode,
    message: string,
    public status: number
  ) {
    super(message);
    this.name = "ApiException";
  }
}

// Convenience shortcuts
export const unauthorized = () =>
  new ApiException("UNAUTHORIZED", "Authentication required.", 401);

export const forbidden = () =>
  new ApiException("FORBIDDEN", "You do not have permission to do this.", 403);

export const notFound = (resource = "Resource") =>
  new ApiException("NOT_FOUND", `${resource} not found.`, 404);

export const conflict = (message: string) =>
  new ApiException("CONFLICT", message, 409);
