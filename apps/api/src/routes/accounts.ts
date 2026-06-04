import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { accounts } from "@naxeu/db/schema";
import { createAccountSchema } from "@naxeu/shared";

export async function registerAccountRoutes(app: FastifyInstance): Promise<void> {
  const { db } = app.ctx;

  app.get("/accounts", { preHandler: app.authenticate }, async (request) => {
    const rows = await db
      .select()
      .from(accounts)
      .where(eq(accounts.workspaceId, request.auth.workspaceId))
      .orderBy(asc(accounts.name));
    return { accounts: rows };
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
