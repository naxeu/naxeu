import { and, eq } from "drizzle-orm";
import { transactions, workspaceMembers } from "@naxeu/db/schema";
import {
  checkBudgetThresholds,
  isWithinAutomationDepth,
  runAutomationsForTransaction,
  type ServiceContext,
} from "@naxeu/core";
import { toMonthKey, type EventStatus } from "@naxeu/shared";
import type { EventRow } from "@naxeu/db";

/** Finds the workspace owner (fallback: any member) to address messages to. */
async function resolveWorkspaceUser(ctx: ServiceContext, workspaceId: string): Promise<string | null> {
  const members = await ctx.db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId));
  const owner = members.find((m) => m.role === "owner") ?? members[0];
  return owner?.userId ?? null;
}

/**
 * Processes a single domain event. Returns whether processing succeeded.
 *
 * For transaction events it: runs automations (guarded against infinite loops
 * via automationDepth), then checks budget thresholds and creates messages.
 */
export async function processEvent(
  ctx: ServiceContext,
  event: EventRow,
  maxAutomationDepth: number,
): Promise<void> {
  const payload = (event.payload ?? {}) as { transactionId?: string; automationDepth?: number };
  const depth = payload.automationDepth ?? 0;

  switch (event.type) {
    case "transaction.created":
    case "transaction.updated": {
      if (!payload.transactionId) return;
      const userId = await resolveWorkspaceUser(ctx, event.workspaceId);
      if (!userId) return;

      // Loop guard: stop chaining automations beyond the configured depth.
      if (isWithinAutomationDepth(depth, maxAutomationDepth)) {
        await runAutomationsForTransaction(ctx, {
          workspaceId: event.workspaceId,
          userId,
          transactionId: payload.transactionId,
          triggerType: event.type,
          eventId: event.id,
          automationDepth: depth + 1,
        });
      }

      // Budget check for the month the transaction belongs to.
      const [tx] = await ctx.db
        .select()
        .from(transactions)
        .where(
          and(eq(transactions.id, payload.transactionId), eq(transactions.workspaceId, event.workspaceId)),
        )
        .limit(1);
      if (tx) {
        const month = tx.date.slice(0, 7) || toMonthKey(new Date());
        await checkBudgetThresholds(ctx, event.workspaceId, userId, month);
      }
      break;
    }
    case "attachment.created":
      // The actual extraction is triggered on demand via the API; nothing to do.
      break;
    default:
      break;
  }
}

export const TERMINAL_STATUSES: EventStatus[] = ["processed", "failed"];
