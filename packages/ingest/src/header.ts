import { fromExcelSerial, looksLikeDate } from "./import-date";
import type { Rows } from "./tabularize";

export type ColumnRole =
  | "date"
  | "valueDate"
  | "description"
  | "payee"
  | "reference"
  | "amount"
  | "debit"
  | "credit"
  | "balance"
  | "category"
  | "currency";

/** Header keywords per role (PT/EN/ES/FR/DE), already normalized (lowercase, no accents, single spaces). */
const KEYWORDS: Record<ColumnRole, readonly string[]> = {
  date: [
    "data",
    "data mov",
    "data movimento",
    "data operacao",
    "data lancamento",
    "data contabilistica",
    "dt mov",
    "fecha",
    "fecha operacion",
    "date",
    "booking date",
    "transaction date",
    "posting date",
    "datum",
    "buchungstag",
    "buchungsdatum",
    "date operation",
    "date comptable",
  ],
  valueDate: [
    "data valor",
    "dt valor",
    "data de valor",
    "value date",
    "fecha valor",
    "valuta",
    "wertstellung",
    "date valeur",
  ],
  description: [
    "descricao",
    "descritivo",
    "descripcion",
    "description",
    "details",
    "detalhes",
    "movimento",
    "narrative",
    "memo",
    "libelle",
    "verwendungszweck",
    "buchungstext",
    "concepto",
    "transaction",
    "text",
    "motivo",
  ],
  payee: [
    "beneficiario",
    "payee",
    "merchant",
    "counterparty",
    "nome",
    "name",
    "destinatario",
    "empfaenger",
    "beguenstigter",
  ],
  reference: [
    "referencia",
    "reference",
    "ref",
    "documento",
    "identificador",
    "transaction id",
    "id",
    "nib",
  ],
  amount: [
    "montante",
    "valor",
    "importe",
    "amount",
    "betrag",
    "quantia",
    "value",
    "montant",
    "total",
  ],
  debit: [
    "debito",
    "debit",
    "debe",
    "soll",
    "retiro",
    "levantamentos",
    "saidas",
    "withdrawal",
    "paid out",
    "out",
  ],
  credit: [
    "credito",
    "credit",
    "haber",
    "haben",
    "deposito",
    "depositos",
    "entradas",
    "deposit",
    "paid in",
    "in",
  ],
  balance: [
    "saldo",
    "balance",
    "saldo contabilistico",
    "saldo disponivel",
    "saldo apos",
    "kontostand",
    "solde",
  ],
  category: ["categoria", "category", "kategorie", "categorie"],
  currency: ["moeda", "currency", "divisa", "waehrung", "devise"],
};

/** Lowercase, strip accents and punctuation, collapse spaces. */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The role a header names (longest matching keyword wins: "data valor" is a value date, not a date or amount). */
export function headerRole(header: string): ColumnRole | null {
  const h = normalizeHeader(header);
  if (h === "") return null;
  let best: { role: ColumnRole; len: number } | null = null;
  for (const [role, words] of Object.entries(KEYWORDS) as [ColumnRole, readonly string[]][]) {
    for (const w of words) {
      if (h === w || ` ${h} `.includes(` ${w} `)) {
        const len = w.length + (h === w ? 100 : 0);
        if (!best || len > best.len) best = { role, len };
      }
    }
  }
  return best?.role ?? null;
}

const isNumberish = (v: string) => /^[-+(]?[\s\d.,]+[)-]?\s*[€$£]?$/.test(v.trim()) && /\d/.test(v);

/**
 * Locate the header row among the first 30 rows. A header is a row of mostly textual cells (or keyword
 * hits) followed by rows that look like data: consistent width and date-like cells. Returns the row index,
 * or null when the file has no header (data starts on the first row).
 */
export function findHeaderRow(rows: Rows, scan = 30): number | null {
  let best: { index: number; score: number } | null = null;
  const limit = Math.min(scan, rows.length - 1);
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).filter((c) => c !== "");
    if (cells.length < 2) continue;
    const textual = cells.filter((c) => !isNumberish(c) && !looksLikeDate(c)).length;
    const textRatio = textual / cells.length;
    if (textRatio < 0.6) continue;
    const keyHits = cells.filter((c) => headerRole(c) !== null).length;
    const below = rows.slice(i + 1, i + 7);
    if (below.length === 0) continue;
    const width = rows[i]?.length ?? 0;
    const wide = below.filter((r) => r.length >= Math.max(2, Math.floor(width * 0.5))).length;
    // a column the header calls a date may hold Excel serials (plain integers)
    const dateCols = (rows[i] ?? []).flatMap((h, c) => {
      const role = headerRole(h);
      return role === "date" || role === "valueDate" ? [c] : [];
    });
    const isSerial = (v: string | undefined) =>
      !!v && /^\d{5}([.,]\d+)?$/.test(v) && fromExcelSerial(Number(v.replace(",", "."))) !== null;
    const dated = below.filter(
      (r) => r.some((c) => looksLikeDate(c)) || dateCols.some((c) => isSerial(r[c])),
    ).length;
    if (dated === 0) continue;
    const score =
      textRatio + (wide / below.length) * 1.5 + (dated / below.length) * 2 + keyHits * 0.75;
    if (!best || score > best.score + 1e-9) best = { index: i, score };
  }
  return best ? best.index : null;
}
