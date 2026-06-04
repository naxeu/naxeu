import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { automationRules, automationRuns } from "@naxeu/db/schema";
import { createAutomationRuleSchema, updateAutomationRuleSchema } from "@naxeu/shared";

export async function registerAutomationRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  app.get("/automation-rules", { preHandler: app.authenticate }, async (request) => {
    const rows = await db
      .select()
      .from(automationRules)
      .where(eq(automationRules.workspaceId, request.auth.workspaceId))
      .orderBy(automationRules.priority);
    return { rules: rows };
  });

  app.post("/automation-rules", { preHandler: app.authenticate }, async (request, reply) => {
    const input = createAutomationRuleSchema.parse(request.body);
    const [row] = await db
      .insert(automationRules)
      .values({
        workspaceId: request.auth.workspaceId,
        name: input.name,
        description: input.description ?? null,
        triggerType: input.triggerType,
        conditions: input.conditions,
        actions: input.actions,
        priority: input.priority,
        isActive: input.isActive,
        createdByUserId: request.auth.userId,
      })
      .returning();
    return reply.code(201).send({ rule: row });
  });

  app.put("/automation-rules/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateAutomationRuleSchema.parse(request.body);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const [k, v] of Object.entries(input)) if (v !== undefined) patch[k] = v;
    const [row] = await db
      .update(automationRules)
      .set(patch)
      .where(and(eq(automationRules.id, id), eq(automationRules.workspaceId, request.auth.workspaceId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found", message: "Rule not found" });
    return { rule: row };
  });

  app.delete("/automation-rules/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db
      .delete(automationRules)
      .where(and(eq(automationRules.id, id), eq(automationRules.workspaceId, request.auth.workspaceId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found", message: "Rule not found" });
    return { deleted: true };
  });

  app.get("/automation-runs", { preHandler: app.authenticate }, async (request) => {
    const rows = await db
      .select()
      .from(automationRuns)
      .where(eq(automationRuns.workspaceId, request.auth.workspaceId))
      .orderBy(desc(automationRuns.createdAt))
      .limit(100);
    return { runs: rows };
  });
}
