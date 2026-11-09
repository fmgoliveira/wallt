import { addDays, type CalendarDate, diffDays } from "@wallt/core";
import { normalizeHeader } from "./header";
import type { ParsedRow } from "./mapping";
import { sha256Hex } from "./sha256";

/*
 * Ingestion pipeline (PLAN 5): parse -> normalize -> dedup -> transfer detection. Pure: callers pass the rows
 * already in the database and apply the returned plan through the repository. Owner review: dedup (§5, "ask
 * before changing dedup logic").
 */

export interface PayeeAlias {
  /** Case-insensitive regular expression (or plain text when it is not a valid one). */
  pattern: string;
  payee: string;
}

/** The slice of a stored transaction the pipeline needs. */
export interface ExistingTx {
  id: string;
  accountId: string;
  bookingDate: CalendarDate;
  amount: number;
  currency: string;
  status: "pending" | "booked";
  kind: "expense" | "income" | "transfer";
  descriptionRaw: string;
  descriptionClean: string;
  externalId: string | null;
  dedupHash: string;
}

/* ------------------------------------------------------------------ normalize */

const CARD_FRAGMENT =
  /(?:\*{2,}|x{2,}|\.{3})\s?\d{3,4}\b|\b(?:cart[aã]o|card|cartao)\s*(?:n[.º°]?\s*)?\*?\d{4,}\b/gi;
const EMBEDDED_DATE = /\b\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?\b|\b\d{4}-\d{2}-\d{2}\b/g;
const REFERENCE =
  /\b(?:ref(?:er[eê]ncia)?|nib|iban|mb\s*way|id|op)\s*[.:#]?\s*[A-Z0-9]{6,}\b|\b\d{9,}\b/gi;

/** Clean a bank description for display: strip card fragments, embedded dates and long reference numbers. */
export function cleanDescription(raw: string): string {
  const cleaned = raw
    .replace(CARD_FRAGMENT, " ")
    .replace(EMBEDDED_DATE, " ")
    .replace(REFERENCE, " ")
    .replace(/\s*[-–|/]\s*(?=[-–|/]|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–|/:,.\s]+|[-–|/:,.\s]+$/g, "");
  return cleaned || raw.replace(/\s+/g, " ").trim();
}

/** Payee from the aliases (first match wins), else the file's payee, else the start of the cleaned description. */
export function derivePayee(
  row: Pick<ParsedRow, "payee" | "description">,
  clean: string,
  aliases: readonly PayeeAlias[],
): string {
  for (const a of aliases) {
    let hit: boolean;
    try {
      hit =
        new RegExp(a.pattern, "i").test(row.description) || new RegExp(a.pattern, "i").test(clean);
    } catch {
      hit = clean.toLowerCase().includes(a.pattern.toLowerCase());
    }
    if (hit) return a.payee;
  }
  const named = row.payee?.replace(/\s+/g, " ").trim();
  if (named) return named;
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}...` : clean;
}

/**
 * Stable key of a description for the dedup hash: lowercase, accents and punctuation gone. Deliberately dumber
 * than `cleanDescription` so later improvements to cleaning never change existing hashes.
 */
export function dedupText(description: string): string {
  return normalizeHeader(description);
}

/** `sha256(account | booking_date | amount | normalized_description | occurrence_index)` (PLAN 5). */
export function dedupHash(
  accountId: string,
  bookingDate: CalendarDate,
  amount: number,
  description: string,
  occurrence: number,
): string {
  return sha256Hex(`${accountId}|${bookingDate}|${amount}|${dedupText(description)}|${occurrence}`);
}

/* ---------------------------------------------------------------------- plan */

export type RowAction = "insert" | "duplicate" | "update-pending";

export interface PlannedRow {
  row: ParsedRow;
  action: RowAction;
  descriptionClean: string;
  payee: string;
  dedupHash: string;
  occurrence: number;
  /** Ambiguous: imported but flagged for the review queue (never silently dropped). */
  needsReview: boolean;
  reasons: string[];
  /** Existing transaction this row duplicates, updates or may duplicate. */
  existingId: string | null;
}

export interface TransferSuggestion {
  /** Index into `rows` of the imported row (action `insert` or `update-pending`). */
  rowIndex: number;
  counterpartId: string;
  /** 0..1 */
  confidence: number;
  /** Safe to link without asking: unique on both sides and confidence >= `AUTO_LINK_CONFIDENCE`. */
  auto: boolean;
}

export interface ImportSummary {
  total: number;
  inserted: number;
  duplicates: number;
  updatedPending: number;
  needsReview: number;
  transferSuggestions: number;
}

export interface ImportPlan {
  accountId: string;
  rows: PlannedRow[];
  transfers: TransferSuggestion[];
  summary: ImportSummary;
}

export interface PlanInput {
  accountId: string;
  currency: string;
  rows: readonly ParsedRow[];
  /** Non-deleted transactions of the target account near the file's date range. */
  existing: readonly ExistingTx[];
  /** Non-deleted transactions of the user's other accounts near the file's date range (transfer detection). */
  others?: readonly ExistingTx[];
  aliases?: readonly PayeeAlias[];
  /** Status of imported rows; bank files are booked. */
  status?: "pending" | "booked";
}

export const PENDING_WINDOW_DAYS = 5;
export const TRANSFER_WINDOW_DAYS = 3;
export const AUTO_LINK_CONFIDENCE = 0.9;

const tokens = (s: string) =>
  new Set(
    normalizeHeader(s)
      .split(" ")
      .filter((t) => t.length > 1),
  );

/** Token overlap (Jaccard) of two descriptions; two empty descriptions count as similar. */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let both = 0;
  for (const t of ta) if (tb.has(t)) both++;
  return both / (ta.size + tb.size - both);
}

const TRANSFER_HINT = /\b(transf|trf|transfer[eê]ncia|transfer|tfr|mbway|mb way|pagamento entre)/i;

/**
 * Plan an import: clean and number every row, drop exact duplicates, pair pending transactions with their booked
 * version, flag ambiguous near-matches for review and suggest transfers to the user's other accounts.
 */
export function planImport(input: PlanInput): ImportPlan {
  const aliases = input.aliases ?? [];
  const status = input.status ?? "booked";
  const byExternal = new Map<string, ExistingTx>();
  const byHash = new Map<string, ExistingTx>();
  for (const e of input.existing) {
    if (e.externalId) byExternal.set(e.externalId, e);
    if (e.dedupHash) byHash.set(e.dedupHash, e);
  }
  const claimed = new Set<string>(); // existing rows already matched by a file row
  const seen = new Map<string, number>(); // occurrence counter per (date, amount, text)
  const planned: PlannedRow[] = [];

  for (const row of input.rows) {
    const clean = cleanDescription(row.description);
    const payee = derivePayee(row, clean, aliases);
    const key = `${row.bookingDate}|${row.amount}|${dedupText(row.description)}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);
    const hash = dedupHash(
      input.accountId,
      row.bookingDate,
      row.amount,
      row.description,
      occurrence,
    );
    const base = {
      row,
      descriptionClean: clean,
      payee,
      dedupHash: hash,
      occurrence,
      needsReview: false,
      reasons: [] as string[],
      existingId: null as string | null,
    };

    // 1. the bank's own id
    const ext = row.externalId ? byExternal.get(row.externalId) : undefined;
    if (ext && !claimed.has(ext.id)) {
      claimed.add(ext.id);
      planned.push({ ...base, action: "duplicate", existingId: ext.id, reasons: ["Same bank id"] });
      continue;
    }
    // 2. the hash (genuinely identical rows differ by occurrence index)
    const hashed = byHash.get(hash);
    if (hashed && !claimed.has(hashed.id)) {
      claimed.add(hashed.id);
      planned.push({
        ...base,
        action: "duplicate",
        existingId: hashed.id,
        reasons: ["Same date, amount and text"],
      });
      continue;
    }
    // 3. pending -> booked: same amount within a few days and a similar description
    if (status === "booked") {
      const pending = input.existing.filter(
        (e) =>
          e.status === "pending" &&
          !claimed.has(e.id) &&
          e.amount === row.amount &&
          Math.abs(diffDays(e.bookingDate, row.bookingDate)) <= PENDING_WINDOW_DAYS &&
          descriptionSimilarity(e.descriptionClean || e.descriptionRaw, clean) >= 0.5,
      );
      if (pending.length === 1) {
        const hit = pending[0] as ExistingTx;
        claimed.add(hit.id);
        planned.push({
          ...base,
          action: "update-pending",
          existingId: hit.id,
          reasons: ["Booked version of a pending transaction"],
        });
        continue;
      }
      if (pending.length > 1) {
        planned.push({
          ...base,
          action: "insert",
          needsReview: true,
          existingId: (pending[0] as ExistingTx).id,
          reasons: [`Matches ${pending.length} pending transactions`],
        });
        continue;
      }
    }
    // 4. ambiguous: an untracked existing row with the same amount on (nearly) the same day
    const near = input.existing.filter(
      (e) =>
        !claimed.has(e.id) &&
        !e.externalId &&
        !e.dedupHash &&
        e.amount === row.amount &&
        Math.abs(diffDays(e.bookingDate, row.bookingDate)) <= 1,
    );
    if (near.length > 0) {
      planned.push({
        ...base,
        action: "insert",
        needsReview: true,
        existingId: (near[0] as ExistingTx).id,
        reasons: ["Possible duplicate of a transaction added by hand"],
      });
      continue;
    }
    planned.push({ ...base, action: "insert" });
  }

  const transfers = detectTransfers(planned, input.others ?? [], input.currency);
  const summary: ImportSummary = {
    total: planned.length,
    inserted: planned.filter((p) => p.action === "insert").length,
    duplicates: planned.filter((p) => p.action === "duplicate").length,
    updatedPending: planned.filter((p) => p.action === "update-pending").length,
    needsReview: planned.filter((p) => p.needsReview).length,
    transferSuggestions: transfers.length,
  };
  return { accountId: input.accountId, rows: planned, transfers, summary };
}

/** Opposite amounts on two own accounts within 3 days. Auto-link only when unique on both sides and strong. */
export function detectTransfers(
  rows: readonly PlannedRow[],
  others: readonly ExistingTx[],
  currency: string,
): TransferSuggestion[] {
  const candidates = others.filter((o) => o.kind !== "transfer" && o.currency === currency);
  const perRow = rows.map((p, rowIndex) => ({
    p,
    rowIndex,
    matches:
      p.action === "duplicate"
        ? []
        : candidates.filter(
            (o) =>
              o.amount === -p.row.amount &&
              p.row.amount !== 0 &&
              Math.abs(diffDays(o.bookingDate, p.row.bookingDate)) <= TRANSFER_WINDOW_DAYS,
          ),
  }));
  const usage = new Map<string, number>();
  for (const r of perRow) for (const m of r.matches) usage.set(m.id, (usage.get(m.id) ?? 0) + 1);

  const out: TransferSuggestion[] = [];
  for (const { p, rowIndex, matches } of perRow) {
    for (const m of matches) {
      const days = Math.abs(diffDays(m.bookingDate, p.row.bookingDate));
      const hinted = TRANSFER_HINT.test(p.row.description) || TRANSFER_HINT.test(m.descriptionRaw);
      const unique = matches.length === 1 && usage.get(m.id) === 1;
      let confidence =
        0.4 + (days === 0 ? 0.2 : days === 1 ? 0.1 : 0) + (hinted ? 0.3 : 0) + (unique ? 0.1 : 0);
      confidence = Math.min(1, Math.round(confidence * 100) / 100);
      out.push({
        rowIndex,
        counterpartId: m.id,
        confidence,
        auto: unique && confidence >= AUTO_LINK_CONFIDENCE,
      });
    }
  }
  return out.sort((a, b) => b.confidence - a.confidence || a.rowIndex - b.rowIndex);
}

/** Earliest/latest booking dates of the rows, widened by the matching windows: what to load as `existing`. */
export function lookupRange(
  rows: readonly Pick<ParsedRow, "bookingDate">[],
): { from: CalendarDate; to: CalendarDate } | null {
  if (rows.length === 0) return null;
  let from = rows[0]?.bookingDate as CalendarDate;
  let to = from;
  for (const r of rows) {
    if (r.bookingDate < from) from = r.bookingDate;
    if (r.bookingDate > to) to = r.bookingDate;
  }
  return { from: addDays(from, -PENDING_WINDOW_DAYS), to: addDays(to, PENDING_WINDOW_DAYS) };
}
