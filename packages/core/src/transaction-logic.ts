import type { TransactionType } from "@naxeu/shared";
import { toCents, fromCents } from "./money.js";

/**
 * Minimal transaction shape used by the pure calculation helpers. The DB row
 * is a superset of this; tests construct plain objects.
 */
export interface TxLike {
  id: string;
  parentId?: string | null;
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
 * Transfers/corrections/splits keep the caller-provided sign.
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
