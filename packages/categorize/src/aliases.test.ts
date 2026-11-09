import { describe, expect, it } from "vitest";
import {
  aliasMatches,
  aliasPatternKind,
  planPayeeRenames,
  previewAlias,
  resolveAlias,
} from "./aliases";
import type { HistoryTx } from "./rules";

const tx = (id: string, description: string, over: Partial<HistoryTx> = {}): HistoryTx => ({
  id,
  payee: description,
  description,
  amount: -100,
  accountId: "a",
  kind: "expense",
  categoryId: null,
  method: "none",
  ...over,
});

describe("alias matching", () => {
  it("treats the pattern as a case-insensitive regular expression", () => {
    expect(aliasMatches("pingo\\s+doce", ["COMPRA PINGO   DOCE 12"])).toBe(true);
    expect(aliasMatches("^lidl", ["Lidl Lisboa"])).toBe(true);
    expect(aliasMatches("^lidl", ["Compra Lidl"])).toBe(false);
  });

  it("falls back to plain text when the pattern is not a valid expression", () => {
    expect(aliasPatternKind("a(b")).toBe("text");
    expect(aliasPatternKind("a.b")).toBe("regex");
    expect(aliasMatches("C(ontinente", ["COMPRA C(ONTINENTE"])).toBe(true);
  });

  it("never matches an empty pattern", () => {
    expect(aliasMatches("  ", ["anything"])).toBe(false);
  });

  it("tries both the raw and the cleaned description; the first alias wins", () => {
    const aliases = [
      { pattern: "continente", payee: "Continente" },
      { pattern: "cont", payee: "Other" },
    ];
    expect(
      resolveAlias(aliases, { description: "x", descriptionRaw: "COMPRA CONTINENTE 99" })?.payee,
    ).toBe("Continente");
    expect(resolveAlias(aliases, { description: "nothing" })).toBeNull();
  });
});

describe("previewAlias and planPayeeRenames", () => {
  const history = [
    tx("1", "PINGO DOCE LISBOA"),
    tx("2", "PINGO DOCE PORTO", { payee: "Pingo Doce" }),
    tx("3", "LIDL"),
    tx("4", "PINGO DOCE", { kind: "transfer" }),
  ];
  const alias = { pattern: "pingo doce", payee: "Pingo Doce" };

  it("counts matches and renames, skipping transfers", () => {
    expect(previewAlias(alias, history)).toEqual({
      matches: 2,
      wouldRename: 1,
      sample: ["1", "2"],
    });
  });

  it("plans only the transactions whose payee changes", () => {
    expect(planPayeeRenames([alias], history)).toEqual([{ id: "1", payee: "Pingo Doce" }]);
    expect(planPayeeRenames([{ pattern: "lidl", payee: " " }], history)).toEqual([]);
  });
});
