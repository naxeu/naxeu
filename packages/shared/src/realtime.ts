import type { RealtimeEventType } from "./enums.js";

/**
 * Channels used for realtime fan-out. Subscriptions are authorised against the
 * connected user and their workspace; clients can additionally narrow to a
 * specific entity.
 */
export type RealtimeChannel =
  | `user:${string}`
  | `workspace:${string}`
  | `transaction:${string}`
  | `import:${string}`
  | `attachment:${string}`;

/**
 * Minimal realtime envelope. By design this carries NO sensitive full objects —
 * only enough for the PWA to know it should refetch details from the REST API.
 */
export interface RealtimeEvent {
  type: RealtimeEventType;
  entityType: "transaction" | "message" | "import" | "attachment" | "automation";
  entityId: string;
  workspaceId: string;
  timestamp: string;
  /** Optional tiny, non-sensitive metadata (e.g. progress percentage). */
  meta?: Record<string, string | number | boolean>;
}

export function channelForUser(userId: string): RealtimeChannel {
  return `user:${userId}`;
}

export function channelForWorkspace(workspaceId: string): RealtimeChannel {
  return `workspace:${workspaceId}`;
}

/** Redis pub/sub channel that the API listens on to fan out to sockets. */
export const REALTIME_REDIS_CHANNEL = "naxeu:realtime";
