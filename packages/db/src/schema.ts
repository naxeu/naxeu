import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Naxeu Community Edition schema.
 *
 * Notes:
 *  - There is intentionally NO `budgets` table: budgets live on `categories`.
 *  - There is intentionally NO `receipts` table: receipts are `attachments`.
 *  - Branding is NOT stored in the DB; it lives in config/branding.yml.
 *  - Every domain row carries `workspace_id` even though the community edition
 *    runs a single household, so the same code powers cloud/enterprise later.
 */

const now = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updated = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique().notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: now(),
  updatedAt: updated(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").default("family").notNull(),
  createdAt: now(),
  updatedAt: updated(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").default("member").notNull(),
  createdAt: now(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  type: text("type").default("bank").notNull(),
  currency: text("currency").default("EUR").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: now(),
  updatedAt: updated(),
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  parentId: uuid("parent_id"),
  name: text("name").notNull(),
  type: text("type").default("expense").notNull(),
  // Budget is defined directly on the category — there is no budgets table.
  monthlyBudget: numeric("monthly_budget"),
  budgetAlertThreshold: numeric("budget_alert_threshold").default("0.8").notNull(),
  icon: text("icon"),
  color: text("color"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isSystem: boolean("is_system").default(false).notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdAt: now(),
  updatedAt: updated(),
});

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  // Self-referencing tree: a parent transaction can have child transactions.
  parentId: uuid("parent_id"),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  // For transfers (e.g. paying a credit-card statement from the bank account):
  // account_id is the source, counter_account_id the destination. Transfers move
  // money between accounts and must NOT be counted as a budget expense again.
  counterAccountId: uuid("counter_account_id").references(() => accounts.id, { onDelete: "set null" }),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  assignedToUserId: uuid("assigned_to_user_id").references(() => users.id, { onDelete: "set null" }),

  type: text("type").default("expense").notNull(),
  status: text("status").default("confirmed").notNull(),

  date: date("date").notNull(),
  bookingDate: date("booking_date"),
  valueDate: date("value_date"),

  amount: numeric("amount").notNull(),
  currency: text("currency").default("EUR").notNull(),

  merchantName: text("merchant_name"),
  description: text("description"),
  notes: text("notes"),

  source: text("source").default("manual").notNull(),

  // Whether this row contributes to account balance / budget calculations.
  affectsAccountBalance: boolean("affects_account_balance").default(true).notNull(),
  affectsBudget: boolean("affects_budget").default(true).notNull(),

  externalId: text("external_id"),
  importId: uuid("import_id"),

  confidence: numeric("confidence"),

  aiData: jsonb("ai_data").default(sql`'{}'::jsonb`).notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),

  createdAt: now(),
  updatedAt: updated(),
});

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  transactionId: uuid("transaction_id").references(() => transactions.id, { onDelete: "set null" }),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  storagePath: text("storage_path").notNull(),
  fileSize: integer("file_size"),
  kind: text("kind").default("receipt").notNull(),
  extractedText: text("extracted_text"),
  extractedData: jsonb("extracted_data").default(sql`'{}'::jsonb`).notNull(),
  status: text("status").default("uploaded").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: now(),
});

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  accountId: uuid("account_id").references(() => accounts.id, { onDelete: "set null" }),
  source: text("source").notNull(),
  fileName: text("file_name"),
  status: text("status").default("pending").notNull(),
  importedCount: integer("imported_count").default(0).notNull(),
  skippedCount: integer("skipped_count").default(0).notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: now(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  type: text("type").notNull(),
  payload: jsonb("payload").default(sql`'{}'::jsonb`).notNull(),
  status: text("status").default("pending").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  errorMessage: text("error_message"),
  // Used to trace automation-triggered events and prevent infinite loops.
  correlationId: text("correlation_id"),
  createdAt: now(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
});

export const automationRules = pgTable("automation_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  name: text("name").notNull(),
  description: text("description"),
  triggerType: text("trigger_type").notNull(),
  conditions: jsonb("conditions").default(sql`'{}'::jsonb`).notNull(),
  actions: jsonb("actions").default(sql`'{}'::jsonb`).notNull(),
  priority: integer("priority").default(100).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: now(),
  updatedAt: updated(),
});

export const automationRuns = pgTable("automation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  automationRuleId: uuid("automation_rule_id").references(() => automationRules.id, {
    onDelete: "set null",
  }),
  eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
  status: text("status").default("pending").notNull(),
  result: jsonb("result").default(sql`'{}'::jsonb`).notNull(),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: now(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),

  type: text("type").default("notice").notNull(),
  severity: text("severity").default("info").notNull(),

  title: text("title").notNull(),
  body: text("body"),

  status: text("status").default("unread").notNull(),

  relatedEntityType: text("related_entity_type"),
  relatedEntityId: uuid("related_entity_id"),

  actionLabel: text("action_label"),
  actionUrl: text("action_url"),

  deliveryStatus: text("delivery_status").default("pending").notNull(),
  deliveredVia: text("delivered_via"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),

  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),

  createdAt: now(),
  readAt: timestamp("read_at", { withTimezone: true }),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
});

export const messagePreferences = pgTable("message_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  messageType: text("message_type").notNull(),
  severity: text("severity"),
  preferredChannels: jsonb("preferred_channels").default(sql`'["push","email"]'::jsonb`).notNull(),
  mode: text("mode").default("instant").notNull(),
  deliveryPolicy: text("delivery_policy").default("first_success").notNull(),
  escalationAfterMinutes: integer("escalation_after_minutes"),
  escalationChannels: jsonb("escalation_channels").default(sql`'[]'::jsonb`).notNull(),
  quietHoursStart: time("quiet_hours_start"),
  quietHoursEnd: time("quiet_hours_end"),
  isEnabled: boolean("is_enabled").default(true).notNull(),
  createdAt: now(),
  updatedAt: updated(),
});

export const messageAttempts = pgTable("message_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .references(() => messages.id, { onDelete: "cascade" })
    .notNull(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  provider: text("provider"),
  providerMessageId: text("provider_message_id"),
  errorMessage: text("error_message"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
});

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  workspaceId: uuid("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull(),
  endpoint: text("endpoint").unique().notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent"),
  deviceName: text("device_name"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: now(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type ImportRow = typeof imports.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type AutomationRule = typeof automationRules.$inferSelect;
export type AutomationRun = typeof automationRuns.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type MessagePreference = typeof messagePreferences.$inferSelect;
export type MessageAttempt = typeof messageAttempts.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
