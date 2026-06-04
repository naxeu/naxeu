import { and, eq, sql } from "drizzle-orm";
import type { Database } from "@naxeu/db";
import { events } from "@naxeu/db/schema";
import type { DomainEventType } from "@naxeu/shared";

export interface EmitEventArgs {
  workspaceId: string;
  type: DomainEventType;
  payload?: Record<string, unknown>;
  correlationId?: string | null;
  /** Depth of automation chaining; used to prevent infinite loops. */
  automationDepth?: number;
}

/** Persists a domain event in the `events` table (status = pending). */
export async function emitEvent(db: Database, args: EmitEventArgs) {
  const payload = {
    ...(args.payload ?? {}),
    automationDepth: args.automationDepth ?? 0,
  };
  const [row] = await db
    .insert(events)
    .values({
      workspaceId: args.workspaceId,
      type: args.type,
      payload,
      status: "pending",
      correlationId: args.correlationId ?? null,
    })
    .returning();
  return row!;
}

/**
 * Atomically claims a batch of pending events for processing using a
 * `FOR UPDATE SKIP LOCKED` style update so multiple workers don't double
 * process the same event. Events are never lost: failures are recorded and the
 * row stays available for retry.
 */
export async function claimPendingEvents(db: Database, limit = 20) {
  // Raw SQL is needed for FOR UPDATE SKIP LOCKED. db.execute returns rows with
  // the DB's snake_case column names, so we map them back to the camelCase
  // EventRow shape that the rest of the code expects.
  const rows = (await db.execute(sql`
    UPDATE events
    SET status = 'processing', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM events
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *;
  `)) as unknown as Array<Record<string, unknown>>;

  return rows.map(
    (r): typeof events.$inferSelect => ({
      id: r.id as string,
      workspaceId: r.workspace_id as string,
      type: r.type as string,
      payload: r.payload as Record<string, unknown>,
      status: r.status as string,
      attempts: r.attempts as number,
      errorMessage: (r.error_message as string | null) ?? null,
      correlationId: (r.correlation_id as string | null) ?? null,
      createdAt: r.created_at as Date,
      processedAt: (r.processed_at as Date | null) ?? null,
    }),
  );
}

export async function markEventProcessed(db: Database, id: string) {
  await db
    .update(events)
    .set({ status: "processed", processedAt: new Date() })
    .where(eq(events.id, id));
}

export async function markEventFailed(db: Database, id: string, error: string) {
  await db
    .update(events)
    .set({ status: "failed", errorMessage: error, processedAt: new Date() })
    .where(and(eq(events.id, id)));
}

/** Re-queues a failed event for another attempt. */
export async function requeueEvent(db: Database, id: string) {
  await db.update(events).set({ status: "pending" }).where(eq(events.id, id));
}
