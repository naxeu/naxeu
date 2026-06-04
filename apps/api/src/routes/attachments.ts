import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { attachments, categories, transactions } from "@naxeu/db/schema";
import { createTransaction, emitEvent } from "@naxeu/core";
import { createTransactionSchema } from "@naxeu/shared";

export async function registerAttachmentRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  const storageDir = app.env.storageDir;

  app.post("/attachments", { preHandler: app.authenticate }, async (request, reply) => {
    const file = await request.file();
    if (!file) return reply.code(400).send({ error: "validation_error", message: "file is required" });

    const buffer = await file.toBuffer();
    const transactionId = (file.fields.transactionId as { value?: string } | undefined)?.value ?? null;
    const kind = ((file.fields.kind as { value?: string } | undefined)?.value as string) ?? "receipt";

    await mkdir(storageDir, { recursive: true });
    const storageName = `${randomUUID()}-${file.filename}`;
    await writeFile(join(storageDir, storageName), buffer);

    const [row] = await ctx.db
      .insert(attachments)
      .values({
        workspaceId: request.auth.workspaceId,
        transactionId,
        fileName: file.filename,
        mimeType: file.mimetype,
        storagePath: storageName,
        fileSize: buffer.length,
        kind,
        status: "uploaded",
        createdByUserId: request.auth.userId,
      })
      .returning();

    await emitEvent(ctx.db, {
      workspaceId: request.auth.workspaceId,
      type: "attachment.created",
      payload: { attachmentId: row!.id },
    });

    return reply.code(201).send({ attachment: row });
  });

  app.get("/attachments/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await ctx.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.workspaceId, request.auth.workspaceId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Attachment not found" });
    return { attachment: row };
  });

  // Runs (mock) AI extraction and turns line items into child transactions.
  app.post("/attachments/:id/analyze", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await ctx.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.workspaceId, request.auth.workspaceId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Attachment not found" });

    await ctx.db.update(attachments).set({ status: "processing" }).where(eq(attachments.id, id));

    const extracted = await ctx.ai.extractAttachment({
      fileName: row.fileName,
      extractedText: row.extractedText,
    });

    // Determine / create the parent transaction the items hang off of.
    let parentId = row.transactionId;
    if (!parentId) {
      const parent = await createTransaction(
        ctx,
        createTransactionSchema.parse({
          type: "expense",
          status: "pending_review",
          date: extracted.date ?? new Date().toISOString().slice(0, 10),
          amount: extracted.total ?? "0",
          currency: extracted.currency,
          merchantName: extracted.merchantName,
          description: `Beleg ${row.fileName}`,
          source: "attachment",
          affectsAccountBalance: true,
          affectsBudget: false,
        }),
        { workspaceId: request.auth.workspaceId, userId: request.auth.userId },
      );
      parentId = parent.id;
    }

    // Map category hints to existing categories by name.
    const cats = await ctx.db
      .select()
      .from(categories)
      .where(eq(categories.workspaceId, request.auth.workspaceId));
    const catByName = new Map(cats.map((c) => [c.name.toLowerCase(), c.id] as const));

    const children = [];
    for (const item of extracted.lineItems) {
      const categoryId = item.categoryHint ? catByName.get(item.categoryHint.toLowerCase()) ?? null : null;
      const childTx = await createTransaction(
        ctx,
        createTransactionSchema.parse({
          parentId,
          type: "item",
          status: "confirmed",
          date: extracted.date ?? new Date().toISOString().slice(0, 10),
          amount: item.amount,
          currency: extracted.currency,
          categoryId,
          merchantName: item.description,
          description: item.description,
          source: "attachment",
          // Line items affect budget, not the account balance.
          affectsAccountBalance: false,
          affectsBudget: true,
        }),
        { workspaceId: request.auth.workspaceId, userId: request.auth.userId, skipEvent: true },
      );
      children.push(childTx);
    }

    const [updated] = await ctx.db
      .update(attachments)
      .set({
        status: "processed",
        extractedText: `Mock-Extraktion von ${row.fileName}`,
        extractedData: extracted,
        transactionId: parentId,
      })
      .where(eq(attachments.id, id))
      .returning();

    await ctx.realtime.publish({
      type: "attachment.updated",
      entityType: "attachment",
      entityId: id,
      workspaceId: request.auth.workspaceId,
      timestamp: new Date().toISOString(),
      meta: { status: "processed" },
    });

    return { attachment: updated, parentId, children };
  });
}
