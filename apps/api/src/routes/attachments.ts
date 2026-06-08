import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { attachments } from "@naxeu/db/schema";
import {
  deleteAttachment,
  emitEvent,
  getTransactionTree,
  loadProcessedAttachmentAnalysis,
  markAttachmentAnalysisFailed,
  runAttachmentAnalysis,
  tryClaimAttachmentForAnalysis,
  tryMergeReceiptWithMatchingImport,
  updateAttachmentExtractedData,
} from "@naxeu/core";
import { patchAttachmentExtractedSchema } from "@naxeu/shared";
import { buildAttachmentThumbnailJpeg, readFileLimited } from "../lib/attachment-thumbnail.js";

export async function registerAttachmentRoutes(app: FastifyInstance): Promise<void> {
  const ctx = app.ctx;
  const storageDir = app.env.storageDir;

  app.get("/attachments", { preHandler: app.authenticate }, async (request) => {
    const rows = await ctx.db
      .select()
      .from(attachments)
      .where(eq(attachments.workspaceId, request.auth.workspaceId))
      .orderBy(desc(attachments.createdAt))
      .limit(200);
    return { attachments: rows };
  });

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

  /** Scaled JPEG preview for raster images (does not stream the original full-size file). */
  app.get("/attachments/:id/thumbnail", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const q = request.query as { max?: string };
    const maxEdge = Math.min(1024, Math.max(64, Number.parseInt(String(q.max ?? "240"), 10) || 240));

    const [row] = await ctx.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.workspaceId, request.auth.workspaceId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Attachment not found" });

    const storageRoot = resolve(storageDir);
    const absoluteFile = resolve(storageRoot, row.storagePath);
    const rel = relative(storageRoot, absoluteFile);
    if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
      return reply.code(400).send({ error: "validation_error", message: "Invalid attachment storage path" });
    }

    const buf = await readFileLimited(absoluteFile);
    if (!buf) {
      return reply.code(413).send({ error: "payload_too_large", message: "File too large for thumbnail" });
    }
    const jpeg = await buildAttachmentThumbnailJpeg(buf, maxEdge);
    if (!jpeg) {
      return reply.code(404).send({ error: "not_found", message: "Thumbnail not available for this file type" });
    }
    reply.header("Content-Type", "image/jpeg");
    reply.header("Cache-Control", "private, max-age=86400");
    return reply.send(jpeg);
  });

  app.patch("/attachments/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = patchAttachmentExtractedSchema.parse(request.body);
    const row = await updateAttachmentExtractedData(ctx, {
      attachmentId: id,
      workspaceId: request.auth.workspaceId,
      extractedData: body.extractedData,
    });
    if (!row) return reply.code(404).send({ error: "not_found", message: "Attachment not found" });
    return { attachment: row };
  });

  app.get("/attachments/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await ctx.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.workspaceId, request.auth.workspaceId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Attachment not found" });
    const transactionTree =
      row.transactionId != null
        ? await getTransactionTree(ctx, row.transactionId, request.auth.workspaceId)
        : null;
    return { attachment: row, transactionTree };
  });

  /** Binary file for previews (same auth as API). */
  app.get("/attachments/:id/file", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await ctx.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.workspaceId, request.auth.workspaceId)))
      .limit(1);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Attachment not found" });

    const storageRoot = resolve(storageDir);
    const absoluteFile = resolve(storageRoot, row.storagePath);
    const rel = relative(storageRoot, absoluteFile);
    if (rel.startsWith("..") || rel.includes(`..${sep}`)) {
      return reply.code(400).send({ error: "validation_error", message: "Invalid attachment storage path" });
    }

    reply.header("Content-Type", row.mimeType || "application/octet-stream");
    return reply.send(createReadStream(absoluteFile));
  });

  app.post("/attachments/:id/analyze", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ws = request.auth.workspaceId;

    const claimed = await tryClaimAttachmentForAnalysis(ctx, id, ws);
    if (!claimed) {
      const cached = await loadProcessedAttachmentAnalysis(ctx, id, ws);
      if (cached) {
        return {
          attachment: cached.attachment,
          parentId: cached.parentId,
          children: cached.children,
        };
      }
      const [cur] = await ctx.db
        .select({ status: attachments.status })
        .from(attachments)
        .where(and(eq(attachments.id, id), eq(attachments.workspaceId, ws)))
        .limit(1);
      if (cur?.status === "processing") {
        return reply.code(409).send({ error: "conflict", message: "Analyse läuft bereits" });
      }
      return reply.code(409).send({ error: "conflict", message: "Analyse für diesen Beleg ist nicht möglich" });
    }

    const userId = request.auth.userId;
    try {
      const result = await runAttachmentAnalysis(ctx, {
        storageDir,
        attachmentId: id,
        workspaceId: ws,
        userId,
      });
      try {
        await tryMergeReceiptWithMatchingImport(ctx, { workspaceId: ws, attachmentId: id });
      } catch {
        /* best-effort merge after manual analyze */
      }
      return {
        attachment: result.attachment,
        parentId: result.parentId,
        children: result.children,
        extractionSource: result.extractionSource,
      };
    } catch (err) {
      await markAttachmentAnalysisFailed(ctx, id, ws);
      const message = err instanceof Error ? err.message : "Analyse fehlgeschlagen";
      return reply.code(500).send({ error: "server_error", message });
    }
  });

  app.delete("/attachments/:id", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const ok = await deleteAttachment(ctx, {
      attachmentId: id,
      workspaceId: request.auth.workspaceId,
      storageDir,
    });
    if (!ok) return reply.code(404).send({ error: "not_found", message: "Attachment not found" });
    return reply.code(204).send();
  });
}
