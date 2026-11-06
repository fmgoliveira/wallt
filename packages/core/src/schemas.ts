import { z } from "zod";
import { isValidDate } from "./dates";

/** Integer minor units (safe integer). Negative = outflow. */
export const amountSchema = z.int();
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, "ISO 4217 code");
export const calendarDateSchema = z.string().refine(isValidDate, "YYYY-MM-DD");
export const timestampSchema = z.iso.datetime();
export const idSchema = z.uuidv7();
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

/** Columns present on every synced table (PLAN §3.2). */
export const syncedRowSchema = z.object({
  id: idSchema,
  userId: z.string().min(1),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
  hlc: z.string().min(1),
  deletedAt: timestampSchema.nullable(),
  serverSeq: z.int().nonnegative().nullable(),
});

export const accountTypeSchema = z.enum([
  "checking",
  "savings",
  "credit_card",
  "cash",
  "investment",
  "other",
]);

export const accountSchema = syncedRowSchema.extend({
  name: z.string().trim().min(1),
  type: accountTypeSchema,
  currency: currencySchema,
  color: colorSchema.nullable(),
  icon: z.string().nullable(),
  openingBalance: amountSchema,
  includeInNetWorth: z.boolean(),
  archived: z.boolean(),
  bankLinkId: idSchema.nullable(),
  sortOrder: z.int(),
});

export const categoryTypeSchema = z.enum(["expense", "income"]);

export const categorySchema = syncedRowSchema.extend({
  name: z.string().trim().min(1),
  parentId: idSchema.nullable(),
  type: categoryTypeSchema,
  icon: z.string().nullable(),
  color: colorSchema.nullable(),
  archived: z.boolean(),
  sortOrder: z.int(),
});

export const transactionStatusSchema = z.enum(["pending", "booked"]);
export const transactionKindSchema = z.enum(["expense", "income", "transfer"]);
export const transactionSourceSchema = z.enum(["manual", "import", "bank"]);
export const categorizationMethodSchema = z.enum(["user", "rule", "payee_memory", "ml", "none"]);

export const categorizationSchema = z.object({
  method: categorizationMethodSchema,
  confidence: z.number().min(0).max(1),
  needsReview: z.boolean(),
});

export const transactionSchema = syncedRowSchema.extend({
  accountId: idSchema,
  amount: amountSchema,
  currency: currencySchema,
  bookingDate: calendarDateSchema,
  valueDate: calendarDateSchema.nullable(),
  payee: z.string(),
  descriptionRaw: z.string(),
  descriptionClean: z.string(),
  categoryId: idSchema.nullable(),
  status: transactionStatusSchema,
  kind: transactionKindSchema,
  transferPeerId: idSchema.nullable(),
  notes: z.string(),
  excludedFromReports: z.boolean(),
  source: transactionSourceSchema,
  externalId: z.string().nullable(),
  dedupHash: z.string(),
  importBatchId: idSchema.nullable(),
  categorization: categorizationSchema,
});

export const transactionSplitSchema = syncedRowSchema.extend({
  transactionId: idSchema,
  categoryId: idSchema.nullable(),
  amount: amountSchema,
  note: z.string(),
});

export const tagSchema = syncedRowSchema.extend({
  name: z.string().trim().min(1),
  color: colorSchema.nullable(),
});

export const transactionTagSchema = syncedRowSchema.extend({
  transactionId: idSchema,
  tagId: idSchema,
});

export type Account = z.infer<typeof accountSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionSplit = z.infer<typeof transactionSplitSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type TransactionTag = z.infer<typeof transactionTagSchema>;
