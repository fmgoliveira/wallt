import { lookupPayeeMemory, MEMORY_CONFIDENCE, type PayeeMemory } from "./memory";
import { AUTO_THRESHOLD, type MlFacts, type Model, predict, SUGGEST_THRESHOLD } from "./ml";
import { evaluateRules, type RuleLike } from "./rules";

/*
 * The categorization order of PLAN §6, first confident hit wins: user rules, exact payee memory, the local model.
 * This is the one place that decides; callers (import, bank sync, the review queue) only apply the result.
 */

export type CategoryKind = "expense" | "income";

export interface CategorizeContext {
  rules: readonly RuleLike[];
  /** Type of a category id, `undefined` when it does not exist (deleted, other user). */
  categoryKind: (id: string) => CategoryKind | undefined;
  memory?: PayeeMemory | undefined;
  model?: Model | null | undefined;
}

export interface Decision {
  /** Set when a category was chosen, tentatively or not. */
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

/** A category only fits money moving the way its type says; a suggestion pointing the other way is ignored. */
export const fitsSign = (kind: CategoryKind | undefined, amount: number): boolean =>
  kind !== undefined && amount !== 0 && (kind === "expense") === amount < 0;

export function categorize(f: MlFacts, ctx: CategorizeContext): Decision {
  const hit = evaluateRules(ctx.rules, f);
  const base = { ruleId: null, payeeRename: hit.payeeRename, tagIds: hit.tagIds };
  const payee = hit.payeeRename ?? f.payee;

  // 1. user rules
  if (hit.categoryId && fitsSign(ctx.categoryKind(hit.categoryId), f.amount)) {
    return {
      ...base,
      categoryId: hit.categoryId,
      method: "rule",
      confidence: 1,
      needsReview: false,
      ruleId: hit.ruleId,
    };
  }

  // 2. exact payee memory
  const remembered = ctx.memory ? lookupPayeeMemory(ctx.memory, payee) : null;
  if (remembered && fitsSign(ctx.categoryKind(remembered.categoryId), f.amount)) {
    return {
      ...base,
      categoryId: remembered.categoryId,
      method: "payee_memory",
      confidence: MEMORY_CONFIDENCE,
      needsReview: false,
    };
  }

  // 3. the model: assign above AUTO_THRESHOLD, assign tentatively and ask above SUGGEST_THRESHOLD
  if (ctx.model) {
    const best = predict(ctx.model, { ...f, payee }, 5).find((p) =>
      fitsSign(ctx.categoryKind(p.categoryId), f.amount),
    );
    if (best && best.probability >= SUGGEST_THRESHOLD) {
      return {
        ...base,
        categoryId: best.categoryId,
        method: "ml",
        confidence: best.probability,
        needsReview: best.probability < AUTO_THRESHOLD,
      };
    }
  }

  // nothing confident: uncategorised, and someone should look
  return { ...base, categoryId: null, method: "none", confidence: 0, needsReview: true };
}
