import { type CategorizeContext, fitsSign } from "./decide";
import { lookupPayeeMemory, MEMORY_CONFIDENCE } from "./memory";
import { type MlFacts, predict } from "./ml";
import { evaluateRules } from "./rules";

export interface Suggestion {
  categoryId: string;
  source: "rule" | "payee_memory" | "ml";
  /** 0..1 */
  confidence: number;
}

/** Predictions below this are noise, not suggestions. */
const MIN_SUGGESTION = 0.05;

/**
 * Categories to offer for the review queue, best first: the matching rule, the remembered payee, then the model's
 * ranking. Only categories that fit the sign, without repeats.
 */
export function suggestCategories(f: MlFacts, ctx: CategorizeContext, limit = 4): Suggestion[] {
  const out: Suggestion[] = [];
  const add = (s: Suggestion) => {
    if (out.length >= limit || out.some((o) => o.categoryId === s.categoryId)) return;
    if (fitsSign(ctx.categoryKind(s.categoryId), f.amount)) out.push(s);
  };

  const hit = evaluateRules(ctx.rules, f);
  if (hit.categoryId) add({ categoryId: hit.categoryId, source: "rule", confidence: 1 });
  const payee = hit.payeeRename ?? f.payee;
  const remembered = ctx.memory ? lookupPayeeMemory(ctx.memory, payee) : null;
  if (remembered) {
    add({
      categoryId: remembered.categoryId,
      source: "payee_memory",
      confidence: MEMORY_CONFIDENCE,
    });
  }
  if (ctx.model) {
    for (const p of predict(ctx.model, { ...f, payee }, limit + 4)) {
      if (p.probability >= MIN_SUGGESTION) {
        add({ categoryId: p.categoryId, source: "ml", confidence: p.probability });
      }
    }
  }
  return out;
}
