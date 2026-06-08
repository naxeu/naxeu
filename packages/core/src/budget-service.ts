import { and, eq, gte, lt } from "drizzle-orm";
import { categories as categoriesTable, messages, transactions } from "@naxeu/db/schema";
import type { ServiceContext } from "./context.js";
import { computeMonthlyBudgets, type MonthlyBudgetResult } from "./budget.js";
import { createMessage } from "./message-service.js";
import { transactionIsLive } from "./transaction-service.js";

/** Returns [firstDay, firstDayOfNextMonth] as YYYY-MM-DD strings. */
export function monthBounds(month: string): [string, string] {
  const [yearStr, monthStr] = month.split("-");
  const year = Number.parseInt(yearStr ?? "1970", 10);
  const m = Number.parseInt(monthStr ?? "01", 10);
  const start = `${month}-01`;
  const nextYear = m === 12 ? year + 1 : year;
  const nextMonth = m === 12 ? 1 : m + 1;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return [start, end];
}

export async function computeWorkspaceMonthlyBudgets(
  ctx: ServiceContext,
  workspaceId: string,
  month: string,
): Promise<MonthlyBudgetResult> {
  const [start, end] = monthBounds(month);

  const cats = await ctx.db
    .select()
    .from(categoriesTable)
    .where(and(eq(categoriesTable.workspaceId, workspaceId), eq(categoriesTable.isArchived, false)));

  const txs = await ctx.db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        gte(transactions.date, start),
        lt(transactions.date, end),
        transactionIsLive,
      ),
    );

  return computeMonthlyBudgets(
    month,
    cats.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      monthlyBudget: c.monthlyBudget,
      budgetAlertThreshold: c.budgetAlertThreshold,
    })),
    txs.map((t) => ({
      id: t.id,
      parentId: t.parentId,
      accountId: t.accountId,
      counterAccountId: t.counterAccountId,
      categoryId: t.categoryId,
      type: t.type as never,
      status: t.status,
      amount: t.amount,
      affectsAccountBalance: t.affectsAccountBalance,
      affectsBudget: t.affectsBudget,
    })),
  );
}

/**
 * Checks the budget thresholds for the month a transaction belongs to and
 * creates a budget message when a category first crosses its alert threshold.
 *
 * Idempotency: we only create a message if there isn't already an unread/read
 * budget message for the same category+month, so the same threshold doesn't
 * spam the user repeatedly.
 */
export async function checkBudgetThresholds(
  ctx: ServiceContext,
  workspaceId: string,
  userId: string,
  month: string,
) {
  const result = await computeWorkspaceMonthlyBudgets(ctx, workspaceId, month);
  const created: string[] = [];

  for (const cat of result.categories) {
    if (!cat.thresholdReached) continue;

    // De-dupe: a single budget message per category+month+threshold-state.
    const dedupeKey = `${cat.categoryId}:${month}:${cat.overBudget ? "over" : "threshold"}`;
    if (await hasDedupe(ctx, cat.categoryId, dedupeKey)) continue;

    const pct = cat.usedFraction !== null ? Math.round(cat.usedFraction * 100) : 0;
    await createMessage(ctx, {
      workspaceId,
      userId,
      type: "budget",
      severity: cat.overBudget ? "warning" : "info",
      title: cat.overBudget
        ? `Budget überschritten: ${cat.name}`
        : `Budget-Warnung: ${cat.name}`,
      body: `Du hast ${cat.spent} € von ${cat.monthlyBudget} € (${pct}%) im Monat ${month} ausgegeben.`,
      relatedEntityType: "category",
      relatedEntityId: cat.categoryId,
      metadata: { month, dedupeKey, usedFraction: cat.usedFraction },
    });
    created.push(cat.categoryId);
  }
  return created;
}

/** Returns true if a budget message with the given dedupeKey already exists. */
async function hasDedupe(ctx: ServiceContext, categoryId: string, dedupeKey: string): Promise<boolean> {
  const rows = await ctx.db
    .select({ id: messages.id, metadata: messages.metadata })
    .from(messages)
    .where(and(eq(messages.type, "budget"), eq(messages.relatedEntityId, categoryId)));
  return rows.some((r) => (r.metadata as { dedupeKey?: string }).dedupeKey === dedupeKey);
}
