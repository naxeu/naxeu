import { and, eq } from "drizzle-orm";
import { automationRules, automationRuns, transactions } from "@naxeu/db/schema";
import type { AutomationAction } from "@naxeu/shared";
import type { ServiceContext } from "./context.js";
import { selectMatchingRules, type AutomationRuleLike } from "./automation.js";
import { createMessage } from "./message-service.js";
import { transactionIsLive } from "./transaction-service.js";

export interface RunAutomationArgs {
  workspaceId: string;
  userId: string;
  transactionId: string;
  triggerType: "transaction.created" | "transaction.updated";
  eventId?: string | null;
  automationDepth: number;
}

/**
 * Loads active rules for a workspace and applies all matching ones to a
 * transaction. Each application is logged in `automation_runs`. Mutations are
 * written directly (no new domain event) to avoid infinite automation loops —
 * combined with the depth guard enforced by the worker.
 */
export async function runAutomationsForTransaction(ctx: ServiceContext, args: RunAutomationArgs) {
  const [tx] = await ctx.db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, args.transactionId),
        eq(transactions.workspaceId, args.workspaceId),
        transactionIsLive,
      ),
    )
    .limit(1);
  if (!tx) return { applied: 0 };

  const ruleRows = await ctx.db
    .select()
    .from(automationRules)
    .where(and(eq(automationRules.workspaceId, args.workspaceId), eq(automationRules.isActive, true)));

  const rules: AutomationRuleLike[] = ruleRows.map((r) => ({
    id: r.id,
    name: r.name,
    triggerType: r.triggerType,
    conditions: Array.isArray(r.conditions) ? (r.conditions as AutomationRuleLike["conditions"]) : [],
    actions: Array.isArray(r.actions) ? (r.actions as AutomationAction[]) : [],
    priority: r.priority,
    isActive: r.isActive,
  }));

  const matching = selectMatchingRules(rules, args.triggerType, {
    merchantName: tx.merchantName,
    description: tx.description,
    amount: tx.amount,
    categoryId: tx.categoryId,
  });

  let applied = 0;
  const txPatch: Record<string, unknown> = {};

  for (const rule of matching) {
    const [run] = await ctx.db
      .insert(automationRuns)
      .values({
        workspaceId: args.workspaceId,
        automationRuleId: rule.id,
        eventId: args.eventId ?? null,
        status: "running",
        startedAt: new Date(),
      })
      .returning();

    try {
      for (const action of rule.actions) {
        await applyAction(ctx, action, {
          workspaceId: args.workspaceId,
          userId: args.userId,
          transactionId: tx.id,
          patch: txPatch,
        });
      }
      await ctx.db
        .update(automationRuns)
        .set({
          status: "success",
          finishedAt: new Date(),
          result: { ruleName: rule.name, actions: rule.actions.length },
        })
        .where(eq(automationRuns.id, run!.id));
      applied += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ctx.db
        .update(automationRuns)
        .set({ status: "failed", finishedAt: new Date(), errorMessage: message })
        .where(eq(automationRuns.id, run!.id));
      // A failing rule produces an automation/error message for the user.
      await createMessage(ctx, {
        workspaceId: args.workspaceId,
        userId: args.userId,
        type: "automation",
        severity: "error",
        title: `Automation fehlgeschlagen: ${rule.name}`,
        body: message,
        relatedEntityType: "automation_rule",
        relatedEntityId: rule.id,
      });
    }

    await ctx.realtime.publish({
      type: "automation.run",
      entityType: "automation",
      entityId: rule.id,
      workspaceId: args.workspaceId,
      timestamp: new Date().toISOString(),
    });
  }

  // Apply the accumulated transaction mutations once, without re-triggering.
  if (Object.keys(txPatch).length > 0) {
    await ctx.db
      .update(transactions)
      .set({ ...txPatch, updatedAt: new Date() })
      .where(and(eq(transactions.id, tx.id), transactionIsLive));
    await ctx.realtime.publish({
      type: "transaction.updated",
      entityType: "transaction",
      entityId: tx.id,
      workspaceId: args.workspaceId,
      timestamp: new Date().toISOString(),
    });
  }

  return { applied };
}

async function applyAction(
  ctx: ServiceContext,
  action: AutomationAction,
  scope: { workspaceId: string; userId: string; transactionId: string; patch: Record<string, unknown> },
) {
  switch (action.type) {
    case "set_category":
      if (action.categoryId) scope.patch.categoryId = action.categoryId;
      break;
    case "set_affects_budget":
      if (typeof action.affectsBudget === "boolean") scope.patch.affectsBudget = action.affectsBudget;
      break;
    case "set_status":
      if (action.status) scope.patch.status = action.status;
      break;
    case "create_message":
      await createMessage(ctx, {
        workspaceId: scope.workspaceId,
        userId: scope.userId,
        type: action.messageType ?? "automation",
        severity: action.messageSeverity ?? "info",
        title: action.messageTitle ?? "Automation",
        body: action.messageBody ?? null,
        relatedEntityType: "transaction",
        relatedEntityId: scope.transactionId,
      });
      break;
    default:
      throw new Error(`Unknown automation action: ${(action as { type: string }).type}`);
  }
}
