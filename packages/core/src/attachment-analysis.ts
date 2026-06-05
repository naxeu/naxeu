import { readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { and, eq, or } from "drizzle-orm";
import type { Attachment } from "@naxeu/db/schema";
import { attachments, categories, transactions } from "@naxeu/db/schema";
import { createTransactionSchema } from "@naxeu/shared";
import type { AttachmentExtractionSource } from "@naxeu/ai";
import { heuristicCategorize } from "@naxeu/ai";
import { createTransaction } from "./transaction-service.js";
import type { ServiceContext } from "./context.js";
import { sniffImageMime } from "./image-sniff.js";

function resolveLineItemCategoryId(
  categoryHint: string | null | undefined,
  lineDescription: string,
  catByName: Map<string, string>,
): string | null {
  const trimmed = categoryHint?.trim();
  if (trimmed) {
    const id = catByName.get(trimmed.toLowerCase());
    if (id) return id;
  }
  const { categoryName } = heuristicCategorize(lineDescription);
  if (categoryName) {
    const id = catByName.get(categoryName.toLowerCase());
    if (id) return id;
  }
  return null;
}

export interface RunAttachmentAnalysisOptions {
  storageDir: string;
  attachmentId: string;
  workspaceId: string;
  userId: string;
  /**
   * When set (e.g. worker after upload), a success path may notify this user via `createMessage`.
   * Omit for manual API-triggered analysis.
   */
  notifyUserId?: string | null;
}

export interface RunAttachmentAnalysisResult {
  attachment: Attachment;
  parentId: string;
  children: (typeof transactions.$inferSelect)[];
  /** Present after a fresh analysis run; omitted when loading an already-processed attachment from the DB. */
  extractionSource?: AttachmentExtractionSource;
}

/**
 * Atomically moves an attachment from `uploaded` or `failed` to `processing`.
 * Returns null if another process already claimed it or it is already terminal.
 */
export async function tryClaimAttachmentForAnalysis(
  ctx: ServiceContext,
  attachmentId: string,
  workspaceId: string,
): Promise<Attachment | null> {
  const [row] = await ctx.db
    .update(attachments)
    .set({ status: "processing" })
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.workspaceId, workspaceId),
        or(eq(attachments.status, "uploaded"), eq(attachments.status, "failed")),
      ),
    )
    .returning();
  return row ?? null;
}

async function loadChildrenByParent(
  ctx: ServiceContext,
  workspaceId: string,
  parentId: string,
): Promise<(typeof transactions.$inferSelect)[]> {
  return ctx.db
    .select()
    .from(transactions)
    .where(and(eq(transactions.workspaceId, workspaceId), eq(transactions.parentId, parentId)));
}

/**
 * Loads attachment analysis outcome when already processed (no re-run).
 */
export async function loadProcessedAttachmentAnalysis(
  ctx: ServiceContext,
  attachmentId: string,
  workspaceId: string,
): Promise<RunAttachmentAnalysisResult | null> {
  const [row] = await ctx.db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, workspaceId)))
    .limit(1);
  if (!row || row.status !== "processed" || !row.transactionId) return null;
  const children = await loadChildrenByParent(ctx, workspaceId, row.transactionId);
  return {
    attachment: row,
    parentId: row.transactionId,
    children,
  };
}

/**
 * Runs receipt extraction and creates parent + line-item transactions.
 * Caller must have claimed the row (`processing`) via {@link tryClaimAttachmentForAnalysis},
 * or pass a row that is already in `processing` (same workspace).
 */
export async function runAttachmentAnalysis(
  ctx: ServiceContext,
  opts: RunAttachmentAnalysisOptions,
): Promise<RunAttachmentAnalysisResult> {
  const { storageDir, attachmentId, workspaceId, userId } = opts;

  const [row] = await ctx.db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw new Error("Attachment not found");
  if (row.status !== "processing") {
    throw new Error(`Attachment is not in processing state (got ${row.status})`);
  }

  const storageRoot = resolve(storageDir);
  const absoluteFile = resolve(storageRoot, row.storagePath);
  const rel = relative(storageRoot, absoluteFile);
  if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
    await ctx.db.update(attachments).set({ status: "failed" }).where(eq(attachments.id, attachmentId));
    throw new Error("Invalid attachment storage path");
  }

  let imageBytes: Buffer | null = null;
  try {
    imageBytes = await readFile(absoluteFile);
  } catch {
    imageBytes = null;
  }

  const storedMime = (row.mimeType ?? "").toLowerCase().trim();
  const sniffed =
    imageBytes != null && imageBytes.byteLength > 0 ? sniffImageMime(imageBytes) : null;
  /** Mobile/camera uploads often use `application/octet-stream` or an empty MIME — sniff JPEG/PNG/WebP/GIF. */
  const passImageBytes =
    imageBytes != null &&
    imageBytes.byteLength > 0 &&
    (storedMime.startsWith("image/") || sniffed != null);
  const mimeForModel = storedMime.startsWith("image/") ? storedMime : sniffed;

  const cats = await ctx.db
    .select()
    .from(categories)
    .where(eq(categories.workspaceId, workspaceId));
  /** Receipt positions are budget expenses; only offer those categories to the model. */
  const budgetCats = cats.filter((c) => c.type === "expense" && !c.isArchived);
  const budgetCategoryNames = budgetCats.map((c) => c.name);

  const { extracted, source: extractionSource } = await ctx.ai.extractAttachment({
    fileName: row.fileName,
    extractedText: row.extractedText,
    imageBytes: passImageBytes ? imageBytes : null,
    mimeType: passImageBytes && mimeForModel ? mimeForModel : row.mimeType,
    budgetCategoryNames,
  });

  let parentId = row.transactionId;
  if (!parentId) {
    const parent = await createTransaction(
      ctx,
      createTransactionSchema.parse({
        type: "expense",
        status: "pending_review",
        date: extracted.date ?? new Date().toISOString().slice(0, 10),
        amount: extracted.total ?? "0",
        currency: extracted.currency,
        merchantName: extracted.merchantName,
        description: `Beleg ${row.fileName}`,
        source: "attachment",
        affectsAccountBalance: true,
        affectsBudget: false,
      }),
      { workspaceId, userId },
    );
    parentId = parent.id;
  }

  const catByName = new Map(budgetCats.map((c) => [c.name.toLowerCase(), c.id] as const));

  const children: (typeof transactions.$inferSelect)[] = [];
  for (const item of extracted.lineItems) {
    const categoryId = resolveLineItemCategoryId(item.categoryHint, item.description, catByName);
    const childTx = await createTransaction(
      ctx,
      createTransactionSchema.parse({
        parentId,
        type: "item",
        status: "confirmed",
        date: extracted.date ?? new Date().toISOString().slice(0, 10),
        amount: item.amount,
        currency: extracted.currency,
        categoryId,
        merchantName: item.description,
        description: item.description,
        source: "attachment",
        affectsAccountBalance: false,
        affectsBudget: true,
      }),
      { workspaceId, userId, skipEvent: true },
    );
    children.push(childTx);
  }

  const extractionLabel =
    extractionSource === "model"
      ? `KI-Extraktion (Beleg): ${row.fileName}`
      : `Heuristik-Extraktion: ${row.fileName}`;

  const [updated] = await ctx.db
    .update(attachments)
    .set({
      status: "processed",
      extractedText: extractionLabel,
      extractedData: extracted,
      transactionId: parentId,
    })
    .where(eq(attachments.id, attachmentId))
    .returning();

  await ctx.realtime.publish({
    type: "attachment.updated",
    entityType: "attachment",
    entityId: attachmentId,
    workspaceId,
    timestamp: new Date().toISOString(),
    meta: { status: "processed" },
  });

  return {
    attachment: updated!,
    parentId,
    children,
    extractionSource,
  };
}

/**
 * Marks attachment as failed (e.g. after an uncaught error during analysis).
 */
export async function markAttachmentAnalysisFailed(
  ctx: ServiceContext,
  attachmentId: string,
  workspaceId: string,
): Promise<void> {
  await ctx.db
    .update(attachments)
    .set({ status: "failed" })
    .where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, workspaceId)));
  await ctx.realtime.publish({
    type: "attachment.updated",
    entityType: "attachment",
    entityId: attachmentId,
    workspaceId,
    timestamp: new Date().toISOString(),
    meta: { status: "failed" },
  });
}
