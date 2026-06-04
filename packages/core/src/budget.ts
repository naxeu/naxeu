import { computeBudgetSpentCents, type TxLike } from "./transaction-logic.js";
import { fromCents, toCents } from "./money.js";

export interface CategoryLike {
  id: string;
  name: string;
  type: string;
  monthlyBudget: string | null;
  budgetAlertThreshold: string | null;
}

export interface CategoryBudgetStatus {
  categoryId: string;
  name: string;
  type: string;
  monthlyBudget: string | null;
  spent: string;
  remaining: string | null;
  /** Fraction of budget used (0..n), null when no budget set. */
  usedFraction: number | null;
  alertThreshold: number;
  thresholdReached: boolean;
  overBudget: boolean;
}

export interface MonthlyBudgetResult {
  month: string;
  categories: CategoryBudgetStatus[];
  totalBudget: string;
  totalSpent: string;
  totalRemaining: string;
}

const DEFAULT_THRESHOLD = 0.8;

/**
 * Computes the monthly budget overview from categories + transactions.
 *
 * Budgets are read directly off categories (there is no budgets table). Spent
 * is derived purely from transactions flagged `affectsBudget`, so parent/child
 * trees are never double counted.
 */
export function computeMonthlyBudgets(
  month: string,
  categories: CategoryLike[],
  transactions: TxLike[],
): MonthlyBudgetResult {
  const txByCategory = new Map<string, TxLike[]>();
  for (const tx of transactions) {
    if (!tx.categoryId) continue;
    const list = txByCategory.get(tx.categoryId) ?? [];
    list.push(tx);
    txByCategory.set(tx.categoryId, list);
  }

  let totalBudgetCents = 0;
  let totalSpentCents = 0;

  const result: CategoryBudgetStatus[] = categories
    .filter((c) => c.type === "expense")
    .map((category) => {
      const txs = txByCategory.get(category.id) ?? [];
      const spentCents = computeBudgetSpentCents(txs);
      const budgetCents = category.monthlyBudget !== null ? toCents(category.monthlyBudget) : null;
      const threshold = category.budgetAlertThreshold
        ? Number.parseFloat(category.budgetAlertThreshold)
        : DEFAULT_THRESHOLD;

      totalSpentCents += spentCents;
      if (budgetCents !== null) totalBudgetCents += budgetCents;

      const usedFraction = budgetCents && budgetCents > 0 ? spentCents / budgetCents : null;
      const remainingCents = budgetCents !== null ? budgetCents - spentCents : null;

      return {
        categoryId: category.id,
        name: category.name,
        type: category.type,
        monthlyBudget: budgetCents !== null ? fromCents(budgetCents) : null,
        spent: fromCents(spentCents),
        remaining: remainingCents !== null ? fromCents(remainingCents) : null,
        usedFraction,
        alertThreshold: threshold,
        thresholdReached: usedFraction !== null && usedFraction >= threshold,
        overBudget: usedFraction !== null && usedFraction >= 1,
      };
    });

  return {
    month,
    categories: result,
    totalBudget: fromCents(totalBudgetCents),
    totalSpent: fromCents(totalSpentCents),
    totalRemaining: fromCents(totalBudgetCents - totalSpentCents),
  };
}
