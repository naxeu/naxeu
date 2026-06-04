import { and, desc, eq, ilike, gte, inArray, isNull, lte, or } from "drizzle-orm";
import type { Database } from "@naxeu/db";
import { transactions } from "@naxeu/db/schema";
import type { CreateTransactionInput, TransactionQuery, UpdateTransactionInput } from "@naxeu/shared";
import type { ServiceContext } from "./context.js";
import { emitEvent } from "./events.js";
import { normalizeSignedAmount, buildTransactionTree } from "./transaction-logic.js";

export interface CreateTxOptions {
  workspaceId: string;
  userId: string;
  /** Carries automation depth so automation-created transactions can't loop. */
  correlationId?: string | null;
  automationDepth?: number;
  /** When true, skips emitting a domain event (used for bulk import). */
  skipEvent?: boolean;
}

export async function createTransaction(
  ctx: ServiceContext,
  input: CreateTransactionInput,
  opts: CreateTxOptions,
) {
  const amount = normalizeSignedAmount(input.type, input.amount);
  // Transfers move money between accounts; they affect balances but never the
  // budget (the spend was already counted on the purchase, e.g. on the card).
  const affectsBudget = input.type === "transfer" ? false : input.affectsBudget;
  const [row] = await ctx.db
    .insert(transactions)
    .values({
      workspaceId: opts.workspaceId,
      parentId: input.parentId ?? null,
      accountId: input.accountId ?? null,
      counterAccountId: input.counterAccountId ?? null,
      categoryId: input.categoryId ?? null,
      createdByUserId: opts.userId,
      assignedToUserId: input.assignedToUserId ?? null,
      type: input.type,
      status: input.status,
      date: input.date,
      bookingDate: input.bookingDate ?? null,
      valueDate: input.valueDate ?? null,
      amount,
      currency: input.currency,
      merchantName: input.merchantName ?? null,
      description: input.description ?? null,
      notes: input.notes ?? null,
      source: input.source,
      affectsAccountBalance: input.affectsAccountBalance,
      affectsBudget,
      externalId: input.externalId ?? null,
      confidence: input.confidence != null ? String(input.confidence) : null,
      aiData: input.aiData ?? {},
      metadata: input.metadata ?? {},
    })
    .returning();

  const tx = row!;

  if (!opts.skipEvent) {
    await emitEvent(ctx.db, {
      workspaceId: opts.workspaceId,
      type: "transaction.created",
      payload: { transactionId: tx.id },
      correlationId: opts.correlationId ?? null,
      automationDepth: opts.automationDepth ?? 0,
    });
    await ctx.realtime.publish({
      type: "transaction.created",
      entityType: "transaction",
      entityId: tx.id,
      workspaceId: opts.workspaceId,
      timestamp: new Date().toISOString(),
    });
  }
  return tx;
}

export async function updateTransaction(
  ctx: ServiceContext,
  id: string,
  workspaceId: string,
  input: UpdateTransactionInput,
  opts: { automationDepth?: number; skipEvent?: boolean } = {},
) {
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    patch[key] = value;
  }
  if (input.amount !== undefined && input.type !== undefined) {
    patch.amount = normalizeSignedAmount(input.type, input.amount);
  }
  // Keep transfer semantics consistent: transfers never affect the budget.
  if (input.type === "transfer") patch.affectsBudget = false;
  const [row] = await ctx.db
    .update(transactions)
    .set(patch)
    .where(and(eq(transactions.id, id), eq(transactions.workspaceId, workspaceId)))
    .returning();
  if (!row) return null;

  if (!opts.skipEvent) {
    await emitEvent(ctx.db, {
      workspaceId,
      type: "transaction.updated",
      payload: { transactionId: id },
      automationDepth: opts.automationDepth ?? 0,
    });
    await ctx.realtime.publish({
      type: "transaction.updated",
      entityType: "transaction",
      entityId: id,
      workspaceId,
      timestamp: new Date().toISOString(),
    });
  }
  return row;
}

export async function deleteTransaction(ctx: ServiceContext, id: string, workspaceId: string) {
  const [row] = await ctx.db
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.workspaceId, workspaceId)))
    .returning();
  if (!row) return null;
  await ctx.realtime.publish({
    type: "transaction.deleted",
    entityType: "transaction",
    entityId: id,
    workspaceId,
    timestamp: new Date().toISOString(),
  });
  return row;
}

export async function getTransaction(ctx: ServiceContext, id: string, workspaceId: string) {
  const [row] = await ctx.db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

/** Loads a transaction plus all descendants and returns them as a tree. */
export async function getTransactionTree(ctx: ServiceContext, id: string, workspaceId: string) {
  const root = await getTransaction(ctx, id, workspaceId);
  if (!root) return null;
  // Load the whole workspace tree subset by walking children iteratively.
  const collected = [root];
  let frontier = [root.id];
  while (frontier.length > 0) {
    const children = await ctx.db
      .select()
      .from(transactions)
      .where(and(eq(transactions.workspaceId, workspaceId), inArray(transactions.parentId, frontier)));
    if (children.length === 0) break;
    collected.push(...children);
    frontier = children.map((c) => c.id);
  }
  const [tree] = buildTransactionTree(collected.filter((t) => t.id === id || t.parentId));
  return tree ?? { node: root, children: [] };
}

export async function listTransactions(
  ctx: ServiceContext,
  workspaceId: string,
  query: TransactionQuery,
) {
  const conditions = [eq(transactions.workspaceId, workspaceId)];
  if (query.categoryId) conditions.push(eq(transactions.categoryId, query.categoryId));
  if (query.accountId) conditions.push(eq(transactions.accountId, query.accountId));
  if (query.status) conditions.push(eq(transactions.status, query.status));
  if (query.type) conditions.push(eq(transactions.type, query.type));
  if (query.from) conditions.push(gte(transactions.date, query.from));
  if (query.to) conditions.push(lte(transactions.date, query.to));
  if (query.rootOnly) conditions.push(isNull(transactions.parentId));
  if (query.search) {
    const term = `%${query.search}%`;
    const searchCond = or(
      ilike(transactions.merchantName, term),
      ilike(transactions.description, term),
    );
    if (searchCond) conditions.push(searchCond);
  }
  return ctx.db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(query.limit)
    .offset(query.offset);
}
