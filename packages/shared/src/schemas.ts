import { z } from "zod";
import {
  AccountType,
  AutomationActionType,
  AutomationConditionOp,
  AutomationTriggerType,
  CategoryType,
  DeliveryPolicy,
  MessageMode,
  MessageSeverity,
  MessageType,
  TransactionSource,
  TransactionStatus,
  TransactionType,
} from "./enums.js";

/** Numeric money values are passed around as strings to preserve precision. */
export const moneyString = z
  .string()
  .regex(/^-?\d+(\.\d{1,2})?$/u, "Must be a decimal with up to 2 fraction digits");

/** Accept number or string for money on input, normalise to string. */
export const moneyInput = z.union([z.number(), moneyString]).transform((v) => {
  if (typeof v === "number") return v.toFixed(2);
  return v;
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "Expected YYYY-MM-DD");

// --- Auth ---------------------------------------------------------------
export const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(120),
  password: z.string().min(8).max(200),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

// --- Categories ---------------------------------------------------------
export const createCategorySchema = z.object({
  parentId: z.string().uuid().nullish(),
  name: z.string().min(1).max(120),
  type: CategoryType.schema.default("expense"),
  monthlyBudget: moneyInput.nullish(),
  budgetAlertThreshold: z.number().min(0).max(1).optional(),
  icon: z.string().max(64).nullish(),
  color: z.string().max(32).nullish(),
  sortOrder: z.number().int().optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial().extend({
  isArchived: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// --- Transactions -------------------------------------------------------
export const createTransactionSchema = z.object({
  parentId: z.string().uuid().nullish(),
  accountId: z.string().uuid().nullish(),
  categoryId: z.string().uuid().nullish(),
  assignedToUserId: z.string().uuid().nullish(),
  type: TransactionType.schema.default("expense"),
  status: TransactionStatus.schema.default("confirmed"),
  date: isoDate,
  bookingDate: isoDate.nullish(),
  valueDate: isoDate.nullish(),
  amount: moneyInput,
  currency: z.string().length(3).default("EUR"),
  merchantName: z.string().max(200).nullish(),
  description: z.string().max(500).nullish(),
  notes: z.string().max(2000).nullish(),
  source: TransactionSource.schema.default("manual"),
  affectsAccountBalance: z.boolean().default(true),
  affectsBudget: z.boolean().default(true),
  externalId: z.string().max(200).nullish(),
  confidence: z.number().min(0).max(1).nullish(),
  aiData: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

export const updateTransactionSchema = createTransactionSchema.partial();
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;

export const transactionQuerySchema = z.object({
  categoryId: z.string().uuid().optional(),
  accountId: z.string().uuid().optional(),
  status: TransactionStatus.schema.optional(),
  type: TransactionType.schema.optional(),
  search: z.string().max(200).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  rootOnly: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

// --- Accounts -----------------------------------------------------------
export const createAccountSchema = z.object({
  name: z.string().min(1).max(120),
  type: AccountType.schema.default("bank"),
  currency: z.string().length(3).default("EUR"),
});
export type CreateAccountInput = z.infer<typeof createAccountSchema>;

// --- Automations --------------------------------------------------------
export const automationConditionSchema = z.object({
  op: AutomationConditionOp.schema,
  value: z.union([z.string(), z.number()]).optional(),
});
export type AutomationCondition = z.infer<typeof automationConditionSchema>;

export const automationActionSchema = z.object({
  type: AutomationActionType.schema,
  // Flexible payload; meaning depends on action type.
  value: z.unknown().optional(),
  categoryId: z.string().uuid().optional(),
  status: TransactionStatus.schema.optional(),
  affectsBudget: z.boolean().optional(),
  messageTitle: z.string().optional(),
  messageBody: z.string().optional(),
  messageType: MessageType.schema.optional(),
  messageSeverity: MessageSeverity.schema.optional(),
});
export type AutomationAction = z.infer<typeof automationActionSchema>;

export const createAutomationRuleSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(500).nullish(),
  triggerType: AutomationTriggerType.schema,
  conditions: z.array(automationConditionSchema).default([]),
  actions: z.array(automationActionSchema).min(1),
  priority: z.number().int().default(100),
  isActive: z.boolean().default(true),
});
export type CreateAutomationRuleInput = z.infer<typeof createAutomationRuleSchema>;

export const updateAutomationRuleSchema = createAutomationRuleSchema.partial();
export type UpdateAutomationRuleInput = z.infer<typeof updateAutomationRuleSchema>;

// --- Messages -----------------------------------------------------------
export const messagePreferenceSchema = z.object({
  messageType: MessageType.schema,
  severity: MessageSeverity.schema.nullish(),
  preferredChannels: z.array(z.string()).default(["push", "email"]),
  mode: MessageMode.schema.default("instant"),
  deliveryPolicy: DeliveryPolicy.schema.default("first_success"),
  escalationAfterMinutes: z.number().int().nullish(),
  escalationChannels: z.array(z.string()).default([]),
  quietHoursStart: z.string().nullish(),
  quietHoursEnd: z.string().nullish(),
  isEnabled: z.boolean().default(true),
});
export type MessagePreferenceInput = z.infer<typeof messagePreferenceSchema>;

// --- Push subscription --------------------------------------------------
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  userAgent: z.string().optional(),
  deviceName: z.string().optional(),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

// --- AI request/response contracts -------------------------------------
export const quickInputSchema = z.object({ input: z.string().min(1).max(500) });
export type QuickInputRequest = z.infer<typeof quickInputSchema>;

/** Validated structured output for quick-input parsing (AI or heuristic). */
export const parsedQuickInputSchema = z.object({
  merchantName: z.string().nullable(),
  amount: moneyString,
  type: TransactionType.schema,
  currency: z.string().length(3),
  description: z.string().nullable(),
  categoryHint: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});
export type ParsedQuickInput = z.infer<typeof parsedQuickInputSchema>;

export const categorizationSchema = z.object({
  categoryName: z.string().nullable(),
  categoryId: z.string().uuid().nullable(),
  confidence: z.number().min(0).max(1),
});
export type CategorizationResult = z.infer<typeof categorizationSchema>;

export const extractedAttachmentSchema = z.object({
  merchantName: z.string().nullable(),
  total: moneyString.nullable(),
  date: isoDate.nullable(),
  currency: z.string().length(3),
  lineItems: z.array(
    z.object({
      description: z.string(),
      amount: moneyString,
      categoryHint: z.string().nullable().optional(),
    }),
  ),
  confidence: z.number().min(0).max(1),
});
export type ExtractedAttachment = z.infer<typeof extractedAttachmentSchema>;

export const monthlySummarySchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()),
});
export type MonthlySummary = z.infer<typeof monthlySummarySchema>;
