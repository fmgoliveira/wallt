import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { dateLikeRowCount, parseDelimited, sniffDelimiter, tabularize } from "./tabularize";
import { utf8 } from "./test-utils";

const enc = utf8;

describe("parseDelimited", () => {
  it("handles quotes, doubled quotes and embedded newlines", () => {
    const rows = parseDelimited('a;"b;c";"d ""x"" e"\r\n"multi\nline";2;3\n', ";");
    expect(rows).toEqual([
      ["a", "b;c", 'd "x" e'],
      ["multi\nline", "2", "3"],
    ]);
  });
  it("trims cells, trailing empties and keeps middle blank rows", () => {
    expect(parseDelimited(" a ; b ;;\n\n1;2;;\n;;\n", ";")).toEqual([["a", "b"], [], ["1", "2"]]);
  });
  it("handles a missing final newline and bare CR", () => {
    expect(parseDelimited("a,b\rc,d", ",")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("sniffDelimiter", () => {
  it("prefers the consistent delimiter over decimal commas", () => {
    expect(
      sniffDelimiter("Data;Descricao;Valor\n01-02-2024;Cafe;-1,50\n02-02-2024;Pao;-2,30\n"),
    ).toBe(";");
  });
  it("detects comma, tab and pipe", () => {
    expect(sniffDelimiter("a,b,c\n1,2,3\n4,5,6")).toBe(",");
    expect(sniffDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
    expect(sniffDelimiter("a|b|c\n1|2|3")).toBe("|");
  });
  it("ignores delimiters inside quotes", () => {
    expect(sniffDelimiter('"a,b";"c,d"\n"1,5";"2,5"\n"3,5";"4,5"')).toBe(";");
  });
  it("defaults to semicolon for single-column text", () => {
    expect(sniffDelimiter("hello\nworld")).toBe(";");
  });
});

describe("tabularize delimited", () => {
  it("decodes Windows-1252 and sniffs the delimiter", () => {
    const bytes = Uint8Array.from(
      [..."Data;Descri\xe7\xe3o;Montante\n01-02-2024;Caf\xe9;-1,50\n"].map((c) => c.charCodeAt(0)),
    );
    const t = tabularize(bytes);
    expect(t.kind).toBe("delimited");
    expect(t.encoding).toBe("windows-1252");
    expect(t.delimiter).toBe(";");
    expect(t.rows).toEqual([
      ["Data", "Descrição", "Montante"],
      ["01-02-2024", "Café", "-1,50"],
    ]);
  });
  it("accepts overrides", () => {
    expect(tabularize(enc("a;b\n1;2"), { delimiter: ";" }).rows[1]).toEqual(["1", "2"]);
  });
});

function workbook(sheets: Record<string, (string | number | Date)[][]>, bookType: XLSX.BookType) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), name);
  return new Uint8Array(
    XLSX.write(wb, { type: "array", bookType, cellDates: true }) as ArrayBuffer,
  );
}

describe("tabularize spreadsheets", () => {
  const data = {
    Capa: [["Banco Exemplo"], ["Conta 123"]],
    Movimentos: [
      ["Data", "Descrição", "Montante"],
      [new Date(Date.UTC(2024, 1, 3)), "Café", -1.5],
      [new Date(Date.UTC(2024, 1, 4)), "Pão", -2.3],
    ],
  };
  for (const type of ["xlsx", "xls", "ods"] as const) {
    it(`reads ${type}, picks the sheet with the most dates and emits ISO dates`, () => {
      const t = tabularize(workbook(data, type));
      expect(t.kind).toBe("spreadsheet");
      expect(t.sheet).toBe("Movimentos");
      expect(t.sheets).toEqual(["Capa", "Movimentos"]);
      expect(t.rows[0]).toEqual(["Data", "Descrição", "Montante"]);
      expect(t.rows[1]?.[0]).toBe("2024-02-03");
      expect(t.rows[1]?.[1]).toBe("Café");
      expect(Number((t.rows[1]?.[2] ?? "").replace(",", "."))).toBe(-1.5);
    });
  }
  it("honours an explicit sheet", () => {
    expect(tabularize(workbook(data, "xlsx"), { sheet: "Capa" }).rows).toEqual([
      ["Banco Exemplo"],
      ["Conta 123"],
    ]);
  });
});

describe("dateLikeRowCount", () => {
  it("counts rows with a date-looking cell", () => {
    expect(dateLikeRowCount([["x"], ["01/02/2024", "a"], ["2024-02-03"], ["1.5"]])).toBe(2);
  });
});
