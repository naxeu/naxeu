import { describe, expect, it } from "vitest";
import {
  buildTransactionTree,
  computeAccountBalanceDelta,
  computeBudgetSpent,
  normalizeSignedAmount,
  type TxLike,
} from "../transaction-logic.js";

function tx(partial: Partial<TxLike> & Pick<TxLike, "id" | "amount">): TxLike {
  return {
    parentId: null,
    categoryId: "cat",
    type: "expense",
    status: "confirmed",
    affectsAccountBalance: true,
    affectsBudget: true,
    ...partial,
  };
}

describe("normalizeSignedAmount", () => {
  it("makes expenses negative and income positive", () => {
    expect(normalizeSignedAmount("expense", "84.30")).toBe("-84.30");
    expect(normalizeSignedAmount("income", "3250")).toBe("3250.00");
    expect(normalizeSignedAmount("refund", "10")).toBe("10.00");
    expect(normalizeSignedAmount("fee", "2.5")).toBe("-2.50");
  });
});

describe("budget double counting", () => {
  it("does not count a parent and its children twice", () => {
    // Credit card statement parent affects balance but NOT budget.
    const parent = tx({ id: "p", amount: "-450.00", affectsBudget: false, affectsAccountBalance: true });
    // Children carry the budget but not the balance.
    const c1 = tx({ id: "c1", parentId: "p", amount: "-89.90", affectsBudget: true, affectsAccountBalance: false });
    const c2 = tx({ id: "c2", parentId: "p", amount: "-9.99", affectsBudget: true, affectsAccountBalance: false });

    // Budget only sums children (99.89), not the 450 parent.
    expect(computeBudgetSpent([parent, c1, c2])).toBe("99.89");
    // Balance only counts the parent (-450), not the children.
    expect(computeAccountBalanceDelta([parent, c1, c2])).toBe("-450.00");
  });

  it("credit card statement affects account but not budget", () => {
    const statement = tx({ id: "s", amount: "-450.00", affectsBudget: false });
    expect(computeBudgetSpent([statement])).toBe("0.00");
    expect(computeAccountBalanceDelta([statement])).toBe("-450.00");
  });

  it("receipt line items affect budget but not account", () => {
    const item = tx({ id: "i", amount: "-3.20", affectsBudget: true, affectsAccountBalance: false });
    expect(computeBudgetSpent([item])).toBe("3.20");
    expect(computeAccountBalanceDelta([item])).toBe("0.00");
  });

  it("handles nested children", () => {
    const root = tx({ id: "r", amount: "-84.30", affectsBudget: false });
    const mid = tx({ id: "m", parentId: "r", amount: "-84.30", affectsBudget: false });
    const leaf1 = tx({ id: "l1", parentId: "m", amount: "-3.20", affectsBudget: true, affectsAccountBalance: false });
    const leaf2 = tx({ id: "l2", parentId: "m", amount: "-12.50", affectsBudget: true, affectsAccountBalance: false });
    expect(computeBudgetSpent([root, mid, leaf1, leaf2])).toBe("15.70");
  });

  it("refunds reduce spent correctly", () => {
    const spent = tx({ id: "a", amount: "-50.00" });
    const refund = tx({ id: "b", type: "refund", amount: "20.00" });
    // 50 spent minus 20 refunded = 30 net spent.
    expect(computeBudgetSpent([spent, refund])).toBe("30.00");
  });

  it("ignores archived/ignored/draft transactions", () => {
    const counted = tx({ id: "a", amount: "-10.00" });
    const ignored = tx({ id: "b", amount: "-99.00", status: "ignored" });
    const archived = tx({ id: "c", amount: "-99.00", status: "archived" });
    expect(computeBudgetSpent([counted, ignored, archived])).toBe("10.00");
  });
});

describe("buildTransactionTree", () => {
  it("builds a forest from parentId links", () => {
    const rows = [
      { id: "p", parentId: null },
      { id: "c1", parentId: "p" },
      { id: "c2", parentId: "p" },
      { id: "g", parentId: "c1" },
    ];
    const tree = buildTransactionTree(rows);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(2);
    const c1 = tree[0]!.children.find((c) => c.node.id === "c1");
    expect(c1!.children[0]!.node.id).toBe("g");
  });
});
