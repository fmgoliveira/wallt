import { describe, expect, it } from "vitest";
import { detectAmountLocale } from "./amount";
import { findHeaderRow, headerRole, normalizeHeader } from "./header";
import { detectDateFormat, fromExcelSerial, parseImportDate } from "./import-date";
import { checkBalance, fingerprint, inferMapping, parseRows } from "./mapping";
import { parseDelimited } from "./tabularize";

const grid = (text: string, delimiter = ";") => parseDelimited(text.trim(), delimiter);

describe("import dates", () => {
  it("prefers day-first, falls back to month-first, understands ISO, compact and 2-digit years", () => {
    expect(detectDateFormat(["03-02-2024", "04-02-2024"])).toEqual({
      kind: "pattern",
      order: "dmy",
    });
    expect(detectDateFormat(["03/02/2024", "04/13/2024"])).toEqual({
      kind: "pattern",
      order: "mdy",
    });
    expect(detectDateFormat(["2024-02-03", "2024-02-04 10:11"])).toEqual({
      kind: "pattern",
      order: "ymd",
    });
    expect(detectDateFormat(["20240203"])).toEqual({ kind: "pattern", order: "ymd" });
    expect(parseImportDate("03.02.24", { kind: "pattern", order: "dmy" })).toBe("2024-02-03");
  });
  it("rejects impossible and implausible dates", () => {
    expect(parseImportDate("31-02-2024", { kind: "pattern", order: "dmy" })).toBeNull();
    expect(parseImportDate("01-01-1850", { kind: "pattern", order: "dmy" })).toBeNull();
  });
  it("reads Excel serials", () => {
    expect(fromExcelSerial(45325)).toBe("2024-02-03");
    expect(detectDateFormat(["45325", "45326"])).toEqual({ kind: "serial" });
    expect(parseImportDate("45326.5", { kind: "serial" })).toBe("2024-02-04");
  });
});

describe("amount locale", () => {
  it("tells decimal comma from decimal point", () => {
    expect(detectAmountLocale(["1.234,56", "-12,30", "5,00"])).toBe("pt");
    expect(detectAmountLocale(["1,234.56", "-12.30"])).toBe("en");
    expect(detectAmountLocale(["100", "-20"])).toBe("auto");
  });
});

describe("header detection", () => {
  it("maps multilingual keywords, longest match first", () => {
    expect(headerRole("Data Valor")).toBe("valueDate");
    expect(headerRole("Data Mov.")).toBe("date");
    expect(headerRole("Descrição")).toBe("description");
    expect(headerRole("Montante")).toBe("amount");
    expect(headerRole("Débito")).toBe("debit");
    expect(headerRole("Saldo contabilístico")).toBe("balance");
    expect(headerRole("Buchungstag")).toBe("date");
    expect(headerRole("xyz")).toBeNull();
    expect(normalizeHeader("  Data  Mov. ")).toBe("data mov");
  });
  it("skips a preamble", () => {
    const rows = grid(`
Banco Exemplo;;
Conta: PT50 0000 0000;;
Periodo 01-01-2024 a 31-01-2024;;
;;
Data;Descrição;Montante
02-01-2024;Café;-1,50
03-01-2024;Pão;-2,30
04-01-2024;Salário;1500,00
`);
    expect(findHeaderRow(rows)).toBe(4);
  });
  it("returns null when the first row is already data", () => {
    expect(
      findHeaderRow(grid("02-01-2024;Café;-1,50\n03-01-2024;Pão;-2,30\n04-01-2024;X;1,00")),
    ).toBeNull();
  });
});

const PT_SINGLE = `
Banco Exemplo - Conta à Ordem
Titular: Maria Exemplo
;;;;
Data Mov.;Data Valor;Descrição;Montante;Saldo
02-01-2024;02-01-2024;COMPRA CONTINENTE 1234;-23,45;976,55
03-01-2024;03-01-2024;TRF RENDA;-500,00;476,55
05-01-2024;05-01-2024;SALARIO;1.500,00;1.976,55
06-01-2024;06-01-2024;CAFE;-1,50;1.975,05
Total;;;;
`;

describe("inferMapping", () => {
  it("handles a Portuguese single-amount file with preamble, value date, balance and footer", () => {
    const rows = grid(PT_SINGLE);
    const r = inferMapping(rows);
    expect(r.mapping.headerRow).toBe(3);
    expect(r.mapping.columns).toEqual({
      date: 0,
      valueDate: 1,
      description: 2,
      amount: 3,
      balance: 4,
    });
    expect(r.mapping.amountLocale).toBe("pt");
    expect(r.mapping.invertSign).toBe(false);
    expect(r.balanceCheck?.matchRatio).toBe(1);
    expect(r.confidence).toBeGreaterThanOrEqual(0.9);
    const parsed = parseRows(rows, r.mapping);
    expect(parsed.errors).toEqual([]);
    expect(parsed.skipped).toBe(1); // the "Total" line
    expect(parsed.rows.map((x) => [x.bookingDate, x.amount, x.balance])).toEqual([
      ["2024-01-02", -2345, 97655],
      ["2024-01-03", -50000, 47655],
      ["2024-01-05", 150000, 197655],
      ["2024-01-06", -150, 197505],
    ]);
    expect(parsed.rows[1]?.description).toBe("TRF RENDA");
  });

  it("merges separate debit and credit columns into one signed amount", () => {
    const rows = grid(`
Data;Descrição;Débito;Crédito;Saldo
02-01-2024;COMPRA;23,45;;976,55
03-01-2024;SALARIO;;1500,00;2476,55
04-01-2024;RENDA;500,00;;1976,55
`);
    const r = inferMapping(rows);
    expect(r.mapping.columns).toMatchObject({
      date: 0,
      description: 1,
      debit: 2,
      credit: 3,
      balance: 4,
    });
    expect(parseRows(rows, r.mapping).rows.map((x) => x.amount)).toEqual([-2345, 150000, -50000]);
  });

  it("splits unlabeled sparse numeric columns into debit/credit", () => {
    const rows = grid(`
02-01-2024;COMPRA;23,45;
03-01-2024;SALARIO;;1500,00
04-01-2024;RENDA;500,00;
05-01-2024;CAFE;1,50;
06-01-2024;EXTRA;;20,00
`);
    const r = inferMapping(rows);
    expect(r.mapping.headerRow).toBeNull();
    expect(r.mapping.columns).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
    expect(parseRows(rows, r.mapping).rows.map((x) => x.amount)).toEqual([
      -2345, 150000, -50000, -150, 2000,
    ]);
  });

  it("flips the sign when the balance only reconciles that way", () => {
    // outflows are positive numbers in this export
    const rows = grid(
      `
Date,Description,Amount,Balance
2024-01-02,Shop,23.45,976.55
2024-01-03,Rent,500.00,476.55
2024-01-04,Gym,20.00,456.55
`,
      ",",
    );
    const r = inferMapping(rows);
    expect(r.mapping.amountLocale).toBe("en");
    expect(r.mapping.invertSign).toBe(true);
    expect(r.balanceCheck?.flipped).toBe(true);
    expect(parseRows(rows, r.mapping).rows.map((x) => x.amount)).toEqual([-2345, -50000, -2000]);
  });

  it("recognises newest-first order from the balance", () => {
    const rows = grid(`
Data;Descrição;Montante;Saldo
06-01-2024;CAFE;-1,50;1975,05
05-01-2024;SALARIO;1500,00;1976,55
03-01-2024;RENDA;-500,00;476,55
02-01-2024;COMPRA;-23,45;976,55
`);
    const r = inferMapping(rows);
    expect(r.balanceCheck).toMatchObject({ descending: true, flipped: false, matchRatio: 1 });
    expect(r.mapping.invertSign).toBe(false);
  });

  it("reads Excel serial dates and reports unreadable rows", () => {
    const rows = grid(`
Data;Descrição;Montante
45293;COMPRA;-23,45
45294;RENDA;-500,00
45295;ERRO;abc
`);
    const r = inferMapping(rows);
    expect(r.mapping.dateFormat).toEqual({ kind: "serial" });
    const parsed = parseRows(rows, r.mapping);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.bookingDate).toBe("2024-01-02");
    expect(parsed.errors).toEqual([
      { rowIndex: 3, reason: "Unreadable amount", code: "unreadableAmount" },
    ]);
  });

  it("explains what it could not find", () => {
    const r = inferMapping(grid("a;b\nc;d"));
    expect(r.notes).toEqual(
      expect.arrayContaining(["No date column found", "No amount column found"]),
    );
    expect(r.confidence).toBeLessThan(0.5);
  });
});

describe("checkBalance", () => {
  it("scores reconciliation in both directions", () => {
    expect(checkBalance([null, -100, 50], [1000, 900, 950]).matchRatio).toBe(1);
    expect(checkBalance([50, -100, null], [950, 900, 1000]).descending).toBe(true);
    expect(checkBalance([null, 100], [1000, 900]).flipped).toBe(true);
  });
});

describe("fingerprint", () => {
  it("ignores case, accents and punctuation, but not layout", () => {
    expect(fingerprint(["Data Mov.", "Descrição"], 2, ";")).toBe(
      fingerprint(["data mov", "descricao"], 2, ";"),
    );
    expect(fingerprint(["Data"], 2, ";")).not.toBe(fingerprint(["Data"], 3, ";"));
    expect(fingerprint(["Data"], 2, ";")).not.toBe(fingerprint(["Data"], 2, ","));
  });
});
