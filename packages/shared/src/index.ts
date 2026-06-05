export * from "./enums.js";
export * from "./schemas.js";
export * from "./realtime.js";
export * from "./importTabular.js";

/** Shared API auth token payload. */
export interface AuthTokenPayload {
  userId: string;
  workspaceId: string;
  email: string;
}

/** Standard API error body. */
export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export const MONTH_REGEX = /^\d{4}-\d{2}$/u;

/** Returns the YYYY-MM month string for a given Date (UTC). */
export function toMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
