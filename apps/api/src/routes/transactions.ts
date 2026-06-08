import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@naxeu/db";
import { attachments, transactions } from "@naxeu/db/schema";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  getTransactionTree,
  listTransactions,
  transactionIsLive,
  tryMergeImportTransactionWithMatchingReceipt,
  updateTransaction,
} from "@naxeu/core";
import {
  createTransactionSchema,
  transactionQuerySchema,
  updateTransactionSchema,
} from "@naxeu/shared";

async function loadLinkedAttachments(
  db: Database,
  workspaceId: string,
  transactionId: string,
): Promise<
  Array<{
    id: string;
    fileName: string;
    mimeType: string;
    status: string;
    receiptTransactionId: string | null;
  }>
> {
  const directRows = await db
    .select({
      id: attachments.id,
      fileName: attachments.fileName,
      mimeType: attachments.mimeType,
      status: attachments.status,
      transactionId: attachments.transactionId,
    })
    .from(attachments)
    .where(and(eq(attachments.workspaceId, workspaceId), eq(attachments.transactionId, transactionId)));

  const shellRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        eq(transactions.parentId, transactionId),
        eq(transactions.source, "attachment"),
        transactionIsLive,
      ),
    );
  const shellIds = shellRows.map((r) => r.id);
  const fromShell =
    shellIds.length > 0
      ? await db
          .select({
            id: attachments.id,
            fileName: attachments.fileName,
            mimeType: attachments.mimeType,
            status: attachments.status,
            transactionId: attachments.transactionId,
          })
          .from(attachments)
          .where(and(eq(attachments.workspaceId, workspaceId), inArray(attachments.transactionId, shellIds)))
      : [];

  const byId = new Map<
    string,
    { id: string; fileName: string; mimeType: string; status: string; transactionId: string | null }
  >();
  for (const r of [...directRows, ...fromShell]) byId.set(r.id, r);
  return [...byId.values()].map((r) => ({
    id: r.id,
    fileName: r.fileName,
    mimeType: r.mimeType,
    status: r.status,
    receiptTransactionId: r.transactionId,
  }));
}

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
    if (tx.type === "expense" && (tx.source === "manual" || tx.source === "import") && !tx.parentId) {
      try {
        await tryMergeImportTransactionWithMatchingReceipt(ctx, {
          workspaceId: request.auth.workspaceId,
          importTransactionId: tx.id,
        });
      } catch {
        /* best-effort */
      }
    }
    return reply.code(201).send({ transaction: tx });
  });

  app.get("/transactions/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tx = await getTransaction(ctx, id, request.auth.workspaceId);
    if (!tx) return reply.code(404).send({ error: "not_found", message: "Transaction not found" });
    const linkedAttachments = await loadLinkedAttachments(ctx.db, request.auth.workspaceId, id);
    return { transaction: tx, linkedAttachments };
  });

  app.put("/transactions/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = updateTransactionSchema.parse(request.body);
    const row = await updateTransaction(ctx, id, request.auth.workspaceId, input);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Transaction not found" });
    return { transaction: row };
  });

  app.delete("/transactions/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const row = await deleteTransaction(ctx, id, request.auth.workspaceId);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Transaction not found" });
    return { deleted: true };
  });

  app.post("/transactions/:id/children", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parent = await getTransaction(ctx, id, request.auth.workspaceId);
    if (!parent) return reply.code(404).send({ error: "not_found", message: "Parent not found" });
    const input = createTransactionSchema.parse({ ...(request.body as object), parentId: id });
    const child = await createTransaction(ctx, input, {
      workspaceId: request.auth.workspaceId,
      userId: request.auth.userId,
    });
    return reply.code(201).send({ transaction: child });
  });

  app.get("/transactions/:id/tree", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tree = await getTransactionTree(ctx, id, request.auth.workspaceId);
    if (!tree) return reply.code(404).send({ error: "not_found", message: "Transaction not found" });
    return { tree };
  });
}
