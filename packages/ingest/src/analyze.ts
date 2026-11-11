import { decodeText } from "./decode";
import {
  type AnalysisNoteCode,
  type ImportMapping,
  inferMapping,
  type ParsedRow,
  type ParseError,
  parseRows,
} from "./mapping";
import { type ParsedAccount, parseStatement, sniffStatement } from "./statement";
import { sniffFileKind, type Tabular, type TabularizeOptions, tabularize } from "./tabularize";

export type Analysis =
  | {
      kind: "statement";
      format: "ofx" | "camt";
      accounts: ParsedAccount[];
      rows: ParsedRow[];
      errors: ParseError[];
      confidence: 1;
      notes: string[];
      noteCodes: AnalysisNoteCode[];
    }
  | {
      kind: "table";
      table: Tabular;
      mapping: ImportMapping;
      rows: ParsedRow[];
      errors: ParseError[];
      skipped: number;
      confidence: number;
      notes: string[];
      noteCodes: AnalysisNoteCode[];
    };

/**
 * One call from file bytes to parsed rows with every detection step applied (decode, sniff, tabularize, header,
 * columns, formats, sign). The wizard shows the result and lets the user correct the mapping; a saved profile
 * skips detection and calls `parseRows` with its own mapping.
 */
export function analyzeFile(
  bytes: Uint8Array,
  options: TabularizeOptions & { currency?: string } = {},
): Analysis {
  const currency = options.currency ?? "EUR";
  if (sniffFileKind(bytes) === "text") {
    const { text } = decodeText(bytes, options.encoding);
    if (sniffStatement(text)) {
      const statement = parseStatement(bytes);
      return {
        kind: "statement",
        format: statement.format,
        accounts: statement.accounts,
        rows: statement.accounts.flatMap((a) => a.rows),
        errors: [],
        confidence: 1,
        notes: [],
        noteCodes: [],
      };
    }
  }
  const table = tabularize(bytes, options);
  const inferred = inferMapping(table.rows, currency);
  const parsed = parseRows(table.rows, inferred.mapping, currency);
  return {
    kind: "table",
    table,
    mapping: inferred.mapping,
    rows: parsed.rows,
    errors: parsed.errors,
    skipped: parsed.skipped,
    confidence: inferred.confidence,
    notes: inferred.notes,
    noteCodes: inferred.noteCodes,
  };
}
