import { evaluateRules, type RuleLike, type TxFacts } from "./rules";

/*
 * The categorization order of PLAN §6, first confident hit wins: user rules, then (P6.3) payee memory and the
 * model. This is the one place that decides; callers (import, bank sync, the review queue) only apply the result.
 */

export type CategoryKind = "expense" | "income";

export interface CategorizeContext {
  rules: readonly RuleLike[];
  /** Type of a category id, `undefined` when it does not exist (deleted, other user). */
  categoryKind: (id: string) => CategoryKind | undefined;
}

export interface Decision {
  categoryId: string | null;
  method: "rule" | "payee_memory" | "ml" | "none";
  /** 0..1 */
  confidence: number;
  /** The category is a guess (or missing) and a person should look at it. */
  needsReview: boolean;
  /** Rule that chose the category, when `method` is `rule`. */
  ruleId: string | null;
  payeeRename: string | null;
  tagIds: string[];
}

/** A category only fits money moving the way its type says; a rule pointing the other way is ignored. */
export const fitsSign = (kind: CategoryKind | undefined, amount: number): boolean =>
  kind !== undefined && amount !== 0 && (kind === "expense") === amount < 0;

export function categorize(f: TxFacts, ctx: CategorizeContext): Decision {
  const hit = evaluateRules(ctx.rules, f);
  if (hit.categoryId && fitsSign(ctx.categoryKind(hit.categoryId), f.amount)) {
    return {
      categoryId: hit.categoryId,
      method: "rule",
      confidence: 1,
      needsReview: false,
      ruleId: hit.ruleId,
      payeeRename: hit.payeeRename,
      tagIds: hit.tagIds,
    };
  }
  return {
    categoryId: null,
    method: "none",
    confidence: 0,
    needsReview: false,
    ruleId: null,
    payeeRename: hit.payeeRename,
    tagIds: hit.tagIds,
  };
}
