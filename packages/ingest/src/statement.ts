import { type CalendarDate, isValidDate, parseAmount } from "@wallt/core";
import { decodeText } from "./decode";
import type { ParsedRow } from "./mapping";
import {
  child,
  children,
  findAll,
  findDeep,
  type Node,
  parseOfxTree,
  parseXml,
  textAt,
} from "./markup";

/** One account's worth of a structured statement (OFX or CAMT). Same row shape as the spreadsheet path. */
export interface ParsedAccount {
  iban: string | null;
  /** Bank account number as the file names it (OFX ACCTID / CAMT other id). */
  accountId: string | null;
  bankId: string | null;
  currency: string;
  openingBalance: { amount: number; date: CalendarDate | null } | null;
  closingBalance: { amount: number; date: CalendarDate | null } | null;
  rows: ParsedRow[];
}

export interface ParsedStatement {
  format: "ofx" | "camt";
  accounts: ParsedAccount[];
}

export class StatementError extends Error {}

const PLACEHOLDER_IDS = new Set(["NOTPROVIDED", "NONREF", "N/A", "0"]);

const amountOf = (text: string, currency: string): number => {
  const t = text.trim();
  // OFX allows a decimal comma; CAMT/OFX amounts otherwise use a point
  return parseAmount(t, currency, /,/.test(t) && !/\./.test(t) ? "pt" : "en");
};

const ymd = (s: string | null): CalendarDate | null => {
  if (!s) return null;
  const compact = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  const m = compact ?? iso;
  if (!m) return null;
  const d = `${m[1]}-${m[2]}-${m[3]}`;
  return isValidDate(d) ? d : null;
};

const join = (parts: (string | null | undefined)[]): string => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const v = p?.replace(/\s+/g, " ").trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out.join(" - ");
};

/* ------------------------------------------------------------------------- OFX */

function ofxStatement(root: Node): ParsedAccount[] {
  const ofx = findDeep(root, "OFX");
  if (!ofx) throw new StatementError("Not an OFX file");
  const accounts: ParsedAccount[] = [];
  for (const stmt of [...findAll(ofx, "STMTRS"), ...findAll(ofx, "CCSTMTRS")]) {
    const currency = (textAt(stmt, "CURDEF") ?? "EUR").toUpperCase();
    const acct = child(stmt, "BANKACCTFROM") ?? child(stmt, "CCACCTFROM");
    const list = child(stmt, "BANKTRANLIST");
    const rows: ParsedRow[] = [];
    for (const [i, t] of children(list, "STMTTRN").entries()) {
      const posted = ymd(textAt(t, "DTPOSTED"));
      const amountText = textAt(t, "TRNAMT");
      if (!posted || !amountText)
        throw new StatementError(`Transaction ${i + 1} has no date or amount`);
      const name = textAt(t, "NAME") ?? textAt(t, "PAYEE");
      const fitid = textAt(t, "FITID");
      rows.push({
        rowIndex: i,
        bookingDate: posted,
        valueDate: ymd(textAt(t, "DTUSER")),
        amount: amountOf(amountText, currency),
        currency,
        description: join([name, textAt(t, "MEMO")]),
        payee: name,
        reference: textAt(t, "REFNUM") ?? textAt(t, "CHECKNUM"),
        category: null,
        balance: null,
        externalId: fitid && !PLACEHOLDER_IDS.has(fitid) ? fitid : null,
      });
    }
    const ledger = child(stmt, "LEDGERBAL");
    const closingText = textAt(ledger, "BALAMT");
    accounts.push({
      iban: null,
      accountId: textAt(acct, "ACCTID"),
      bankId: textAt(acct, "BANKID"),
      currency,
      openingBalance: null,
      closingBalance: closingText
        ? { amount: amountOf(closingText, currency), date: ymd(textAt(ledger, "DTASOF")) }
        : null,
      rows,
    });
  }
  if (accounts.length === 0) throw new StatementError("The OFX file holds no statements");
  return accounts;
}

/* ------------------------------------------------------------------------ CAMT */

function camtBalance(stmt: Node, code: string, currency: string): ParsedAccount["closingBalance"] {
  for (const bal of children(stmt, "Bal")) {
    if (textAt(bal, "Tp", "CdOrPrtry", "Cd") !== code) continue;
    const amt = textAt(bal, "Amt");
    if (!amt) continue;
    const ccy = child(bal, "Amt")?.attrs.Ccy ?? currency;
    const signed = amountOf(amt, ccy);
    return {
      amount: textAt(bal, "CdtDbtInd") === "DBIT" ? -signed : signed,
      date: ymd(textAt(bal, "Dt", "Dt") ?? textAt(bal, "Dt", "DtTm")),
    };
  }
  return null;
}

function camtStatement(root: Node): ParsedAccount[] {
  const doc = findDeep(root, "Document");
  if (!doc) throw new StatementError("Not a CAMT file");
  const accounts: ParsedAccount[] = [];
  const containers = [...findAll(doc, "Stmt"), ...findAll(doc, "Rpt"), ...findAll(doc, "Ntfctn")];
  for (const stmt of containers) {
    const acct = child(stmt, "Acct");
    const currency = (
      textAt(acct, "Ccy") ??
      child(stmt, "Bal")?.children.find((c) => c.name === "Amt")?.attrs.Ccy ??
      "EUR"
    ).toUpperCase();
    const rows: ParsedRow[] = [];
    for (const [i, e] of children(stmt, "Ntry").entries()) {
      const amtNode = child(e, "Amt");
      const amtText = amtNode?.text.trim();
      const booked = ymd(textAt(e, "BookgDt", "Dt") ?? textAt(e, "BookgDt", "DtTm"));
      const valued = ymd(textAt(e, "ValDt", "Dt") ?? textAt(e, "ValDt", "DtTm"));
      const date = booked ?? valued;
      if (!amtText || !date) throw new StatementError(`Entry ${i + 1} has no date or amount`);
      const ccy = (amtNode?.attrs.Ccy ?? currency).toUpperCase();
      let amount = amountOf(amtText, ccy);
      if (textAt(e, "CdtDbtInd") === "DBIT") amount = -amount;
      // a reversal undoes the booking: the sign flips
      if (textAt(e, "RvslInd") === "true") amount = -amount;
      const details = children(child(e, "NtryDtls"), "TxDtls");
      const single = details.length === 1 ? details[0] : undefined;
      const credit = (textAt(e, "CdtDbtInd") === "CRDT") !== (textAt(e, "RvslInd") === "true");
      const party = (n: Node | undefined) =>
        textAt(n, "RltdPties", credit ? "Dbtr" : "Cdtr", "Nm") ??
        textAt(n, "RltdPties", credit ? "Dbtr" : "Cdtr", "Pty", "Nm");
      const unstructured = details.flatMap((d) =>
        children(child(d, "RmtInf"), "Ustrd").map((u) => u.text),
      );
      const names = details.map((d) => party(d));
      const payee = names.find((n) => n) ?? null;
      const ref = (single ? textAt(single, "Refs", "EndToEndId") : null) ?? null;
      const ext =
        textAt(e, "NtryRef") ??
        textAt(e, "AcctSvcrRef") ??
        (single ? textAt(single, "Refs", "TxId") : null);
      rows.push({
        rowIndex: i,
        bookingDate: date,
        valueDate: valued,
        amount,
        currency: ccy,
        description:
          join([
            ...unstructured,
            textAt(e, "AddtlNtryInf"),
            ...details.map((d) => textAt(d, "AddtlTxInf")),
          ]) ||
          payee ||
          "",
        payee,
        reference: ref && !PLACEHOLDER_IDS.has(ref) ? ref : null,
        category: null,
        balance: null,
        externalId: ext && !PLACEHOLDER_IDS.has(ext) ? ext : null,
      });
    }
    const iban = textAt(acct, "Id", "IBAN");
    accounts.push({
      iban,
      accountId: textAt(acct, "Id", "Othr", "Id"),
      bankId:
        textAt(acct, "Svcr", "FinInstnId", "BIC") ?? textAt(acct, "Svcr", "FinInstnId", "BICFI"),
      currency,
      openingBalance: camtBalance(stmt, "OPBD", currency),
      closingBalance: camtBalance(stmt, "CLBD", currency),
      rows,
    });
  }
  if (accounts.length === 0) throw new StatementError("The CAMT file holds no statements");
  return accounts;
}

/* ----------------------------------------------------------------------- entry */

export type StatementFormat = "ofx" | "camt";

/** Which structured format the text is, or null (then it is a table: CSV/spreadsheet). */
export function sniffStatement(text: string): StatementFormat | null {
  const head = text.slice(0, 4000);
  if (/OFXHEADER\s*:|<OFX[\s>]/i.test(head)) return "ofx";
  if (/<(?:\w+:)?Document[\s>][\s\S]*?camt\.0(?:52|53|54)/i.test(text.slice(0, 8000)))
    return "camt";
  if (/urn:iso:std:iso:20022:tech:xsd:camt\./.test(head)) return "camt";
  return null;
}

/** Parse an OFX/QFX or CAMT.052/053/054 file. Throws `StatementError` on a malformed or empty file. */
export function parseStatement(bytes: Uint8Array): ParsedStatement {
  const { text } = decodeText(bytes);
  const format = sniffStatement(text);
  if (!format) throw new StatementError("Unrecognised statement format");
  if (format === "ofx") {
    const body = text.slice(Math.max(0, text.search(/<OFX[\s>]/i)));
    return { format, accounts: ofxStatement(parseOfxTree(body)) };
  }
  return { format, accounts: camtStatement(parseXml(text)) };
}
