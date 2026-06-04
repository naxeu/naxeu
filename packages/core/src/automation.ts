import type { AutomationAction, AutomationCondition } from "@naxeu/shared";
import { toCents } from "./money.js";

export interface AutomationRuleLike {
  id: string;
  name: string;
  triggerType: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  priority: number;
  isActive: boolean;
}

export interface AutomationContext {
  merchantName?: string | null;
  description?: string | null;
  amount?: string | null;
  categoryId?: string | null;
}

/** Evaluates a single condition against a transaction context. */
export function evaluateCondition(cond: AutomationCondition, ctx: AutomationContext): boolean {
  const merchant = (ctx.merchantName ?? "").toLowerCase();
  const description = (ctx.description ?? "").toLowerCase();
  switch (cond.op) {
    case "merchant_contains":
      return merchant.includes(String(cond.value ?? "").toLowerCase());
    case "description_contains":
      return description.includes(String(cond.value ?? "").toLowerCase());
    case "amount_greater_than":
      return toCents(ctx.amount ?? "0") > toCents(String(cond.value ?? "0"));
    case "amount_less_than":
      return toCents(ctx.amount ?? "0") < toCents(String(cond.value ?? "0"));
    case "category_empty":
      return !ctx.categoryId;
    default:
      return false;
  }
}

/** A rule matches when its trigger fits and ALL conditions evaluate true. */
export function ruleMatches(
  rule: AutomationRuleLike,
  triggerType: string,
  ctx: AutomationContext,
): boolean {
  if (!rule.isActive) return false;
  if (rule.triggerType !== triggerType) return false;
  return rule.conditions.every((c) => evaluateCondition(c, ctx));
}

/**
 * Returns the rules that match, ordered by priority (lower number = higher
 * priority, evaluated first). Inactive rules are filtered out.
 */
export function selectMatchingRules(
  rules: AutomationRuleLike[],
  triggerType: string,
  ctx: AutomationContext,
): AutomationRuleLike[] {
  return rules
    .filter((r) => ruleMatches(r, triggerType, ctx))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Guard against automation-induced infinite loops. Each automation-originated
 * event carries an `automationDepth` in its correlation metadata; once it
 * exceeds the configured max we refuse to process further.
 */
export function isWithinAutomationDepth(depth: number, maxDepth: number): boolean {
  return depth <= maxDepth;
}
