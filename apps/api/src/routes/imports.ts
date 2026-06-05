import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { imports, transactions } from "@naxeu/db/schema";
import { createTransaction } from "@naxeu/core";
import {
  createTransactionSchema,
  guessImportColumnMappingFromHeaders,
  importCommitColumnMappingSchema,
  padRow,
  type ImportColumnMappingGuess,
  type ImportCommitColumnMapping,
  type SuggestedImportColumnMapping,
} from "@naxeu/shared";
import { bufferToTabular, detectImportFormatFromName } from "../import/parseSpreadsheet.js";

interface NormalizedRow {
  date: string;
  amount: string;
  description: string;
  merchant: string;
}

function distinctSuggestion(s: SuggestedImportColumnMapping): boolean {
  if (s.date === null || s.amount === null || s.description === null) return false;
  if (s.date === s.amount || s.date === s.description || s.amount === s.description) return false;
  if (
    s.merchant !== null &&
    (s.merchant === s.date || s.merchant === s.amount || s.merchant === s.description)
  ) {
    return false;
  }
  return true;
}

function mergeSuggestionFromAi(
  heuristic: ReturnType<typeof guessImportColumnMappingFromHeaders>,
  ai: ImportColumnMappingGuess | null,
  colCount: number,
): {
  suggestion: SuggestedImportColumnMapping;
  confidence: number;
  source: "heuristic" | "ai";
  needsUserMapping: boolean;
} {
  let suggestion = heuristic.suggestion;
  let confidence = heuristic.confidence;
  let source: "heuristic" | "ai" = "heuristic";

  const aiOk =
    ai !== null &&
    colCount > 0 &&
    !ai.needsUserConfirmation &&
    ai.confidence >= 0.68 &&
    ai.dateColumn >= 0 &&
    ai.dateColumn < colCount &&
    ai.amountColumn >= 0 &&
    ai.amountColumn < colCount &&
    ai.descriptionColumn >= 0 &&
    ai.descriptionColumn < colCount &&
    (ai.merchantColumn === null ||
      (ai.merchantColumn >= 0 &&
        ai.merchantColumn < colCount &&
        ai.merchantColumn !== ai.dateColumn &&
        ai.merchantColumn !== ai.amountColumn &&
        ai.merchantColumn !== ai.descriptionColumn)) &&
    ai.dateColumn !== ai.amountColumn &&
    ai.dateColumn !== ai.descriptionColumn &&
    ai.amountColumn !== ai.descriptionColumn;

  if (aiOk && ai) {
    suggestion = {
      date: ai.dateColumn,
      amount: ai.amountColumn,
      description: ai.descriptionColumn,
      merchant: ai.merchantColumn,
    };
    confidence = Math.max(confidence, ai.confidence);
    source = "ai";
  }

  const incomplete =
    suggestion.date === null ||
    suggestion.amount === null ||
    suggestion.description === null ||
    !distinctSuggestion(suggestion);

  const needsUserMapping =
    incomplete ||
    (source === "heuristic" && (heuristic.needsUserMapping || confidence < 0.42)) ||
    (source === "ai" && ai !== null && (ai.needsUserConfirmation || confidence < 0.55));

  return { suggestion, confidence, source, needsUserMapping };
}

function rowFromMapping(row: string[], mapping: ImportCommitColumnMapping, width: number): NormalizedRow {
  const r = padRow(row, width);
  return {
    date: r[mapping.date] ?? "",
    amount: r[mapping.amount] ?? "",
    description: r[mapping.description] ?? "",
    merchant:
      mapping.merchant !== null && mapping.merchant >= 0 ? (r[mapping.merchant] ?? "") : "",
  };
}

function hashRow(workspaceId: string, row: NormalizedRow): string {
  return createHash("sha256")
    .update(`${workspaceId}|${row.date}|${row.amount}|${row.merchant}`)
    .digest("hex");
}

/** Normalises common bank date formats to `YYYY-MM-DD` for `isoDate`. */
function normalizeDateForImport(s: string): string {
  const t = s.trim().split(/\s+/u)[0] ?? "";
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})/u.exec(t);
  if (de) {
    const d = de[1]!.padStart(2, "0");
    const m = de[2]!.padStart(2, "0");
    const y = de[3]!;
    return `${y}-${m}-${d}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/u.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return t.slice(0, 10);
}

async function readMultipartImport(request: FastifyRequest): Promise<{
  buffer: Buffer;
  filename: string;
  accountId: string | null;
  mappingJson: string | null;
}> {
  let buffer: Buffer | null = null;
  let filename = "upload";
  let accountId: string | null = null;
  let mappingJson: string | null = null;

  for await (const part of request.parts()) {
    if (part.type === "file" && part.fieldname === "file") {
      buffer = await part.toBuffer();
      filename = part.filename ?? "upload";
    } else if (part.type === "field" && part.fieldname === "accountId") {
      const v = String(part.value ?? "").trim();
      accountId = v === "" ? null : v;
    } else if (part.type === "field" && part.fieldname === "mapping") {
      const v = String(part.value ?? "").trim();
      mappingJson = v === "" ? null : v;
    }
  }

  if (!buffer) {
    const err = new Error("Datei (file) fehlt.");
    (err as { statusCode?: number }).statusCode = 400;
    throw err;
  }
  return { buffer, filename, accountId, mappingJson };
}

export async function registerImportRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;

  app.post("/imports/analyze", { preHandler: app.authenticate }, async (request, reply) => {
    let buffer: Buffer;
    let filename: string;
    let accountId: string | null;
    try {
      const p = await readMultipartImport(request);
      buffer = p.buffer;
      filename = p.filename;
      accountId = p.accountId;
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      return reply
        .code(err.statusCode ?? 400)
        .send({ error: "validation_error", message: err.message ?? "Ungültige Anfrage." });
    }

    const format = detectImportFormatFromName(filename);
    const sheet = bufferToTabular(format, buffer);
    if (sheet.headers.length === 0) {
      return reply.code(400).send({ error: "validation_error", message: "Keine Tabellendaten erkannt." });
    }

    const heuristic = guessImportColumnMappingFromHeaders(sheet.headers);
    const sampleRows = sheet.rows.slice(0, 12).map((r) => padRow(r, sheet.headers.length));
    let aiGuess: ImportColumnMappingGuess | null = null;
    try {
      aiGuess = await ctx.ai.guessImportColumnMapping(sheet.headers, sampleRows);
    } catch {
      aiGuess = null;
    }

    const merged = mergeSuggestionFromAi(heuristic, aiGuess, sheet.headers.length);
    const previewRows = sheet.rows.slice(0, 10).map((r) => padRow(r, sheet.headers.length));

    return reply.send({
      format,
      fileName: filename,
      accountId,
      headers: sheet.headers,
      previewRows,
      suggestedMapping: merged.suggestion,
      confidence: merged.confidence,
      needsUserMapping: merged.needsUserMapping,
      source: merged.source,
      delimiter: sheet.delimiter,
      hasHeader: sheet.hasHeader,
    });
  });

  app.post("/imports/commit", { preHandler: app.authenticate }, async (request, reply) => {
    let buffer: Buffer;
    let filename: string;
    let accountId: string | null;
    let mappingJson: string | null;
    try {
      const p = await readMultipartImport(request);
      buffer = p.buffer;
      filename = p.filename;
      accountId = p.accountId;
      mappingJson = p.mappingJson;
    } catch (e) {
      const err = e as { statusCode?: number; message?: string };
      return reply
        .code(err.statusCode ?? 400)
        .send({ error: "validation_error", message: err.message ?? "Ungültige Anfrage." });
    }

    if (!mappingJson) {
      return reply.code(400).send({
        error: "validation_error",
        message: "Feld „mapping“ (JSON mit Spaltenindizes) fehlt.",
      });
    }

    let mapping: ImportCommitColumnMapping;
    try {
      mapping = importCommitColumnMappingSchema.parse(JSON.parse(mappingJson));
    } catch {
      return reply.code(400).send({ error: "validation_error", message: "Ungültiges mapping JSON." });
    }

    const format = detectImportFormatFromName(filename);
    const sheet = bufferToTabular(format, buffer);
    const width = sheet.headers.length;
    if (width === 0) {
      return reply.code(400).send({ error: "validation_error", message: "Keine Tabellendaten erkannt." });
    }

    const maxIdx = Math.max(mapping.date, mapping.amount, mapping.description, mapping.merchant ?? -1);
    if (maxIdx >= width) {
      return reply.code(400).send({ error: "validation_error", message: "Spaltenindex außerhalb des Bereichs." });
    }

    const importSource = format === "xlsx" ? "xlsx" : "csv";

    const [importRow] = await ctx.db
      .insert(imports)
      .values({
        workspaceId: request.auth.workspaceId,
        accountId,
        source: importSource,
        fileName: filename,
        status: "processing",
        createdByUserId: request.auth.userId,
      })
      .returning();

    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < sheet.rows.length; i += 1) {
      const row = rowFromMapping(sheet.rows[i]!, mapping, width);
      if (!row.date.trim() && !row.amount.trim()) {
        skipped += 1;
        continue;
      }

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

      const amountClean = row.amount.replace(/[^\d.,-]/gu, "").replace(",", ".");
      const amountNum = Number.parseFloat(amountClean);
      if (Number.isNaN(amountNum)) {
        skipped += 1;
        continue;
      }

      const dateIso = normalizeDateForImport(row.date);
      const type = amountNum >= 0 ? "income" : "expense";

      try {
        await createTransaction(
          ctx,
          createTransactionSchema.parse({
            accountId,
            type,
            status: "pending_review",
            date: dateIso,
            amount: Math.abs(amountNum).toFixed(2),
            merchantName: row.merchant.trim() || null,
            description: row.description.trim() || null,
            source: "import",
            externalId,
          }),
          { workspaceId: request.auth.workspaceId, userId: request.auth.userId, skipEvent: true },
        );
        imported += 1;
      } catch {
        skipped += 1;
      }

      await ctx.realtime.publish({
        type: "import.progress",
        entityType: "import",
        entityId: importRow!.id,
        workspaceId: request.auth.workspaceId,
        timestamp: new Date().toISOString(),
        meta: { processed: i + 1, total: sheet.rows.length },
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
