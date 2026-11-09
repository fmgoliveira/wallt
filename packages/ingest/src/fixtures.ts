import * as XLSX from "xlsx";

/*
 * Synthetic bank-export generator (PLAN 5.2, P5.6). Everything is fake: invented merchants, a seeded PRNG,
 * no real names or numbers. Used by the golden tests and by the fixture writer, so the auto-detection engine is
 * tested without any real bank file.
 */

export interface TruthRow {
  /** ISO date */
  bookingDate: string;
  /** Minor units, negative = outflow */
  amount: number;
  description: string;
}

export interface Fixture {
  variant: Variant;
  /** File name with extension. */
  name: string;
  bytes: Uint8Array;
  /** What a correct import yields, in file order. */
  truth: TruthRow[];
}

export const VARIANTS = [
  "pt-semicolon-cp1252",
  "pt-debit-credit",
  "pt-debit-credit-sparse",
  "en-comma-iso-bom",
  "preamble-descending",
  "no-header-trailing-minus",
  "tsv-utf16",
  "xlsx-merged-headers",
  "xls-serial-dates",
  "ods-two-sheets",
  "ofx-sgml-cp1252",
  "camt053",
] as const;
export type Variant = (typeof VARIANTS)[number];

/** mulberry32: tiny seeded PRNG, so a seed always yields the same file. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MERCHANTS = [
  "CONTINENTE MODELO",
  "PINGO DOCE",
  "CAFÉ CENTRAL",
  "FARMÁCIA SOL",
  "GALP AUTOESTRADA",
  "NETFLIX.COM",
  "PADARIA DA ESQUINA",
  "RESTAURANTE O TACHO",
  "TRANSPORTES URBANOS",
  "LIVRARIA LUZ",
];

interface Generated {
  rows: { date: string; description: string; amount: number; balance: number }[];
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");
const iso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;

/** `count` transactions over about two months from 2024-01-02, running balance included. Oldest first. */
function generate(seed: number, count = 24): Generated {
  const rnd = prng(seed);
  let balance = 100000 + Math.floor(rnd() * 100000);
  const rows: Generated["rows"] = [];
  const day0 = Date.UTC(2024, 0, 2);
  let dayOffset = 0;
  for (let i = 0; i < count; i++) {
    dayOffset += Math.floor(rnd() * 3); // 0..2: some days repeat
    const d = new Date(day0 + dayOffset * 86400000);
    const date = iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    const income = i % 11 === 5;
    const description = income
      ? "SALÁRIO EMPRESA EXEMPLO LDA"
      : `${MERCHANTS[Math.floor(rnd() * MERCHANTS.length)] as string}`;
    const cents = income ? 120000 + Math.floor(rnd() * 60000) : -(150 + Math.floor(rnd() * 9000));
    balance += cents;
    rows.push({ date, description, amount: cents, balance });
  }
  return { rows };
}

/* ------------------------------------------------------------------ encoders */

function encodeCp1252(s: string): Uint8Array {
  return Uint8Array.from(
    [...s].map((c) => (c === "€" ? 0x80 : c.charCodeAt(0) <= 0xff ? c.charCodeAt(0) : 0x3f)),
  );
}
function encodeUtf8(s: string, bom = false): Uint8Array {
  const out: number[] = bom ? [0xef, 0xbb, 0xbf] : [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000)
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
  }
  return Uint8Array.from(out);
}
function encodeUtf16le(s: string): Uint8Array {
  const out = [0xff, 0xfe];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff, s.charCodeAt(i) >> 8);
  return Uint8Array.from(out);
}

/* ---------------------------------------------------------------- formatting */

const group = (digits: string, sep: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
/** 123456 -> `1.234,56` (pt) or `1,234.56` (en); no sign. */
function fmt(abs: number, locale: "pt" | "en", grouped = true): string {
  const whole = String(Math.floor(abs / 100));
  const frac = pad(abs % 100);
  const [thousands, decimal] = locale === "pt" ? [".", ","] : [",", "."];
  return `${grouped ? group(whole, thousands) : whole}${decimal}${frac}`;
}
const signed = (cents: number, locale: "pt" | "en", grouped = true) =>
  `${cents < 0 ? "-" : ""}${fmt(Math.abs(cents), locale, grouped)}`;
const dmy = (date: string, sep: string) => date.split("-").reverse().join(sep);
const quote = (s: string, delimiter: string) =>
  s.includes(delimiter) || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
const csv = (rows: string[][], delimiter: string, eol = "\r\n") =>
  rows.map((r) => r.map((c) => quote(c, delimiter)).join(delimiter)).join(eol) + eol;

const truthOf = (rows: Generated["rows"]): TruthRow[] =>
  rows.map((r) => ({ bookingDate: r.date, amount: r.amount, description: r.description }));

function workbook(
  sheets: [string, (string | number | Date)[][], XLSX.Range[]?][],
  type: XLSX.BookType,
) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa, merges] of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    if (merges) ws["!merges"] = merges;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return new Uint8Array(
    XLSX.write(wb, { type: "array", bookType: type, cellDates: true }) as ArrayBuffer,
  );
}
const utcDate = (iso8601: string) => {
  const [y, m, d] = iso8601.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
};
const excelSerial = (iso8601: string) => Math.round(utcDate(iso8601).getTime() / 86400000) + 25569;

/* ------------------------------------------------------------------ variants */

export function generateFixture(variant: Variant, seed = 1): Fixture {
  const g = generate(seed);
  const asc = g.rows;
  const truth = truthOf(asc);
  const file = (name: string, bytes: Uint8Array, t: TruthRow[] = truth): Fixture => ({
    variant,
    name,
    bytes,
    truth: t,
  });

  switch (variant) {
    case "pt-semicolon-cp1252": {
      const lines: string[][] = [
        ["Banco Exemplo SA"],
        ["Movimentos da conta à ordem"],
        ["Titular: Maria Exemplo"],
        ["Período: 02-01-2024 a 29-02-2024"],
        [],
        ["Data Mov.", "Data Valor", "Descrição", "Montante", "Saldo"],
        ...asc.map((r) => [
          dmy(r.date, "-"),
          dmy(r.date, "-"),
          r.description,
          signed(r.amount, "pt"),
          signed(r.balance, "pt"),
        ]),
        ["Saldo final", "", "", "", signed(asc.at(-1)?.balance ?? 0, "pt")],
      ];
      return file("pt-semicolon-cp1252.csv", encodeCp1252(csv(lines, ";")));
    }
    case "pt-debit-credit": {
      const lines = [
        ["Data", "Descritivo", "Débito", "Crédito", "Saldo contabilístico"],
        ...asc.map((r) => [
          dmy(r.date, "/"),
          r.description,
          r.amount < 0 ? fmt(-r.amount, "pt") : "",
          r.amount > 0 ? fmt(r.amount, "pt") : "",
          signed(r.balance, "pt"),
        ]),
      ];
      return file("pt-debit-credit.csv", encodeCp1252(csv(lines, ";")));
    }
    case "pt-debit-credit-sparse": {
      // no balance column: the last columns are mostly empty, and decimal commas must not look like a delimiter
      const lines = [
        ["Data", "Descrição", "Débito", "Crédito"],
        ...asc.map((r) => [
          dmy(r.date, "/"),
          r.description,
          r.amount < 0 ? fmt(-r.amount, "pt", false) : "",
          r.amount > 0 ? fmt(r.amount, "pt", false) : "",
        ]),
      ];
      return file("pt-debit-credit-sparse.csv", encodeCp1252(csv(lines, ";")));
    }
    case "en-comma-iso-bom": {
      const lines = [
        ["Date", "Description", "Amount", "Balance"],
        ...asc.map((r) => [
          r.date,
          `${r.description}, card payment`,
          signed(r.amount, "en", false),
          signed(r.balance, "en", false),
        ]),
      ];
      return file(
        "en-comma-iso-bom.csv",
        encodeUtf8(csv(lines, ","), true),
        asc.map((r) => ({
          bookingDate: r.date,
          amount: r.amount,
          description: `${r.description}, card payment`,
        })),
      );
    }
    case "preamble-descending": {
      const desc = [...asc].reverse();
      const lines = [
        ["Extrato de conta"],
        ["Conta: 0000 0000 0000 (fictícia)"],
        [],
        ["Data", "Descrição", "Montante", "Saldo"],
        ...desc.map((r) => [
          dmy(r.date, ".").replace(/\.(\d{4})$/, (_m, y: string) => `.${y.slice(2)}`),
          r.description,
          signed(r.amount, "pt"),
          signed(r.balance, "pt"),
        ]),
      ];
      return file("preamble-descending.csv", encodeCp1252(csv(lines, ";")), truthOf(desc));
    }
    case "no-header-trailing-minus": {
      const lines = asc.map((r) => [
        dmy(r.date, "-"),
        r.description,
        `${fmt(Math.abs(r.amount), "pt")}${r.amount < 0 ? "-" : ""}`,
      ]);
      return file("no-header-trailing-minus.txt", encodeUtf8(csv(lines, ";", "\n")));
    }
    case "tsv-utf16": {
      const lines = [
        ["Booking date", "Details", "Amount", "Balance"],
        ...asc.map((r) => [
          dmy(r.date, "/"),
          r.description,
          signed(r.amount, "en"),
          signed(r.balance, "en"),
        ]),
      ];
      return file("tsv-utf16.tsv", encodeUtf16le(csv(lines, "\t")));
    }
    case "xlsx-merged-headers": {
      const aoa: (string | number | Date)[][] = [
        ["Banco Exemplo - Extrato"],
        [],
        ["Data", "Valor", "Descrição", "", "Montante", "Saldo"],
        ...asc.map((r) => [
          utcDate(r.date),
          utcDate(r.date),
          r.description,
          "",
          r.amount / 100,
          r.balance / 100,
        ]),
      ];
      const merges: XLSX.Range[] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
        { s: { r: 2, c: 2 }, e: { r: 2, c: 3 } },
      ];
      return file("xlsx-merged-headers.xlsx", workbook([["Movimentos", aoa, merges]], "xlsx"));
    }
    case "xls-serial-dates": {
      const aoa: (string | number | Date)[][] = [
        ["Data", "Descrição", "Montante"],
        ...asc.map((r) => [excelSerial(r.date), r.description, r.amount / 100]),
      ];
      return file("xls-serial-dates.xls", workbook([["Folha1", aoa]], "biff8"));
    }
    case "ods-two-sheets": {
      const cover: (string | number | Date)[][] = [
        ["Resumo"],
        ["Conta fictícia"],
        ["Sem movimentos nesta folha"],
      ];
      const aoa: (string | number | Date)[][] = [
        ["Data", "Descrição", "Débito", "Crédito"],
        ...asc.map((r) => [
          utcDate(r.date),
          r.description,
          r.amount < 0 ? -r.amount / 100 : "",
          r.amount > 0 ? r.amount / 100 : "",
        ]),
      ];
      return file(
        "ods-two-sheets.ods",
        workbook(
          [
            ["Resumo", cover],
            ["Movimentos", aoa],
          ],
          "ods",
        ),
      );
    }
    case "ofx-sgml-cp1252": {
      const body = asc
        .map(
          (r, i) => `<STMTTRN>
<TRNTYPE>${r.amount < 0 ? "DEBIT" : "CREDIT"}
<DTPOSTED>${r.date.replaceAll("-", "")}120000
<TRNAMT>${(r.amount / 100).toFixed(2)}
<FITID>${seed}${pad(i, 4)}
<NAME>${r.description.replace(/&/g, "&amp;")}
</STMTTRN>`,
        )
        .join("\n");
      const text = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1><STMTTRNRS><TRNUID>1
<STMTRS>
<CURDEF>EUR
<BANKACCTFROM><BANKID>0000<ACCTID>00000000001<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
${body}
</BANKTRANLIST>
<LEDGERBAL><BALAMT>${((asc.at(-1)?.balance ?? 0) / 100).toFixed(2)}<DTASOF>20240229</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>
`;
      return file("ofx-sgml-cp1252.ofx", encodeCp1252(text));
    }
    case "camt053": {
      const entries = asc
        .map(
          (r, i) =>
            `<Ntry><NtryRef>${seed}-${i}</NtryRef><Amt Ccy="EUR">${(Math.abs(r.amount) / 100).toFixed(2)}</Amt><CdtDbtInd>${r.amount < 0 ? "DBIT" : "CRDT"}</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>${r.date}</Dt></BookgDt><ValDt><Dt>${r.date}</Dt></ValDt><NtryDtls><TxDtls><RmtInf><Ustrd>${r.description.replace(/&/g, "&amp;")}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>`,
        )
        .join("\n");
      const text = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><GrpHdr><MsgId>FIXTURE</MsgId></GrpHdr><Stmt><Id>1</Id><Acct><Id><IBAN>PT50000000000000000000001</IBAN></Id><Ccy>EUR</Ccy></Acct>
${entries}
</Stmt></BkToCstmrStmt></Document>`;
      return file("camt053.xml", encodeUtf8(text));
    }
  }
}

export function generateAll(seed = 1): Fixture[] {
  return VARIANTS.map((v) => generateFixture(v, seed));
}
