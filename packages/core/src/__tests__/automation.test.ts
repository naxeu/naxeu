import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  isWithinAutomationDepth,
  ruleMatches,
  selectMatchingRules,
  type AutomationRuleLike,
} from "../automation.js";

function rule(partial: Partial<AutomationRuleLike>): AutomationRuleLike {
  return {
    id: "r",
    name: "rule",
    triggerType: "transaction.created",
    conditions: [],
    actions: [{ type: "set_category", categoryId: "00000000-0000-0000-0000-000000000000" }],
    priority: 100,
    isActive: true,
    ...partial,
  };
}

describe("evaluateCondition", () => {
  it("matches merchant_contains case-insensitively", () => {
    expect(evaluateCondition({ op: "merchant_contains", value: "zooplus" }, { merchantName: "ZooPlus Shop" })).toBe(true);
    expect(evaluateCondition({ op: "merchant_contains", value: "rewe" }, { merchantName: "ZooPlus" })).toBe(false);
  });
  it("compares amounts", () => {
    expect(evaluateCondition({ op: "amount_greater_than", value: 50 }, { amount: "-90.00" })).toBe(false);
    expect(evaluateCondition({ op: "amount_greater_than", value: 50 }, { amount: "90.00" })).toBe(true);
    expect(evaluateCondition({ op: "amount_less_than", value: 0 }, { amount: "-90.00" })).toBe(true);
  });
  it("detects empty category", () => {
    expect(evaluateCondition({ op: "category_empty" }, { categoryId: null })).toBe(true);
    expect(evaluateCondition({ op: "category_empty" }, { categoryId: "x" })).toBe(false);
  });
});

describe("ruleMatches", () => {
  it("requires the trigger to match", () => {
    const r = rule({ conditions: [{ op: "merchant_contains", value: "zooplus" }] });
    expect(ruleMatches(r, "transaction.updated", { merchantName: "ZooPlus" })).toBe(false);
    expect(ruleMatches(r, "transaction.created", { merchantName: "ZooPlus" })).toBe(true);
  });
  it("ignores inactive rules", () => {
    const r = rule({ isActive: false });
    expect(ruleMatches(r, "transaction.created", {})).toBe(false);
  });
  it("requires all conditions to pass", () => {
    const r = rule({
      conditions: [
        { op: "merchant_contains", value: "zooplus" },
        { op: "amount_greater_than", value: 100 },
      ],
    });
    expect(ruleMatches(r, "transaction.created", { merchantName: "ZooPlus", amount: "50" })).toBe(false);
    expect(ruleMatches(r, "transaction.created", { merchantName: "ZooPlus", amount: "150" })).toBe(true);
  });
});

describe("selectMatchingRules", () => {
  it("orders by priority and drops non-matching", () => {
    const rules = [
      rule({ id: "low", priority: 200, conditions: [{ op: "merchant_contains", value: "zoo" }] }),
      rule({ id: "high", priority: 10, conditions: [{ op: "merchant_contains", value: "zoo" }] }),
      rule({ id: "nomatch", priority: 1, conditions: [{ op: "merchant_contains", value: "rewe" }] }),
      rule({ id: "inactive", priority: 1, isActive: false }),
    ];
    const matched = selectMatchingRules(rules, "transaction.created", { merchantName: "ZooPlus" });
    expect(matched.map((r) => r.id)).toEqual(["high", "low"]);
  });
});

describe("automation loop guard", () => {
  it("stops past the max depth", () => {
    expect(isWithinAutomationDepth(0, 5)).toBe(true);
    expect(isWithinAutomationDepth(5, 5)).toBe(true);
    expect(isWithinAutomationDepth(6, 5)).toBe(false);
  });
});
