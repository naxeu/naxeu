import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { messagePreferences, messages } from "@naxeu/db/schema";
import { messagePreferenceSchema } from "@naxeu/shared";

export async function registerMessageRoutes(app: FastifyInstance): Promise<void> {
  const { db, realtime } = app.ctx;

  app.get("/messages", { preHandler: app.authenticate }, async (request) => {
    const { type, severity, status } = request.query as {
      type?: string;
      severity?: string;
      status?: string;
    };
    const conditions = [eq(messages.workspaceId, request.auth.workspaceId)];
    if (type) conditions.push(eq(messages.type, type));
    if (severity) conditions.push(eq(messages.severity, severity));
    if (status) conditions.push(eq(messages.status, status));
    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(200);
    return { messages: rows };
  });

  app.put("/messages/:id/read", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db
      .update(messages)
      .set({ status: "read", readAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.workspaceId, request.auth.workspaceId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found", message: "Message not found" });
    await realtime.publish({
      type: "message.updated",
      entityType: "message",
      entityId: id,
      workspaceId: request.auth.workspaceId,
      timestamp: new Date().toISOString(),
    });
    return { message: row };
  });

  app.put("/messages/:id/dismiss", { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [row] = await db
      .update(messages)
      .set({ status: "dismissed", dismissedAt: new Date() })
      .where(and(eq(messages.id, id), eq(messages.workspaceId, request.auth.workspaceId)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not_found", message: "Message not found" });
    return { message: row };
  });

  app.get("/message-preferences", { preHandler: app.authenticate }, async (request) => {
    const rows = await db
      .select()
      .from(messagePreferences)
      .where(eq(messagePreferences.userId, request.auth.userId));
    return { preferences: rows };
  });

  app.put("/message-preferences", { preHandler: app.authenticate }, async (request) => {
    const input = messagePreferenceSchema.parse(request.body);
    // Upsert per (user, messageType).
    const [existing] = await db
      .select()
      .from(messagePreferences)
      .where(
        and(
          eq(messagePreferences.userId, request.auth.userId),
          eq(messagePreferences.messageType, input.messageType),
        ),
      )
      .limit(1);

    const values = {
      workspaceId: request.auth.workspaceId,
      userId: request.auth.userId,
      messageType: input.messageType,
      severity: input.severity ?? null,
      preferredChannels: input.preferredChannels,
      mode: input.mode,
      deliveryPolicy: input.deliveryPolicy,
      escalationAfterMinutes: input.escalationAfterMinutes ?? null,
      escalationChannels: input.escalationChannels,
      quietHoursStart: input.quietHoursStart ?? null,
      quietHoursEnd: input.quietHoursEnd ?? null,
      isEnabled: input.isEnabled,
    };

    if (existing) {
      const [row] = await db
        .update(messagePreferences)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(messagePreferences.id, existing.id))
        .returning();
      return { preference: row };
    }
    const [row] = await db.insert(messagePreferences).values(values).returning();
    return { preference: row };
  });
}
