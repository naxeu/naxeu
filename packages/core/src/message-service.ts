import { and, eq } from "drizzle-orm";
import { messageAttempts, messagePreferences, messages } from "@naxeu/db/schema";
import {
  channelForUser,
  type MessageChannel,
  type MessageSeverity,
  type MessageType,
} from "@naxeu/shared";
import type { ServiceContext } from "./context.js";
import { planDelivery, type DeliveryPreference } from "./message-delivery.js";

export interface CreateMessageArgs {
  workspaceId: string;
  userId: string;
  type: MessageType;
  severity: MessageSeverity;
  title: string;
  body?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  actionLabel?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown>;
}

const DEFAULT_PREFERENCE: DeliveryPreference = {
  preferredChannels: ["push", "email"],
  mode: "instant",
  deliveryPolicy: "first_success",
  quietHoursStart: null,
  quietHoursEnd: null,
  isEnabled: true,
};

async function loadPreference(
  ctx: ServiceContext,
  userId: string,
  type: MessageType,
): Promise<DeliveryPreference> {
  const [pref] = await ctx.db
    .select()
    .from(messagePreferences)
    .where(and(eq(messagePreferences.userId, userId), eq(messagePreferences.messageType, type)))
    .limit(1);
  if (!pref) return DEFAULT_PREFERENCE;
  return {
    preferredChannels: pref.preferredChannels as string[],
    mode: pref.mode as DeliveryPreference["mode"],
    deliveryPolicy: pref.deliveryPolicy as DeliveryPreference["deliveryPolicy"],
    quietHoursStart: pref.quietHoursStart,
    quietHoursEnd: pref.quietHoursEnd,
    isEnabled: pref.isEnabled,
  };
}

/**
 * Creates an in-app message and performs external delivery according to the
 * user's preferences. The message is ALWAYS persisted (and thus visible
 * in-app); external channels are only an extra notification.
 */
export async function createMessage(ctx: ServiceContext, args: CreateMessageArgs) {
  const [message] = await ctx.db
    .insert(messages)
    .values({
      workspaceId: args.workspaceId,
      userId: args.userId,
      type: args.type,
      severity: args.severity,
      title: args.title,
      body: args.body ?? null,
      status: "unread",
      relatedEntityType: args.relatedEntityType ?? null,
      relatedEntityId: args.relatedEntityId ?? null,
      actionLabel: args.actionLabel ?? null,
      actionUrl: args.actionUrl ?? null,
      deliveryStatus: "pending",
      metadata: args.metadata ?? {},
    })
    .returning();

  const msg = message!;

  // Realtime: notify the user that a new message exists (no full payload).
  await ctx.realtime.publish({
    type: "message.created",
    entityType: "message",
    entityId: msg.id,
    workspaceId: args.workspaceId,
    timestamp: new Date().toISOString(),
    meta: {
      severity: args.severity,
      type: args.type,
      ...(args.actionUrl ? { actionUrl: args.actionUrl } : {}),
      ...(args.actionLabel ? { actionLabel: args.actionLabel } : {}),
    },
  });

  const pref = await loadPreference(ctx, args.userId, args.type);
  const plan = planDelivery(pref, args.severity);

  if (plan.deferred || plan.channels.length === 0) {
    const status = plan.deferred ? "pending" : "skipped";
    await ctx.db
      .update(messages)
      .set({ deliveryStatus: status, deliveredVia: null })
      .where(eq(messages.id, msg.id));
    return msg;
  }

  const sendersByChannel = new Map((ctx.senders ?? []).map((s) => [s.channel, s] as const));
  let deliveredVia: MessageChannel | null = null;
  let anyDelivered = false;

  for (const channel of plan.channels) {
    const sender = sendersByChannel.get(channel as "push" | "email" | "sms");
    let ok = false;
    let provider: string | undefined;
    let providerMessageId: string | undefined;
    let error: string | undefined;

    if (!sender) {
      error = "no sender configured";
    } else {
      const res = await sender.send({ userId: args.userId, title: args.title, body: args.body ?? null });
      ok = res.ok;
      provider = res.provider;
      providerMessageId = res.providerMessageId;
      error = res.error;
    }

    // Only actual delivery attempts are logged.
    await ctx.db.insert(messageAttempts).values({
      messageId: msg.id,
      userId: args.userId,
      channel,
      status: ok ? "delivered" : "failed",
      provider: provider ?? null,
      providerMessageId: providerMessageId ?? null,
      errorMessage: error ?? null,
    });

    if (ok) {
      anyDelivered = true;
      deliveredVia = channel;
      // first_success: stop after the first successful channel (no double send).
      if (plan.stopAtFirstSuccess) break;
    }
  }

  await ctx.db
    .update(messages)
    .set({
      deliveryStatus: anyDelivered ? "delivered" : "failed",
      deliveredVia,
      deliveredAt: anyDelivered ? new Date() : null,
    })
    .where(eq(messages.id, msg.id));

  return msg;
}
