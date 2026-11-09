import { mkdirSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { analyzeFile } from "./analyze";
import { generateAll, generateFixture, VARIANTS, type Variant } from "./fixtures";
import { type ExistingTx, planImport } from "./pipeline";

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Golden tests for the auto-detection engine: every synthetic export variant must come back as exactly the
 * transactions it was generated from, for many seeds. No real bank file is involved.
 */
describe.each(VARIANTS)("auto-detection: %s", (variant: Variant) => {
  it.each(SEEDS)("seed %i parses to the generated transactions", (seed) => {
    const fx = generateFixture(variant, seed);
    const a = analyzeFile(fx.bytes);
    expect(a.errors).toEqual([]);
    expect(
      a.rows.map((r) => ({
        bookingDate: r.bookingDate,
        amount: r.amount,
        description: r.description,
      })),
    ).toEqual(fx.truth);
    expect(a.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

describe("auto-detection: what was detected", () => {
  const table = (variant: Variant) => {
    const a = analyzeFile(generateFixture(variant, 1).bytes);
    if (a.kind !== "table") throw new Error("expected a table");
    return a;
  };

  it("pt-semicolon-cp1252: preamble, value date, balance, Windows-1252, comma decimals", () => {
    const a = table("pt-semicolon-cp1252");
    expect(a.table).toMatchObject({ encoding: "windows-1252", delimiter: ";" });
    expect(a.mapping).toMatchObject({
      headerRow: 5,
      amountLocale: "pt",
      dateFormat: { kind: "pattern", order: "dmy" },
      invertSign: false,
      columns: { date: 0, valueDate: 1, description: 2, amount: 3, balance: 4 },
    });
    expect(a.skipped).toBeGreaterThan(0); // the "Saldo final" footer
  });
  it("pt-debit-credit: two columns become one signed amount", () => {
    expect(table("pt-debit-credit").mapping.columns).toMatchObject({
      debit: 2,
      credit: 3,
      balance: 4,
    });
  });
  it("en-comma-iso-bom: UTF-8 BOM, comma delimiter, quoted descriptions, point decimals", () => {
    const a = table("en-comma-iso-bom");
    expect(a.table).toMatchObject({ encoding: "utf-8", delimiter: "," });
    expect(a.mapping).toMatchObject({
      amountLocale: "en",
      dateFormat: { kind: "pattern", order: "ymd" },
    });
  });
  it("preamble-descending: newest-first and 2-digit years", () => {
    const a = table("preamble-descending");
    expect(a.mapping.headerRow).toBe(3);
    expect((a.rows[0]?.bookingDate ?? "") > (a.rows.at(-1)?.bookingDate ?? "")).toBe(true);
  });
  it("no-header-trailing-minus: no header, `12,30-` negatives", () => {
    expect(table("no-header-trailing-minus").mapping.headerRow).toBeNull();
  });
  it("tsv-utf16: UTF-16 and tabs", () => {
    expect(table("tsv-utf16").table).toMatchObject({ encoding: "utf-16le", delimiter: "\t" });
  });
  it("xlsx-merged-headers: title row and a merged header cell", () => {
    const a = table("xlsx-merged-headers");
    expect(a.table.kind).toBe("spreadsheet");
    expect(a.mapping.columns).toMatchObject({
      date: 0,
      valueDate: 1,
      description: 2,
      amount: 4,
      balance: 5,
    });
  });
  it("xls-serial-dates: legacy .xls with serial numbers", () => {
    expect(table("xls-serial-dates").table.kind).toBe("spreadsheet");
  });
  it("ods-two-sheets: picks the sheet with the transactions", () => {
    const a = table("ods-two-sheets");
    expect(a.table.sheet).toBe("Movimentos");
    expect(a.table.sheets).toEqual(["Resumo", "Movimentos"]);
  });
  it("OFX and CAMT go through the structured parsers", () => {
    const ofx = analyzeFile(generateFixture("ofx-sgml-cp1252", 1).bytes);
    const camt = analyzeFile(generateFixture("camt053", 1).bytes);
    expect(ofx).toMatchObject({ kind: "statement", format: "ofx" });
    expect(camt).toMatchObject({ kind: "statement", format: "camt" });
    expect(ofx.rows.every((r) => r.externalId)).toBe(true);
  });
});

describe("end to end: import twice", () => {
  it.each(VARIANTS)("%s: the second import of the same file adds nothing", (variant) => {
    const a = analyzeFile(generateFixture(variant, 3).bytes);
    const first = planImport({ accountId: "acc", currency: "EUR", rows: a.rows, existing: [] });
    expect(first.summary.duplicates).toBe(0);
    const stored: ExistingTx[] = first.rows.map((p, i) => ({
      id: `t${i}`,
      accountId: "acc",
      bookingDate: p.row.bookingDate,
      amount: p.row.amount,
      currency: "EUR",
      status: "booked",
      kind: p.row.amount < 0 ? "expense" : "income",
      descriptionRaw: p.row.description,
      descriptionClean: p.descriptionClean,
      externalId: p.row.externalId,
      dedupHash: p.dedupHash,
    }));
    const second = planImport({
      accountId: "acc",
      currency: "EUR",
      rows: a.rows,
      existing: stored,
    });
    expect(second.summary).toMatchObject({
      inserted: 0,
      duplicates: a.rows.length,
      needsReview: 0,
    });
  });
});

// `WALLT_WRITE_FIXTURES=1 pnpm --filter @wallt/ingest test` writes the files to /fixtures for manual wizard tests.
describe.skipIf(!process.env.WALLT_WRITE_FIXTURES)("write fixtures", () => {
  it("writes every variant (seed 1) to /fixtures", () => {
    const dir = new URL("../../../fixtures/", import.meta.url);
    mkdirSync(dir, { recursive: true });
    for (const f of generateAll(1)) writeFileSync(new URL(f.name, dir), f.bytes);
  });
});
