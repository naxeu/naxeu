import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { categories } from "@naxeu/db/schema";
import { quickInputSchema } from "@naxeu/shared";
import { z } from "zod";

const categorizeSchema = z.object({
  merchantName: z.string().nullish(),
  description: z.string().nullish(),
  amount: z.string().nullish(),
});

const extractSchema = z.object({
  fileName: z.string(),
  extractedText: z.string().nullish(),
});

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;

  app.post("/ai/parse-quick-input", { preHandler: app.authenticate }, async (request) => {
    const { input } = quickInputSchema.parse(request.body);
    const parsed = await ctx.ai.parseQuickTransactionInput(input);

    // Best-effort: resolve the category hint to a real category id.
    let categoryId: string | null = null;
    if (parsed.categoryHint) {
      const cats = await ctx.db
        .select()
        .from(categories)
        .where(eq(categories.workspaceId, request.auth.workspaceId));
      categoryId = cats.find((c) => c.name.toLowerCase() === parsed.categoryHint!.toLowerCase())?.id ?? null;
    }
    return { parsed, categoryId };
  });

  app.post("/ai/categorize-transaction", { preHandler: app.authenticate }, async (request) => {
    const input = categorizeSchema.parse(request.body);
    const result = await ctx.ai.categorizeTransaction(input);
    let categoryId: string | null = null;
    if (result.categoryName) {
      const cats = await ctx.db
        .select()
        .from(categories)
        .where(eq(categories.workspaceId, request.auth.workspaceId));
      categoryId = cats.find((c) => c.name.toLowerCase() === result.categoryName!.toLowerCase())?.id ?? null;
    }
    return { ...result, categoryId };
  });

  app.post("/ai/extract-attachment", { preHandler: app.authenticate }, async (request) => {
    const input = extractSchema.parse(request.body);
    const result = await ctx.ai.extractAttachment(input);
    return { extracted: result };
  });
}
