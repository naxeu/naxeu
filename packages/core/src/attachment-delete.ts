import { unlink } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { and, eq } from "drizzle-orm";
import { attachments, transactions } from "@naxeu/db/schema";
import type { ServiceContext } from "./context.js";
import { deleteTransaction } from "./transaction-service.js";

/**
 * Deletes an attachment row, its storage file, and (when linked) the parent receipt
 * transaction plus all child line-item transactions.
 */
export async function deleteAttachment(
  ctx: ServiceContext,
  opts: { attachmentId: string; workspaceId: string; storageDir: string },
): Promise<boolean> {
  const { attachmentId, workspaceId, storageDir } = opts;

  const [row] = await ctx.db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, workspaceId)))
    .limit(1);
  if (!row) return false;

  const storageRoot = resolve(storageDir);
  const absoluteFile = resolve(storageRoot, row.storagePath);
  const rel = relative(storageRoot, absoluteFile);
  if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
    throw new Error("Invalid attachment storage path");
  }

  const parentTxId = row.transactionId;
  if (parentTxId) {
    const children = await ctx.db
      .select({ id: transactions.id })
      .from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.parentId, parentTxId)));
    for (const c of children) {
      await deleteTransaction(ctx, c.id, workspaceId);
    }
    await deleteTransaction(ctx, parentTxId, workspaceId);
  }

  await ctx.db.delete(attachments).where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, workspaceId)));

  try {
    await unlink(absoluteFile);
  } catch {
    /* ENOENT etc. */
  }

  await ctx.realtime.publish({
    type: "attachment.updated",
    entityType: "attachment",
    entityId: attachmentId,
    workspaceId,
    timestamp: new Date().toISOString(),
    meta: { deleted: true },
  });

  return true;
}
