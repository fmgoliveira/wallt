import { describe, expect, it } from "vitest";
import {
  accountSchema,
  calendarDateSchema,
  categorySchema,
  currencySchema,
  tagSchema,
  transactionSchema,
  transactionSplitSchema,
  transactionTagSchema,
} from "./schemas";

const id = "0190a5c4-7b1e-7a3f-8c2d-123456789abc";
const base = {
  id,
  userId: "u1",
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  hlc: "h",
  deletedAt: null,
  serverSeq: null,
};

const account = {
  ...base,
  name: "Main",
  type: "checking",
  currency: "EUR",
  color: "#aabbcc",
  icon: null,
  openingBalance: 0,
  includeInNetWorth: true,
  archived: false,
  bankLinkId: null,
  sortOrder: 0,
};
const category = {
  ...base,
  name: "Food",
  parentId: null,
  type: "expense",
  icon: null,
  color: null,
  archived: false,
  sortOrder: 1,
  systemKey: null,
};
const tx = {
  ...base,
  accountId: id,
  amount: -1230,
  currency: "EUR",
  bookingDate: "2024-02-29",
  valueDate: null,
  payee: "Lidl",
  descriptionRaw: "LIDL 123",
  descriptionClean: "Lidl",
  categoryId: null,
  status: "booked",
  kind: "expense",
  transferPeerId: null,
  notes: "",
  excludedFromReports: false,
  source: "import",
  externalId: null,
  dedupHash: "x",
  importBatchId: null,
  debtId: null,
  categorization: { method: "none", confidence: 0, needsReview: true },
};

describe("schemas", () => {
  it("accepts valid entities", () => {
    expect(accountSchema.safeParse(account).success).toBe(true);
    expect(categorySchema.safeParse(category).success).toBe(true);
    expect(transactionSchema.safeParse(tx).success).toBe(true);
    expect(
      transactionSplitSchema.safeParse({
        ...base,
        transactionId: id,
        categoryId: id,
        amount: -5,
        note: "",
      }).success,
    ).toBe(true);
    expect(tagSchema.safeParse({ ...base, name: "trip", color: null }).success).toBe(true);
    expect(transactionTagSchema.safeParse({ ...base, transactionId: id, tagId: id }).success).toBe(
      true,
    );
  });
  it("rejects float amounts, bad dates, bad currency, non-v7 ids", () => {
    expect(transactionSchema.safeParse({ ...tx, amount: 12.5 }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...tx, bookingDate: "2023-02-29" }).success).toBe(false);
    expect(transactionSchema.safeParse({ ...tx, currency: "eur" }).success).toBe(false);
    expect(
      transactionSchema.safeParse({ ...tx, id: "550e8400-e29b-41d4-a716-446655440000" }).success,
    ).toBe(false);
    expect(
      transactionSchema.safeParse({
        ...tx,
        categorization: { method: "none", confidence: 2, needsReview: true },
      }).success,
    ).toBe(false);
    expect(accountSchema.safeParse({ ...account, name: "  " }).success).toBe(false);
  });
  it("primitives", () => {
    expect(currencySchema.safeParse("EUR").success).toBe(true);
    expect(calendarDateSchema.safeParse("2024-02-30").success).toBe(false);
  });
});
