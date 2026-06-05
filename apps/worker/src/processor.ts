import { and, eq } from "drizzle-orm";
import { attachments, transactions, workspaceMembers } from "@naxeu/db/schema";
import {
  checkBudgetThresholds,
  createMessage,
  isWithinAutomationDepth,
  loadProcessedAttachmentAnalysis,
  markAttachmentAnalysisFailed,
  runAttachmentAnalysis,
  runAutomationsForTransaction,
  tryClaimAttachmentForAnalysis,
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
 *
 * For `attachment.created` it claims the row and runs receipt analysis (same as
 * the API analyze endpoint), then notifies the uploader with an in-app message.
 */
export async function processEvent(
  ctx: ServiceContext,
  event: EventRow,
  maxAutomationDepth: number,
): Promise<void> {
  const payload = (event.payload ?? {}) as { transactionId?: string; automationDepth?: number; attachmentId?: string };
  const depth = payload.automationDepth ?? 0;

  switch (event.type) {
    case "transaction.created":
    case "transaction.updated": {
      if (!payload.transactionId) return;
      const userId = await resolveWorkspaceUser(ctx, event.workspaceId);
      if (!userId) return;

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
    case "attachment.created": {
      const attachmentId = payload.attachmentId;
      if (!attachmentId) return;

      const storageDir = process.env.STORAGE_DIR ?? "/data/storage";

      const claimed = await tryClaimAttachmentForAnalysis(ctx, attachmentId, event.workspaceId);
      if (!claimed) {
        const cached = await loadProcessedAttachmentAnalysis(ctx, attachmentId, event.workspaceId);
        if (cached) return;
        const [cur] = await ctx.db
          .select({ status: attachments.status })
          .from(attachments)
          .where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, event.workspaceId)))
          .limit(1);
        if (cur?.status === "processing" || cur?.status === "processed") return;
        return;
      }

      const userId = claimed.createdByUserId ?? (await resolveWorkspaceUser(ctx, event.workspaceId));
      if (!userId) {
        await markAttachmentAnalysisFailed(ctx, attachmentId, event.workspaceId);
        throw new Error("No user id for attachment analysis (missing createdByUserId and workspace member)");
      }

      try {
        const result = await runAttachmentAnalysis(ctx, {
          storageDir,
          attachmentId,
          workspaceId: event.workspaceId,
          userId,
        });

        const notifyUserId = claimed.createdByUserId ?? (await resolveWorkspaceUser(ctx, event.workspaceId));
        if (notifyUserId) {
          await createMessage(ctx, {
            workspaceId: event.workspaceId,
            userId: notifyUserId,
            type: "receipt",
            severity: "success",
            title: "Beleg analysiert",
            body: `${result.attachment.fileName}: ${result.children.length} Position(en) erkannt.`,
            relatedEntityType: "attachment",
            relatedEntityId: attachmentId,
            actionLabel: "Beleg öffnen",
            actionUrl: `/attachments/${attachmentId}`,
          });
        }
      } catch (err) {
        await markAttachmentAnalysisFailed(ctx, attachmentId, event.workspaceId);
        const messageUserId = claimed.createdByUserId ?? (await resolveWorkspaceUser(ctx, event.workspaceId));
        if (messageUserId) {
          await createMessage(ctx, {
            workspaceId: event.workspaceId,
            userId: messageUserId,
            type: "receipt",
            severity: "error",
            title: "Beleganalyse fehlgeschlagen",
            body: err instanceof Error ? err.message : String(err),
            relatedEntityType: "attachment",
            relatedEntityId: attachmentId,
            actionLabel: "Beleg öffnen",
            actionUrl: `/attachments/${attachmentId}`,
          });
        }
        throw err;
      }
      break;
    }
    default:
      break;
  }
}

export const TERMINAL_STATUSES: EventStatus[] = ["processed", "failed"];
