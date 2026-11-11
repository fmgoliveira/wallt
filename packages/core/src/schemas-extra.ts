import { z } from "zod";
import {
  amountSchema,
  calendarDateSchema,
  colorSchema,
  currencySchema,
  idSchema,
  syncedRowSchema,
  timestampSchema,
} from "./schemas";

const idList = z.array(idSchema);

export const budgetPeriodSchema = z.enum(["month", "week", "custom"]);

/** Which transactions a budget covers; empty/omitted lists mean "no restriction". */
export const budgetScopeSchema = z.object({
  categoryIds: idList,
  tagIds: idList,
  accountIds: idList,
});

export const budgetSchema = syncedRowSchema
  .extend({
    name: z.string().trim().min(1),
    period: budgetPeriodSchema,
    start: calendarDateSchema,
    end: calendarDateSchema.nullable(),
    amount: amountSchema.nonnegative(),
    currency: currencySchema,
    rollover: z.boolean(),
    scope: budgetScopeSchema,
  })
  .refine((b) => b.end === null || b.end >= b.start, { message: "end before start", path: ["end"] })
  .refine((b) => b.period !== "custom" || b.end !== null, {
    message: "custom period needs an end date",
    path: ["end"],
  });

export const recurringTemplateSchema = z.object({
  payee: z.string(),
  amount: amountSchema,
  currency: currencySchema,
  accountId: idSchema,
  categoryId: idSchema.nullable(),
});

export const recurringRuleSchema = syncedRowSchema.extend({
  template: recurringTemplateSchema,
  /** RFC 5545 RRULE string, e.g. `FREQ=MONTHLY;BYMONTHDAY=5`. */
  rrule: z.string().min(1),
  nextDate: calendarDateSchema,
  autoDetected: z.boolean(),
  active: z.boolean(),
});

export const goalSchema = syncedRowSchema.extend({
  name: z.string().trim().min(1),
  targetAmount: amountSchema.positive(),
  currency: currencySchema,
  deadline: calendarDateSchema.nullable(),
  accountIds: idList,
  color: colorSchema.nullable(),
});

export const debtDirectionSchema = z.enum(["lent", "borrowed"]);

/** Repayments are transactions carrying this debt's id as `debtId`. */
export const debtSchema = syncedRowSchema.extend({
  person: z.string().trim().min(1),
  direction: debtDirectionSchema,
  amount: amountSchema.positive(),
  currency: currencySchema,
  settled: z.boolean(),
});

export const ruleConditionSchema = z.object({
  field: z.enum(["payee", "description", "amount", "account", "sign"]),
  op: z.enum(["contains", "regex", "equals", "gte", "lte"]),
  value: z.union([z.string(), z.number()]),
});

export const ruleActionSchema = z.object({
  categoryId: idSchema.optional(),
  tagIds: idList.optional(),
  payeeRename: z.string().optional(),
});

export const ruleSchema = syncedRowSchema.extend({
  name: z.string().trim().min(1),
  conditions: z.array(ruleConditionSchema).min(1),
  action: ruleActionSchema,
  /** Lower number is evaluated first. */
  priority: z.int(),
});

export const payeeAliasSchema = syncedRowSchema.extend({
  pattern: z.string().min(1),
  payee: z.string().trim().min(1),
});

/** Mime types a receipt may have (PLAN §1.3: photos and PDFs). */
export const ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type AttachmentMime = (typeof ATTACHMENT_MIME_TYPES)[number];
export const ATTACHMENT_FILE_EXTENSIONS: Record<AttachmentMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
/** Default and hard upper bound for one attachment, in bytes (the owner can lower it in Settings). */
export const ATTACHMENT_DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_HARD_MAX_BYTES = 20 * 1024 * 1024;

export const attachmentSchema = syncedRowSchema.extend({
  transactionId: idSchema,
  /** `<id>.<ext>`: the same on every device; where it lives on each device is that device's business. */
  filePath: z.string().min(1),
  mime: z.enum(ATTACHMENT_MIME_TYPES),
  name: z.string().max(200),
  size: z.number().int().min(0).max(ATTACHMENT_HARD_MAX_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

/** Server-only, read-only on clients. `rate` is a decimal string (units of `quote` per 1 `base`). */
export const fxRateSchema = z.object({
  date: calendarDateSchema,
  base: currencySchema,
  quote: currencySchema,
  rate: z.string().regex(/^\d+(\.\d+)?$/),
  fetchedAt: timestampSchema.optional(),
});

export type Budget = z.infer<typeof budgetSchema>;
export type RecurringRule = z.infer<typeof recurringRuleSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Debt = z.infer<typeof debtSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type RuleCondition = z.infer<typeof ruleConditionSchema>;
export type RuleAction = z.infer<typeof ruleActionSchema>;
export type PayeeAlias = z.infer<typeof payeeAliasSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;
export type FxRate = z.infer<typeof fxRateSchema>;

/** Synced (PLAN 5.2). `config` is opaque here; its shape is defined by the import work (#34, #37). */
export const importProfileSchema = syncedRowSchema.extend({
  name: z.string().trim().min(1),
  institution: z.string().nullable(),
  defaultAccountId: idSchema.nullable(),
  fingerprints: z.array(z.string().min(1)).min(1),
  config: z.record(z.string(), z.unknown()),
});
export type ImportProfile = z.infer<typeof importProfileSchema>;
