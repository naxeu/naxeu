import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { accounts, transactions } from "@naxeu/db/schema";
import { computeAccountBalances, transactionIsLive } from "@naxeu/core";
import { createAccountSchema } from "@naxeu/shared";

export async function registerAccountRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  app.get("/accounts", { preHandler: app.authenticate }, async (request) => {
    const rows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.workspaceId, request.auth.workspaceId))
      .orderBy(asc(accounts.name));

    // Derive each account's balance from all its transactions (transfers move
    // money between the source account_id and the destination counter_account_id).
    const txs = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.workspaceId, request.auth.workspaceId), transactionIsLive));
    const balances = computeAccountBalances(
      txs.map((t) => ({
        id: t.id,
        accountId: t.accountId,
        counterAccountId: t.counterAccountId,
        type: t.type as never,
        status: t.status,
        amount: t.amount,
        affectsAccountBalance: t.affectsAccountBalance,
        affectsBudget: t.affectsBudget,
      })),
    );

    return {
      accounts: rows.map((a) => ({ ...a, balance: balances[a.id] ?? "0.00" })),
    };
  });

  app.post("/accounts", { preHandler: app.authenticate }, async (request, reply) => {
    const input = createAccountSchema.parse(request.body);
    const [row] = await db
      .insert(accounts)
      .values({ workspaceId: request.auth.workspaceId, name: input.name, type: input.type, currency: input.currency })
      .returning();
    return reply.code(201).send({ account: row });
  });
}
