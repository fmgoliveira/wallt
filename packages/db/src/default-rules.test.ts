import { DEFAULT_RULE_SPECS } from "@wallt/categorize";
import { describe, expect, it } from "vitest";
import { DEFAULT_EXPENSE_CATEGORIES } from "./seed";

describe("default merchant rules", () => {
  it("point at seeded expense categories (`key` or `parent.child`)", () => {
    const keys = new Set<string>();
    for (const c of DEFAULT_EXPENSE_CATEGORIES) {
      keys.add(c.key);
      for (const [child] of c.children ?? []) keys.add(`${c.key}.${child}`);
    }
    const unknown = DEFAULT_RULE_SPECS.filter((s) => !keys.has(s.categoryKey)).map((s) => s.name);
    expect(unknown).toEqual([]);
  });
});
