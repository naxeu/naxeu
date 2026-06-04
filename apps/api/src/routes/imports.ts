import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { imports, transactions } from "@naxeu/db/schema";
import { createTransaction } from "@naxeu/core";
import { createTransactionSchema } from "@naxeu/shared";

interface CsvRow {
  date: string;
  amount: string;
  description: string;
  merchant: string;
}

/** Minimal CSV parser for the fixed `date,amount,description,merchant` columns. */
function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/u).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const header = lines[0]!.toLowerCase();
  const hasHeader = header.includes("date") && header.includes("amount");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines.map((line) => {
    const [date = "", amount = "", description = "", merchant = ""] = line.split(",").map((c) => c.trim());
    return { date, amount, description, merchant };
  });
}

function hashRow(workspaceId: string, row: CsvRow): string {
  return createHash("sha256").update(`${workspaceId}|${row.date}|${row.amount}|${row.merchant}`).digest("hex");
}

export async function registerImportRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;

  app.post("/imports/csv", { preHandler: app.authenticate }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "validation_error", message: "file is required" });
    const accountId = (file.fields.accountId as { value?: string } | undefined)?.value ?? null;
    const text = (await file.toBuffer()).toString("utf8");
    const rows = parseCsv(text);

    const [importRow] = await ctx.db
      .insert(imports)
      .values({
        workspaceId: request.auth.workspaceId,
        accountId,
        source: "csv",
        fileName: file.filename,
        status: "processing",
        createdByUserId: request.auth.userId,
      })
      .returning();

    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      const externalId = hashRow(request.auth.workspaceId, row);

      const [dupe] = await ctx.db
        .select({ id: transactions.id })
        .from(transactions)
        .where(
          and(eq(transactions.workspaceId, request.auth.workspaceId), eq(transactions.externalId, externalId)),
        )
        .limit(1);
      if (dupe) {
        skipped += 1;
        continue;
      }

      const amountNum = Number.parseFloat(row.amount.replace(",", "."));
      const type = amountNum >= 0 ? "income" : "expense";
      await createTransaction(
        ctx,
        createTransactionSchema.parse({
          accountId,
          type,
          status: "pending_review",
          date: row.date,
          amount: Math.abs(amountNum).toFixed(2),
          merchantName: row.merchant || null,
          description: row.description || null,
          source: "import",
          externalId,
        }),
        { workspaceId: request.auth.workspaceId, userId: request.auth.userId, skipEvent: true },
      );
      imported += 1;

      // Emit lightweight progress events.
      await ctx.realtime.publish({
        type: "import.progress",
        entityType: "import",
        entityId: importRow!.id,
        workspaceId: request.auth.workspaceId,
        timestamp: new Date().toISOString(),
        meta: { processed: i + 1, total: rows.length },
      });
    }

    const [finished] = await ctx.db
      .update(imports)
      .set({ status: "completed", importedCount: imported, skippedCount: skipped })
      .where(eq(imports.id, importRow!.id))
      .returning();

    return reply.code(201).send({ import: finished, imported, skipped });
  });

  app.get("/imports", { preHandler: app.authenticate }, async (request) => {
    const rows = await ctx.db
      .select()
      .from(imports)
      .where(eq(imports.workspaceId, request.auth.workspaceId))
      .orderBy(desc(imports.createdAt));
    return { imports: rows };
  });

  app.get("/imports/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await ctx.db
      .select()
      .from(imports)
      .where(and(eq(imports.id, id), eq(imports.workspaceId, request.auth.workspaceId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Import not found" });
    return { import: row };
  });
}
