import type { TransactionType } from "@naxeu/shared";
import { toCents, fromCents } from "./money.js";

/**
 * Minimal transaction shape used by the pure calculation helpers. The DB row
 * is a superset of this; tests construct plain objects.
 */
export interface TxLike {
  id: string;
  parentId?: string | null;
  accountId?: string | null;
  counterAccountId?: string | null;
  categoryId?: string | null;
  type: TransactionType;
  status: string;
  amount: string;
  affectsAccountBalance: boolean;
  affectsBudget: boolean;
}

/** Statuses that should be excluded from balance/budget calculations. */
const EXCLUDED_STATUSES = new Set(["ignored", "archived", "draft"]);

function isCounted(tx: TxLike): boolean {
  return !EXCLUDED_STATUSES.has(tx.status);
}

/**
 * Normalises the stored sign of an amount based on transaction type. Income and
 * refunds are positive (money in / money back), expenses/fees/items negative.
 *
 * Transfers are stored negative on `account_id` (the source — money leaves it);
 * the counterpart effect on `counter_account_id` is the opposite sign and is
 * applied during balance computation. Corrections/splits keep the caller sign.
 */
export function normalizeSignedAmount(type: TransactionType, amount: string): string {
  const cents = toCents(amount);
  const magnitude = Math.abs(cents);
  switch (type) {
    case "income":
    case "refund":
      return fromCents(magnitude);
    case "expense":
    case "fee":
    case "item":
    case "transfer":
      return fromCents(-magnitude);
    default:
      return fromCents(cents);
  }
}

/**
 * Sum of signed amounts that affect the account balance.
 *
 * Crucially this only counts transactions flagged `affectsAccountBalance`. A
 * credit-card statement (parent) affects the balance while its child line items
 * do not, so the same money is never counted twice.
 */
export function computeAccountBalanceDelta(txs: TxLike[]): string {
  const cents = txs
    .filter((t) => isCounted(t) && t.affectsAccountBalance)
    .reduce((sum, t) => sum + toCents(t.amount), 0);
  return fromCents(cents);
}

/**
 * Computes the balance per account from a flat transaction list.
 *
 * Only `affectsAccountBalance` rows count. A transfer applies its signed amount
 * to `account_id` (source) and the opposite amount to `counter_account_id`
 * (destination), so paying a credit-card statement from the bank reduces the
 * bank balance and raises the credit-card balance back toward zero — without
 * being counted as a budget expense (transfers carry `affectsBudget = false`).
 */
export function computeAccountBalances(txs: TxLike[]): Record<string, string> {
  const cents = new Map<string, number>();
  const add = (accountId: string, delta: number) => {
    cents.set(accountId, (cents.get(accountId) ?? 0) + delta);
  };
  for (const tx of txs) {
    if (!isCounted(tx) || !tx.affectsAccountBalance) continue;
    const amount = toCents(tx.amount);
    if (tx.accountId) add(tx.accountId, amount);
    if (tx.type === "transfer" && tx.counterAccountId) add(tx.counterAccountId, -amount);
  }
  const result: Record<string, string> = {};
  for (const [accountId, value] of cents) result[accountId] = fromCents(value);
  return result;
}

/**
 * Budget "spent" amount for expense categories, derived only from transactions
 * flagged `affectsBudget`. Returns a positive number representing money spent;
 * refunds (positive signed amounts) reduce the spent total.
 *
 * Because budget contribution is gated on `affectsBudget`, a parent and its
 * children are never both counted: typically only one level carries the flag.
 */
export function computeBudgetSpentCents(txs: TxLike[]): number {
  return txs
    .filter((t) => isCounted(t) && t.affectsBudget)
    .reduce((sum, t) => sum - toCents(t.amount), 0); // expenses negative -> positive spent
}

export function computeBudgetSpent(txs: TxLike[]): string {
  return fromCents(computeBudgetSpentCents(txs));
}

/** Generic node used to render the parent/child transaction tree in the UI. */
export interface TreeNode<T extends { id: string; parentId?: string | null }> {
  node: T;
  children: TreeNode<T>[];
}

/** Builds a forest from a flat list using parentId links. */
export function buildTransactionTree<T extends { id: string; parentId?: string | null }>(
  rows: T[],
): TreeNode<T>[] {
  const byId = new Map<string, TreeNode<T>>();
  for (const row of rows) byId.set(row.id, { node: row, children: [] });
  const roots: TreeNode<T>[] = [];
  for (const row of rows) {
    const current = byId.get(row.id)!;
    if (row.parentId && byId.has(row.parentId)) {
      byId.get(row.parentId)!.children.push(current);
    } else {
      roots.push(current);
    }
  }
  return roots;
}
