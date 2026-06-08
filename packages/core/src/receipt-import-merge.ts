import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { attachments, transactions } from "@naxeu/db/schema";
import { extractedAttachmentSchema } from "@naxeu/shared";
import type { ServiceContext } from "./context.js";
import { toCents } from "./money.js";
import { formatReceiptShellDescription, formatReceiptShellMerchantName } from "./receipt-shell-labels.js";
import { transactionIsLive } from "./transaction-service.js";

/** Max |Belegdatum − Buchungsdatum| for auto-merge (Kartenabbuchung oft 1–3 Tage später). */
export const RECEIPT_IMPORT_MERGE_DATE_WINDOW_DAYS = 4;
export const RECEIPT_IMPORT_MERGE_AMOUNT_TOLERANCE_CENTS = 2;

const EXCLUDED_STATUSES = ["archived", "ignored", "draft"] as const;

/** Konto-/Nutzerbuchungen, unter die Beleg-Positionen gemerged werden dürfen (nicht `attachment`). */
const LEDGER_MERGE_SOURCES = ["import", "manual"] as const;

function isLedgerMergeSource(source: string): boolean {
  return (LEDGER_MERGE_SOURCES as readonly string[]).includes(source);
}

export function isoDateDiffDays(a: string, b: string): number {
  const da = new Date(`${a.slice(0, 10)}T12:00:00Z`).getTime();
  const db = new Date(`${b.slice(0, 10)}T12:00:00Z`).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return 999;
  return Math.round(Math.abs(da - db) / 86400000);
}

export function amountsMatchForMerge(a: string, b: string, toleranceCents: number): boolean {
  return Math.abs(toCents(a) - toCents(b)) <= toleranceCents;
}

function asIsoDate(d: unknown): string {
  if (typeof d === "string") return d.slice(0, 10);
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

async function importIdsWithChildren(
  ctx: ServiceContext,
  workspaceId: string,
  candidateIds: string[],
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const rows = await ctx.db
    .select({ parentId: transactions.parentId })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        inArray(transactions.parentId, candidateIds),
        transactionIsLive,
      ),
    );
  return new Set(rows.map((r) => r.parentId).filter((id): id is string => id != null));
}

type ScoredRow = { id: string; dateDiff: number; centDiff: number };

function pickUniqueBestMatch(scored: ScoredRow[]): string | null {
  if (scored.length === 0) return null;
  scored.sort((a, b) => a.dateDiff - b.dateDiff || a.centDiff - b.centDiff);
  const best = scored[0]!;
  if (scored.length >= 2) {
    const second = scored[1]!;
    if (second.dateDiff === best.dateDiff && second.centDiff === best.centDiff) return null;
  }
  return best.id;
}

async function publishMergeRealtime(
  ctx: ServiceContext,
  workspaceId: string,
  attachmentId: string,
  importTransactionId: string,
  shellId: string,
) {
  const ts = new Date().toISOString();
  await ctx.realtime.publish({
    type: "attachment.updated",
    entityType: "attachment",
    entityId: attachmentId,
    workspaceId,
    timestamp: ts,
    meta: { receiptImportMerged: true },
  });
  await ctx.realtime.publish({
    type: "transaction.updated",
    entityType: "transaction",
    entityId: importTransactionId,
    workspaceId,
    timestamp: ts,
  });
  await ctx.realtime.publish({
    type: "transaction.updated",
    entityType: "transaction",
    entityId: shellId,
    workspaceId,
    timestamp: ts,
  });
}

/**
 * Hängt die Beleg-Elternzeile (`source: attachment`) als Kind unter die
 * Konto-/Import-Buchung. Beleg-Positionen bleiben unter der Shell; die Shell wird
 * nicht archiviert, erhält aber `affects_account_balance: false`, damit nur die
 * Kontozeile den Saldo trägt. `attachments.transaction_id` bleibt die Shell,
 * damit Analyse/Detail weiter die Positionskinder laden.
 */
async function executeReceiptImportMerge(
  ctx: ServiceContext,
  args: {
    workspaceId: string;
    attachmentId: string;
    shellId: string;
    importTransactionId: string;
  },
): Promise<boolean> {
  const now = new Date();
  const { workspaceId, attachmentId, shellId, importTransactionId: canonicalTransactionId } = args;

  return ctx.db.transaction(async (tx) => {
    const [att] = await tx
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, attachmentId), eq(attachments.workspaceId, workspaceId)))
      .limit(1);
    if (!att || att.transactionId !== shellId) return false;

    const [shell] = await tx
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.id, shellId), eq(transactions.workspaceId, workspaceId), transactionIsLive),
      )
      .limit(1);
    if (!shell || shell.source !== "attachment" || shell.type !== "expense") return false;
    if ((EXCLUDED_STATUSES as readonly string[]).includes(shell.status)) return false;
    if (shell.parentId) return false;

    const [importRow] = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.id, canonicalTransactionId),
          eq(transactions.workspaceId, workspaceId),
          transactionIsLive,
        ),
      )
      .limit(1);
    if (!importRow || !isLedgerMergeSource(importRow.source) || importRow.type !== "expense") return false;
    if ((EXCLUDED_STATUSES as readonly string[]).includes(importRow.status)) return false;
    if (importRow.parentId) return false;

    const [existingChild] = await tx
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, workspaceId),
          eq(transactions.parentId, canonicalTransactionId),
          transactionIsLive,
        ),
      )
      .limit(1);
    if (existingChild) return false;

    const prevMeta =
      typeof importRow.metadata === "object" && importRow.metadata !== null && !Array.isArray(importRow.metadata)
        ? { ...(importRow.metadata as Record<string, unknown>) }
        : {};
    prevMeta.receiptImportMerge = {
      attachmentId,
      receiptShellTransactionId: shellId,
      mergedAt: now.toISOString(),
    };

    let merchantName = importRow.merchantName;
    if (!merchantName?.trim()) {
      if (shell.merchantName?.trim()) merchantName = shell.merchantName;
      else {
        const parsed = extractedAttachmentSchema.safeParse(att.extractedData);
        if (parsed.success && parsed.data.merchantName?.trim()) {
          merchantName = parsed.data.merchantName;
        }
      }
    }

    await tx
      .update(transactions)
      .set({
        affectsBudget: false,
        merchantName: merchantName ?? importRow.merchantName,
        metadata: prevMeta as Record<string, unknown>,
        updatedAt: now,
      })
      .where(eq(transactions.id, canonicalTransactionId));

    const shellMerchant = formatReceiptShellMerchantName(att.fileName, shell.merchantName);
    const shellDescription = formatReceiptShellDescription(att.fileName, shell.description);

    await tx
      .update(transactions)
      .set({
        parentId: canonicalTransactionId,
        affectsAccountBalance: false,
        affectsBudget: false,
        merchantName: shellMerchant,
        description: shellDescription,
        updatedAt: now,
      })
      .where(and(eq(transactions.id, shellId), eq(transactions.workspaceId, workspaceId)));

    return true;
  });
}

/**
 * Nach Belegverarbeitung: passende Import- oder manuelle Ausgabenbuchung suchen und mergen.
 */
export async function tryMergeReceiptWithMatchingImport(
  ctx: ServiceContext,
  args: { workspaceId: string; attachmentId: string },
): Promise<{ merged: boolean; importTransactionId?: string }> {
  const [att] = await ctx.db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, args.attachmentId), eq(attachments.workspaceId, args.workspaceId)))
    .limit(1);
  if (!att || att.status !== "processed" || !att.transactionId) return { merged: false };

  const [parent] = await ctx.db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, att.transactionId),
        eq(transactions.workspaceId, args.workspaceId),
        transactionIsLive,
      ),
    )
    .limit(1);
  if (!parent) return { merged: false };
  if (parent.source !== "attachment" || parent.type !== "expense") return { merged: false };
  if ((EXCLUDED_STATUSES as readonly string[]).includes(parent.status)) return { merged: false };
  if (parent.parentId) return { merged: false };

  const shellDate = asIsoDate(parent.date);
  const candidates = await ctx.db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, args.workspaceId),
        inArray(transactions.source, [...LEDGER_MERGE_SOURCES]),
        eq(transactions.type, "expense"),
        isNull(transactions.parentId),
        notInArray(transactions.status, [...EXCLUDED_STATUSES]),
        eq(transactions.affectsAccountBalance, true),
        eq(transactions.currency, parent.currency),
        transactionIsLive,
      ),
    );

  const busyImports = await importIdsWithChildren(
    ctx,
    args.workspaceId,
    candidates.map((c) => c.id),
  );

  const scored: ScoredRow[] = [];
  for (const c of candidates) {
    if (busyImports.has(c.id)) continue;
    const dateDiff = isoDateDiffDays(shellDate, asIsoDate(c.date));
    if (dateDiff > RECEIPT_IMPORT_MERGE_DATE_WINDOW_DAYS) continue;
    if (!amountsMatchForMerge(c.amount, parent.amount, RECEIPT_IMPORT_MERGE_AMOUNT_TOLERANCE_CENTS)) continue;
    const centDiff = Math.abs(toCents(c.amount) - toCents(parent.amount));
    scored.push({ id: c.id, dateDiff, centDiff });
  }

  const bestId = pickUniqueBestMatch(scored);
  if (!bestId) return { merged: false };

  const ok = await executeReceiptImportMerge(ctx, {
    workspaceId: args.workspaceId,
    attachmentId: args.attachmentId,
    shellId: parent.id,
    importTransactionId: bestId,
  });
  if (ok) {
    await publishMergeRealtime(ctx, args.workspaceId, args.attachmentId, bestId, parent.id);
    return { merged: true, importTransactionId: bestId };
  }
  return { merged: false };
}

/**
 * Nach neuer Import- oder manueller Ausgabenbuchung: passenden verarbeiteten Beleg suchen und mergen.
 */
export async function tryMergeImportTransactionWithMatchingReceipt(
  ctx: ServiceContext,
  args: { workspaceId: string; importTransactionId: string },
): Promise<{ merged: boolean; attachmentId?: string }> {
  const [importRow] = await ctx.db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, args.importTransactionId),
        eq(transactions.workspaceId, args.workspaceId),
        transactionIsLive,
      ),
    )
    .limit(1);
  if (!importRow || !isLedgerMergeSource(importRow.source) || importRow.type !== "expense") return { merged: false };
  if ((EXCLUDED_STATUSES as readonly string[]).includes(importRow.status)) return { merged: false };
  if (importRow.parentId) return { merged: false };

  const [existingChild] = await ctx.db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, args.workspaceId),
        eq(transactions.parentId, importRow.id),
        transactionIsLive,
      ),
    )
    .limit(1);
  if (existingChild) return { merged: false };

  const importDate = asIsoDate(importRow.date);
  const atts = await ctx.db
    .select()
    .from(attachments)
    .where(and(eq(attachments.workspaceId, args.workspaceId), eq(attachments.status, "processed")));

  type AttScored = { attachmentId: string; shellId: string; dateDiff: number; centDiff: number };
  const scored: AttScored[] = [];

  for (const a of atts) {
    if (!a.transactionId) continue;
    const [shell] = await ctx.db
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.id, a.transactionId), eq(transactions.workspaceId, args.workspaceId), transactionIsLive),
      )
      .limit(1);
    if (!shell || shell.source !== "attachment" || shell.type !== "expense") continue;
    if ((EXCLUDED_STATUSES as readonly string[]).includes(shell.status)) continue;
    if (shell.parentId) continue;
    if (shell.currency !== importRow.currency) continue;

    const dateDiff = isoDateDiffDays(importDate, asIsoDate(shell.date));
    if (dateDiff > RECEIPT_IMPORT_MERGE_DATE_WINDOW_DAYS) continue;
    if (!amountsMatchForMerge(shell.amount, importRow.amount, RECEIPT_IMPORT_MERGE_AMOUNT_TOLERANCE_CENTS)) continue;
    const centDiff = Math.abs(toCents(shell.amount) - toCents(importRow.amount));
    scored.push({ attachmentId: a.id, shellId: shell.id, dateDiff, centDiff });
  }

  scored.sort((a, b) => a.dateDiff - b.dateDiff || a.centDiff - b.centDiff);
  if (scored.length === 0) return { merged: false };
  const best = scored[0]!;
  if (scored.length >= 2) {
    const second = scored[1]!;
    if (second.dateDiff === best.dateDiff && second.centDiff === best.centDiff) return { merged: false };
  }

  const ok = await executeReceiptImportMerge(ctx, {
    workspaceId: args.workspaceId,
    attachmentId: best.attachmentId,
    shellId: best.shellId,
    importTransactionId: importRow.id,
  });
  if (ok) {
    await publishMergeRealtime(ctx, args.workspaceId, best.attachmentId, importRow.id, best.shellId);
    return { merged: true, attachmentId: best.attachmentId };
  }
  return { merged: false };
}
