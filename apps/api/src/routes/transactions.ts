import type { FastifyInstance } from "fastify";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  getTransactionTree,
  listTransactions,
  updateTransaction,
} from "@naxeu/core";
import {
  createTransactionSchema,
  transactionQuerySchema,
  updateTransactionSchema,
} from "@naxeu/shared";

export async function registerTransactionRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;

  app.get("/transactions", { preHandler: app.authenticate }, async (request) => {
    const query = transactionQuerySchema.parse(request.query);
    const rows = await listTransactions(ctx, request.auth.workspaceId, query);
    return { transactions: rows };
  });

  app.post("/transactions", { preHandler: app.authenticate }, async (request, reply) => {
    const input = createTransactionSchema.parse(request.body);
    const tx = await createTransaction(ctx, input, {
      workspaceId: request.auth.workspaceId,
      userId: request.auth.userId,
    });
    return reply.code(201).send({ transaction: tx });
  });

  app.get("/transactions/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tx = await getTransaction(ctx, id, request.auth.workspaceId);
    if (!tx) return reply.code(404).send({ error: "not_found", message: "Transaction not found" });
    return { transaction: tx };
  });

  app.put("/transactions/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateTransactionSchema.parse(request.body);
    const tx = await updateTransaction(ctx, id, request.auth.workspaceId, input);
    if (!tx) return reply.code(404).send({ error: "not_found", message: "Transaction not found" });
    return { transaction: tx };
  });

  app.delete("/transactions/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tx = await deleteTransaction(ctx, id, request.auth.workspaceId);
    if (!tx) return reply.code(404).send({ error: "not_found", message: "Transaction not found" });
    return { deleted: true };
  });

  app.post("/transactions/:id/children", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parent = await getTransaction(ctx, id, request.auth.workspaceId);
    if (!parent) return reply.code(404).send({ error: "not_found", message: "Parent not found" });
    const input = createTransactionSchema.parse({ ...(request.body as object), parentId: id });
    const tx = await createTransaction(ctx, input, {
      workspaceId: request.auth.workspaceId,
      userId: request.auth.userId,
    });
    return reply.code(201).send({ transaction: tx });
  });

  app.get("/transactions/:id/tree", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tree = await getTransactionTree(ctx, id, request.auth.workspaceId);
    if (!tree) return reply.code(404).send({ error: "not_found", message: "Transaction not found" });
    return { tree };
  });
}
