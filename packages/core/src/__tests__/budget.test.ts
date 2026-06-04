import { describe, expect, it } from "vitest";
import { computeMonthlyBudgets, type CategoryLike } from "../budget.js";
import type { TxLike } from "../transaction-logic.js";

const cats: CategoryLike[] = [
  { id: "food", name: "Lebensmittel", type: "expense", monthlyBudget: "100", budgetAlertThreshold: "0.8" },
  { id: "salary", name: "Gehalt", type: "income", monthlyBudget: null, budgetAlertThreshold: null },
];

function expense(id: string, categoryId: string, amount: string, affectsBudget = true): TxLike {
  return {
    id,
    parentId: null,
    categoryId,
    type: "expense",
    status: "confirmed",
    amount,
    affectsAccountBalance: true,
    affectsBudget,
  };
}

describe("computeMonthlyBudgets", () => {
  it("computes spent and remaining for expense categories", () => {
    const result = computeMonthlyBudgets("2026-06", cats, [
      expense("a", "food", "-40.00"),
      expense("b", "food", "-25.50"),
    ]);
    const food = result.categories.find((c) => c.categoryId === "food")!;
    expect(food.spent).toBe("65.50");
    expect(food.remaining).toBe("34.50");
    expect(food.thresholdReached).toBe(false);
    expect(result.totalBudget).toBe("100.00");
    expect(result.totalSpent).toBe("65.50");
  });

  it("flags threshold reached at 80%", () => {
    const result = computeMonthlyBudgets("2026-06", cats, [expense("a", "food", "-85.00")]);
    const food = result.categories.find((c) => c.categoryId === "food")!;
    expect(food.thresholdReached).toBe(true);
    expect(food.overBudget).toBe(false);
  });

  it("flags over budget at 100%+", () => {
    const result = computeMonthlyBudgets("2026-06", cats, [expense("a", "food", "-120.00")]);
    const food = result.categories.find((c) => c.categoryId === "food")!;
    expect(food.overBudget).toBe(true);
  });

  it("excludes income categories from the expense overview", () => {
    const result = computeMonthlyBudgets("2026-06", cats, []);
    expect(result.categories.every((c) => c.type === "expense")).toBe(true);
  });

  it("does not double count parent + child (only budget-affecting rows)", () => {
    const result = computeMonthlyBudgets("2026-06", cats, [
      expense("p", "food", "-100.00", false), // parent excluded from budget
      expense("c", "food", "-40.00", true), // child counted
    ]);
    const food = result.categories.find((c) => c.categoryId === "food")!;
    expect(food.spent).toBe("40.00");
  });
});
