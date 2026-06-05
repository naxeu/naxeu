import { and, eq } from "drizzle-orm";
import { attachments } from "@naxeu/db/schema";
import type { ServiceContext } from "./context.js";

/**
 * Persists corrected `extracted_data` JSON (e.g. user edits in the PWA).
 * Does not re-run analysis or change linked transactions.
 */
export async function updateAttachmentExtractedData(
  ctx: ServiceContext,
  opts: { attachmentId: string; workspaceId: string; extractedData: unknown },
): Promise<(typeof attachments.$inferSelect) | null> {
  const { attachmentId, workspaceId, extractedData } = opts;

  const [exists] = await ctx.db
    .select({ id: attachments.id })
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, workspaceId)))
    .limit(1);
  if (!exists) return null;

  await ctx.db
    .update(attachments)
    .set({ extractedData: extractedData as Record<string, unknown> })
    .where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, workspaceId)));

  const [updated] = await ctx.db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, workspaceId)))
    .limit(1);

  await ctx.realtime.publish({
    type: "attachment.updated",
    entityType: "attachment",
    entityId: attachmentId,
    workspaceId,
    timestamp: new Date().toISOString(),
    meta: { extracted: true },
  });

  return updated ?? null;
}
