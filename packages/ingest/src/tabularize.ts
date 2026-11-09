import * as XLSX from "xlsx";
import { decodeText, type Encoding } from "./decode";

/** A rectangular-ish grid of cell text, row-major. Rows may be ragged; trailing empty cells are trimmed. */
export type Rows = string[][];

export type Delimiter = ";" | "," | "\t" | "|";
const DELIMITERS: readonly Delimiter[] = [";", ",", "\t", "|"];

export interface Tabular {
  kind: "delimited" | "spreadsheet";
  rows: Rows;
  encoding?: Encoding;
  delimiter?: Delimiter;
  quote?: string;
  /** Spreadsheets: the chosen sheet and every sheet name. */
  sheet?: string;
  sheets?: string[];
}

export interface TabularizeOptions {
  encoding?: Encoding;
  delimiter?: Delimiter;
  quote?: string;
  sheet?: string;
}

/** Parse RFC 4180-style delimited text: quotes, doubled quotes, embedded newlines, CRLF/LF/CR. */
export function parseDelimited(text: string, delimiter: string, quote = '"'): Rows {
  const rows: Rows = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let started = false; // cell has had any content or opened a quote
  const endCell = () => {
    row.push(cell);
    cell = "";
    started = false;
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === quote) {
        if (text[i + 1] === quote) {
          cell += quote;
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === quote && !started) {
      inQuotes = true;
      started = true;
    } else if (ch === delimiter) endCell();
    else if (ch === "\r") {
      if (text[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") endRow();
    else {
      cell += ch;
      started = true;
    }
  }
  if (started || cell !== "" || row.length > 0) endRow();
  return trimRows(rows);
}

/** Trim cells, drop trailing empty cells and trailing empty rows. Blank rows in the middle stay. */
export function trimRows(rows: Rows): Rows {
  const out = rows.map((r) => {
    const cells = r.map((c) => c.trim());
    while (cells.length > 0 && cells[cells.length - 1] === "") cells.pop();
    return cells;
  });
  while (out.length > 0 && (out[out.length - 1] as string[]).length === 0) out.pop();
  return out;
}

/**
 * Choose the delimiter whose column count is most consistent (and > 1) over the first lines.
 * Ties and single-column files fall back to `;` (the Portuguese default).
 */
export function sniffDelimiter(text: string, quote = '"'): Delimiter {
  let best: Delimiter = ";";
  let bestScore = 0;
  const sample = text.slice(0, 20000);
  for (const d of DELIMITERS) {
    const rows = parseDelimited(sample, d, quote)
      .filter((r) => r.length > 0)
      .slice(0, 60);
    if (rows.length === 0) continue;
    const counts = new Map<number, number>();
    for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
    let modeCols = 0;
    let modeRows = 0;
    for (const [cols, n] of counts) {
      if (cols > 1 && (n > modeRows || (n === modeRows && cols > modeCols))) {
        modeCols = cols;
        modeRows = n;
      }
    }
    // consistent rows weigh most, wider tables break ties
    const score = modeRows * 10 + modeCols;
    if (modeCols > 1 && score > bestScore) {
      best = d;
      bestScore = score;
    }
  }
  return best;
}

const DATE_LIKE = /(^|\D)\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}(\D|$)/;

/** How many rows contain a date-looking cell; used to pick the transaction sheet of a workbook. */
export function dateLikeRowCount(rows: Rows): number {
  let n = 0;
  for (const r of rows) if (r.some((c) => DATE_LIKE.test(c))) n++;
  return n;
}

export type FileKind = "xlsx" | "xls" | "ods" | "zip" | "text";

/** Sniff the container from magic bytes. XLSX and ODS are both ZIPs; the workbook reader tells them apart. */
export function sniffFileKind(bytes: Uint8Array): FileKind {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04)
    return "zip";
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0)
    return "xls";
  return "text";
}

function sheetToRows(ws: XLSX.WorkSheet): Rows {
  const ref = ws["!ref"];
  if (!ref) return [];
  const range = XLSX.utils.decode_range(ref);
  const rows: Rows = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined;
      row.push(cellText(cell));
    }
    rows.push(row);
  }
  return trimRows(rows);
}

/** Cell to text. Date cells become ISO `YYYY-MM-DD` (unambiguous); numbers use their displayed text. */
function cellText(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.v === undefined || cell.v === null) return "";
  if (cell.t === "d" && cell.v instanceof Date) return isoFromDate(cell.v);
  if (cell.t === "n" && typeof cell.v === "number") {
    if (cell.z && XLSX.SSF.is_date(String(cell.z))) {
      const d = XLSX.SSF.parse_date_code(cell.v);
      if (d)
        return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
    return cell.w ?? String(cell.v);
  }
  return String(cell.w ?? cell.v);
}

function isoFromDate(d: Date): string {
  return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function tabularizeWorkbook(bytes: Uint8Array, opts: TabularizeOptions): Tabular {
  const wb = XLSX.read(bytes, { type: "array", cellDates: false, cellNF: true });
  const names = wb.SheetNames;
  const all = new Map(names.map((n) => [n, sheetToRows(wb.Sheets[n] as XLSX.WorkSheet)]));
  let chosen = opts.sheet && all.has(opts.sheet) ? opts.sheet : undefined;
  if (!chosen) {
    let bestCount = -1;
    for (const [name, rows] of all) {
      const count = dateLikeRowCount(rows);
      if (count > bestCount) {
        chosen = name;
        bestCount = count;
      }
    }
  }
  const sheet = chosen ?? names[0];
  return {
    kind: "spreadsheet",
    rows: sheet ? (all.get(sheet) ?? []) : [],
    ...(sheet ? { sheet } : {}),
    sheets: names,
  };
}

/** Turn any supported tabular file (CSV/TSV/TXT, XLS, XLSX, ODS) into rows of text. */
export function tabularize(bytes: Uint8Array, opts: TabularizeOptions = {}): Tabular {
  const kind = sniffFileKind(bytes);
  if (kind === "zip" || kind === "xls") return tabularizeWorkbook(bytes, opts);
  const { text, encoding } = decodeText(bytes, opts.encoding);
  const quote = opts.quote ?? '"';
  const delimiter = opts.delimiter ?? sniffDelimiter(text, quote);
  return {
    kind: "delimited",
    rows: parseDelimited(text, delimiter, quote),
    encoding,
    delimiter,
    quote,
  };
}
