import type { Rule, RuleCondition } from "@wallt/core";
import { normalizeText, stripAccents } from "./text";

/*
 * User categorization rules (PLAN §6, step 1). Pure: facts in, decision out.
 *
 * Semantics (ADR 0009):
 * - all conditions of a rule must hold (AND); rules are tried by ascending `priority`;
 * - text fields (`payee`, `description`) compare accent- and case-insensitively; `regex` runs case-insensitively on
 *   the original text, and an invalid pattern never matches;
 * - `amount` compares the absolute value in minor units (so "at least 50,00 EUR" means 5000 for a spend or a refund);
 * - `sign` is `expense` (outflow) or `income` (inflow); a zero amount has neither;
 * - `account` equals an account id.
 */

export interface TxFacts {
  payee: string;
  /** Cleaned description (falls back to the raw one when empty). */
  description: string;
  descriptionRaw?: string;
  /** Integer minor units, negative = outflow. */
  amount: number;
  accountId: string;
}

export type RuleLike = Pick<Rule, "id" | "conditions" | "action" | "priority">;

const SIGNS = ["expense", "income"] as const;

/** Why a condition cannot be saved, or `null` when it is fine. */
export function validateCondition(c: RuleCondition): string | null {
  switch (c.field) {
    case "payee":
    case "description":
      if (c.op !== "contains" && c.op !== "equals" && c.op !== "regex")
        return "Text can be matched with contains, equals or regex";
      if (typeof c.value !== "string" || c.value.trim() === "") return "Enter some text";
      if (c.op === "regex") {
        try {
          new RegExp(c.value, "i");
        } catch {
          return "Not a valid regular expression";
        }
      }
      return null;
    case "amount":
      if (c.op !== "gte" && c.op !== "lte" && c.op !== "equals")
        return "Amount can be compared with at least, at most or equals";
      if (typeof c.value !== "number" || !Number.isSafeInteger(c.value) || c.value < 0)
        return "Enter an amount in minor units";
      return null;
    case "account":
      if (c.op !== "equals") return "Account can only be matched with equals";
      return typeof c.value === "string" && c.value !== "" ? null : "Pick an account";
    case "sign":
      if (c.op !== "equals") return "Sign can only be matched with equals";
      return (SIGNS as readonly unknown[]).includes(c.value) ? null : "Pick expense or income";
  }
}

function textMatches(op: RuleCondition["op"], value: string, texts: readonly string[]): boolean {
  if (op === "regex") {
    let re: RegExp;
    try {
      re = new RegExp(value, "i");
    } catch {
      return false;
    }
    // Also try the accent-free form, so a plain "farmacia" finds "FARMÁCIA".
    return texts.some((t) => re.test(t) || re.test(stripAccents(t)));
  }
  const needle = normalizeText(value);
  if (needle === "") return false;
  return texts.some((t) => {
    const hay = normalizeText(t);
    return op === "equals" ? hay === needle : hay.includes(needle);
  });
}

/** True when the transaction satisfies the condition. Invalid conditions never match. */
export function conditionMatches(c: RuleCondition, f: TxFacts): boolean {
  if (validateCondition(c) !== null) return false;
  switch (c.field) {
    case "payee":
      return textMatches(c.op, c.value as string, [f.payee]);
    case "description":
      return textMatches(
        c.op,
        c.value as string,
        f.descriptionRaw && f.descriptionRaw !== f.description
          ? [f.description, f.descriptionRaw]
          : [f.description],
      );
    case "amount": {
      const size = Math.abs(f.amount);
      const v = c.value as number;
      return c.op === "gte" ? size >= v : c.op === "lte" ? size <= v : size === v;
    }
    case "account":
      return f.accountId === c.value;
    case "sign":
      return c.value === "expense" ? f.amount < 0 : f.amount > 0;
  }
}

export function ruleMatches(rule: Pick<RuleLike, "conditions">, f: TxFacts): boolean {
  return rule.conditions.length > 0 && rule.conditions.every((c) => conditionMatches(c, f));
}

/** Rules in evaluation order: lower priority first, ties by id so every device agrees. */
export function sortRules<T extends Pick<RuleLike, "id" | "priority">>(rules: readonly T[]): T[] {
  return [...rules].sort(
    (a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export interface RuleOutcome {
  /** Category of the first matching rule that sets one. */
  categoryId: string | null;
  /** The rule that set the category. */
  ruleId: string | null;
  /** First matching rename. */
  payeeRename: string | null;
  /** Union of the tags of every matching rule. */
  tagIds: string[];
  /** Every matching rule, in evaluation order. */
  matched: string[];
}

/** Run the rules over one transaction. Rules without a category (rename/tags only) do not stop the search. */
export function evaluateRules(rules: readonly RuleLike[], f: TxFacts): RuleOutcome {
  const out: RuleOutcome = {
    categoryId: null,
    ruleId: null,
    payeeRename: null,
    tagIds: [],
    matched: [],
  };
  for (const rule of sortRules(rules)) {
    if (!ruleMatches(rule, f)) continue;
    out.matched.push(rule.id);
    if (out.categoryId === null && rule.action.categoryId) {
      out.categoryId = rule.action.categoryId;
      out.ruleId = rule.id;
    }
    if (out.payeeRename === null && rule.action.payeeRename?.trim()) {
      out.payeeRename = rule.action.payeeRename.trim();
    }
    for (const id of rule.action.tagIds ?? []) if (!out.tagIds.includes(id)) out.tagIds.push(id);
  }
  return out;
}

export interface RulePreview {
  /** Transactions the rule matches. */
  matches: number;
  /** Matches whose category would change (not set by the user, not already that category). */
  wouldChange: number;
  /** Matches the user categorised by hand: a rule never overwrites those. */
  protectedByUser: number;
  /** Ids of the first matches, newest first as given. */
  sample: string[];
}

export interface HistoryTx extends TxFacts {
  id: string;
  kind: "expense" | "income" | "transfer";
  categoryId: string | null;
  method: "user" | "rule" | "payee_memory" | "ml" | "none";
}

/** "This rule would match 34 transactions" (PLAN P6.1): how a (possibly unsaved) rule fares on the history. */
export function previewRule(
  rule: Pick<RuleLike, "conditions" | "action">,
  history: readonly HistoryTx[],
  sampleSize = 5,
): RulePreview {
  const out: RulePreview = { matches: 0, wouldChange: 0, protectedByUser: 0, sample: [] };
  for (const tx of history) {
    if (tx.kind === "transfer" || !ruleMatches(rule, tx)) continue;
    out.matches++;
    if (out.sample.length < sampleSize) out.sample.push(tx.id);
    if (tx.method === "user") out.protectedByUser++;
    else if (rule.action.categoryId && tx.categoryId !== rule.action.categoryId) out.wouldChange++;
  }
  return out;
}

export interface Recategorization {
  id: string;
  categoryId: string;
  ruleId: string;
}

/**
 * Apply the rules to existing transactions: what to set, never touching a category the user chose by hand,
 * transfers, or a category whose type contradicts the sign (`categoryKind` returns `undefined` for unknown ids).
 */
export function planRecategorization(
  rules: readonly RuleLike[],
  history: readonly HistoryTx[],
  categoryKind: (id: string) => "expense" | "income" | undefined,
): Recategorization[] {
  const out: Recategorization[] = [];
  for (const tx of history) {
    if (tx.kind === "transfer" || tx.method === "user") continue;
    const hit = evaluateRules(rules, tx);
    if (!hit.categoryId || !hit.ruleId) continue;
    const kind = categoryKind(hit.categoryId);
    if (!kind || (kind === "expense") !== tx.amount < 0) continue;
    if (tx.categoryId === hit.categoryId && tx.method === "rule") continue;
    out.push({ id: tx.id, categoryId: hit.categoryId, ruleId: hit.ruleId });
  }
  return out;
}

/** A starting point for "create a rule from this transaction": match its payee (or description) and sign. */
export function conditionsFromTransaction(
  tx: Pick<TxFacts, "payee" | "description" | "amount">,
): RuleCondition[] {
  const payee = tx.payee.trim();
  const text = payee !== "" ? payee : tx.description.trim();
  const conditions: RuleCondition[] = [
    { field: payee !== "" ? "payee" : "description", op: "contains", value: text },
  ];
  if (tx.amount !== 0) {
    conditions.push({ field: "sign", op: "equals", value: tx.amount < 0 ? "expense" : "income" });
  }
  return conditions;
}
