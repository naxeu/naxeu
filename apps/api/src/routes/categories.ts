import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { categories } from "@naxeu/db/schema";
import { createCategorySchema, updateCategorySchema } from "@naxeu/shared";

export async function registerCategoryRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  app.get("/categories", { preHandler: app.authenticate }, async (request) => {
    const rows = await db
      .select()
      .from(categories)
      .where(eq(categories.workspaceId, request.auth.workspaceId))
      .orderBy(asc(categories.sortOrder), asc(categories.name));
    return { categories: rows };
  });

  app.post("/categories", { preHandler: app.authenticate }, async (request, reply) => {
    const input = createCategorySchema.parse(request.body);
    const [row] = await db
      .insert(categories)
      .values({
        workspaceId: request.auth.workspaceId,
        parentId: input.parentId ?? null,
        name: input.name,
        type: input.type,
        monthlyBudget: input.monthlyBudget ?? null,
        budgetAlertThreshold: input.budgetAlertThreshold != null ? String(input.budgetAlertThreshold) : "0.8",
        icon: input.icon ?? null,
        color: input.color ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    return reply.code(201).send({ category: row });
  });

  app.put("/categories/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateCategorySchema.parse(request.body);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.type !== undefined) patch.type = input.type;
    if (input.parentId !== undefined) patch.parentId = input.parentId;
    if (input.monthlyBudget !== undefined) patch.monthlyBudget = input.monthlyBudget;
    if (input.budgetAlertThreshold !== undefined) patch.budgetAlertThreshold = String(input.budgetAlertThreshold);
    if (input.icon !== undefined) patch.icon = input.icon;
    if (input.color !== undefined) patch.color = input.color;
    if (input.sortOrder !== undefined) patch.sortOrder = input.sortOrder;
    if (input.isArchived !== undefined) patch.isArchived = input.isArchived;

    const [row] = await db
      .update(categories)
      .set(patch)
      .where(and(eq(categories.id, id), eq(categories.workspaceId, request.auth.workspaceId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found", message: "Category not found" });
    return { category: row };
  });

  app.delete("/categories/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Soft delete by archiving to preserve historical transaction references.
    const [row] = await db
      .update(categories)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(and(eq(categories.id, id), eq(categories.workspaceId, request.auth.workspaceId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found", message: "Category not found" });
    return { archived: true };
  });
}
