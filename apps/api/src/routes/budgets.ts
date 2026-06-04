import type { FastifyInstance } from "fastify";
import { computeWorkspaceMonthlyBudgets } from "@naxeu/core";
import { MONTH_REGEX, toMonthKey } from "@naxeu/shared";

export async function registerBudgetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/budgets/monthly", { preHandler: app.authenticate }, async (request, reply) => {
    const { month } = request.query as { month?: string };
    const monthKey = month ?? toMonthKey(new Date());
    if (!MONTH_REGEX.test(monthKey)) {
      return reply.code(400).send({ error: "validation_error", message: "month must be YYYY-MM" });
    }
    const result = await computeWorkspaceMonthlyBudgets(app.ctx, request.auth.workspaceId, monthKey);
    return result;
  });
}
