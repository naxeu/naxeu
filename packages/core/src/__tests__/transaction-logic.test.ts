import { describe, expect, it } from "vitest";
import {
  buildTransactionTree,
  computeAccountBalanceDelta,
  computeAccountBalances,
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
  it("stores transfers negative on the source account", () => {
    expect(normalizeSignedAmount("transfer", "450")).toBe("-450.00");
    expect(normalizeSignedAmount("transfer", "-450")).toBe("-450.00");
  });
});

describe("credit card + transfer logic", () => {
  const bank = "bank";
  const card = "card";

  it("credit-card purchases count toward the budget; the statement payoff transfer does not", () => {
    // Two purchases booked on the credit-card account in the purchase month.
    const purchases: TxLike[] = [
      tx({ id: "p1", accountId: card, amount: "-89.90", affectsBudget: true }),
      tx({ id: "p2", accountId: card, amount: "-9.99", affectsBudget: true }),
    ];
    // Later: bank pays the card statement — a transfer, no budget impact.
    const payoff = tx({
      id: "t",
      type: "transfer",
      accountId: bank,
      counterAccountId: card,
      amount: "-99.89",
      affectsBudget: false,
    });

    // Budget counts the purchases (99.89) but NOT the transfer.
    expect(computeBudgetSpent([...purchases, payoff])).toBe("99.89");
  });

  it("transfer moves money between accounts (source down, destination up)", () => {
    const txs: TxLike[] = [
      // Card balance after purchases: -99.89
      tx({ id: "p1", accountId: card, amount: "-89.90" }),
      tx({ id: "p2", accountId: card, amount: "-9.99" }),
      // Bank starts with salary.
      tx({ id: "s", type: "income", accountId: bank, amount: "1000.00" }),
      // Pay off the card from the bank.
      tx({
        id: "t",
        type: "transfer",
        accountId: bank,
        counterAccountId: card,
        amount: "-99.89",
        affectsBudget: false,
      }),
    ];
    const balances = computeAccountBalances(txs);
    // Bank: 1000 - 99.89 = 900.11
    expect(balances[bank]).toBe("900.11");
    // Card: -99.89 + 99.89 = 0.00 (paid off)
    expect(balances[card]).toBe("0.00");
  });

  it("does not count a transfer as an account expense twice", () => {
    const txs: TxLike[] = [
      tx({ id: "a", accountId: bank, amount: "-50.00" }),
      tx({ id: "t", type: "transfer", accountId: bank, counterAccountId: card, amount: "-450.00", affectsBudget: false }),
    ];
    // Transfer is excluded from the budget entirely.
    expect(computeBudgetSpent(txs)).toBe("50.00");
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
