import { z } from "zod";

/**
 * Central definition of every domain enum. We declare each one as a readonly
 * tuple so we get both a runtime array (for iteration / seeding / UI selects)
 * and a precise TypeScript union type, plus a matching Zod schema.
 */
function enumOf<const T extends readonly [string, ...string[]]>(values: T) {
  return {
    values,
    schema: z.enum(values),
  };
}

export const WorkspaceMemberRole = enumOf(["owner", "admin", "member", "child", "viewer"]);
export type WorkspaceMemberRole = (typeof WorkspaceMemberRole.values)[number];

export const AccountType = enumOf(["cash", "bank", "credit_card", "savings", "loan", "manual"]);
export type AccountType = (typeof AccountType.values)[number];

export const CategoryType = enumOf(["income", "expense", "transfer"]);
export type CategoryType = (typeof CategoryType.values)[number];

export const TransactionType = enumOf([
  "income",
  "expense",
  "transfer",
  "split",
  "correction",
  "item",
  "fee",
  "refund",
]);
export type TransactionType = (typeof TransactionType.values)[number];

export const TransactionStatus = enumOf([
  "draft",
  "pending_review",
  "confirmed",
  "ignored",
  "archived",
]);
export type TransactionStatus = (typeof TransactionStatus.values)[number];

export const TransactionSource = enumOf([
  "manual",
  "import",
  "ai",
  "attachment",
  "automation",
  "system",
]);
export type TransactionSource = (typeof TransactionSource.values)[number];

export const AttachmentKind = enumOf(["receipt", "invoice", "document", "image", "other"]);
export type AttachmentKind = (typeof AttachmentKind.values)[number];

export const AttachmentStatus = enumOf(["uploaded", "processing", "processed", "failed"]);
export type AttachmentStatus = (typeof AttachmentStatus.values)[number];

export const EventStatus = enumOf(["pending", "processing", "processed", "failed"]);
export type EventStatus = (typeof EventStatus.values)[number];

export const AutomationTriggerType = enumOf([
  "transaction.created",
  "transaction.updated",
  "attachment.created",
]);
export type AutomationTriggerType = (typeof AutomationTriggerType.values)[number];

export const AutomationRunStatus = enumOf(["pending", "running", "success", "failed", "skipped"]);
export type AutomationRunStatus = (typeof AutomationRunStatus.values)[number];

export const MessageType = enumOf([
  "alert",
  "notice",
  "error",
  "news",
  "budget",
  "automation",
  "import",
  "receipt",
  "ai",
  "security",
  "system",
]);
export type MessageType = (typeof MessageType.values)[number];

export const MessageSeverity = enumOf(["info", "success", "warning", "error", "critical"]);
export type MessageSeverity = (typeof MessageSeverity.values)[number];

export const MessageStatus = enumOf(["unread", "read", "dismissed"]);
export type MessageStatus = (typeof MessageStatus.values)[number];

export const MessageDeliveryStatus = enumOf(["pending", "delivered", "failed", "skipped"]);
export type MessageDeliveryStatus = (typeof MessageDeliveryStatus.values)[number];

export const MessageChannel = enumOf(["in_app", "push", "email", "sms"]);
export type MessageChannel = (typeof MessageChannel.values)[number];

export const MessageMode = enumOf(["instant", "digest_daily", "digest_weekly", "never"]);
export type MessageMode = (typeof MessageMode.values)[number];

export const DeliveryPolicy = enumOf([
  "first_success",
  "all_channels",
  "in_app_only",
  "digest",
  "escalation",
]);
export type DeliveryPolicy = (typeof DeliveryPolicy.values)[number];

/** Conditions usable in automation rules. */
export const AutomationConditionOp = enumOf([
  "merchant_contains",
  "description_contains",
  "amount_greater_than",
  "amount_less_than",
  "category_empty",
]);
export type AutomationConditionOp = (typeof AutomationConditionOp.values)[number];

/** Actions usable in automation rules. */
export const AutomationActionType = enumOf([
  "set_category",
  "set_affects_budget",
  "set_status",
  "create_message",
]);
export type AutomationActionType = (typeof AutomationActionType.values)[number];

/** Domain event types persisted in the events table. */
export const DomainEventType = enumOf([
  "transaction.created",
  "transaction.updated",
  "transaction.deleted",
  "attachment.created",
  "attachment.processed",
  "budget.threshold_reached",
  "message.created",
  "automation.failed",
]);
export type DomainEventType = (typeof DomainEventType.values)[number];

/** Lightweight event types broadcast over the realtime WebSocket. */
export const RealtimeEventType = enumOf([
  "transaction.created",
  "transaction.updated",
  "transaction.deleted",
  "message.created",
  "message.updated",
  "import.progress",
  "attachment.updated",
  "automation.run",
]);
export type RealtimeEventType = (typeof RealtimeEventType.values)[number];
