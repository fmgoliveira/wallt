import { describe, expect, it } from "vitest";
import { analyzeFile } from "./analyze";
import { generateFixture } from "./fixtures";
import { parseRows } from "./mapping";
import {
  columnChoices,
  columnLetter,
  exportProfiles,
  matchProfile,
  type PortableProfile,
  ProfileImportError,
  parseProfilesJson,
  tableFingerprint,
  uniqueName,
} from "./profile";

const table = (variant: Parameters<typeof generateFixture>[0], seed = 1) => {
  const a = analyzeFile(generateFixture(variant, seed).bytes);
  if (a.kind !== "table") throw new Error("table expected");
  return a;
};

describe("tableFingerprint / matchProfile", () => {
  it("is the same for another export of the same layout and differs between layouts", () => {
    const a = table("pt-semicolon-cp1252", 1);
    const b = table("pt-semicolon-cp1252", 7);
    expect(tableFingerprint(a.table, a.mapping.headerRow)).toBe(
      tableFingerprint(b.table, b.mapping.headerRow),
    );
    const other = table("pt-debit-credit");
    expect(tableFingerprint(other.table, other.mapping.headerRow)).not.toBe(
      tableFingerprint(a.table, a.mapping.headerRow),
    );
  });
  it("finds the profile that lists the fingerprint", () => {
    const profiles = [
      { id: "1", name: "A", fingerprints: ["x"] },
      { id: "2", name: "B", fingerprints: ["y", "z"] },
    ];
    expect(matchProfile(profiles, "z")?.id).toBe("2");
    expect(matchProfile(profiles, "q")).toBeUndefined();
  });
  it("a saved mapping re-reads a new export of the same layout identically", () => {
    const saved = table("pt-semicolon-cp1252", 1).mapping;
    const next = table("pt-semicolon-cp1252", 9);
    expect(parseRows(next.table.rows, saved).rows).toEqual(next.rows);
  });
});

describe("columns", () => {
  it("letters like a spreadsheet", () => {
    expect([0, 1, 25, 26, 27, 52].map(columnLetter)).toEqual(["A", "B", "Z", "AA", "AB", "BA"]);
  });
  it("labels columns by header text, or by a sample value without a header", () => {
    const withHeader = table("pt-semicolon-cp1252");
    expect(
      columnChoices(withHeader.table.rows, withHeader.mapping.headerRow).map((c) => c.label),
    ).toEqual(["A: Data Mov.", "B: Data Valor", "C: Descrição", "D: Montante", "E: Saldo"]);
    const bare = table("no-header-trailing-minus");
    expect(columnChoices(bare.table.rows, null)[0]?.label).toMatch(/^A: \d{2}-\d{2}-\d{4}$/);
  });
});

describe("portable profiles", () => {
  const a = table("pt-debit-credit");
  const profile: PortableProfile = {
    name: "Banco Exemplo – conta à ordem",
    institution: "Banco Exemplo",
    fingerprints: [tableFingerprint(a.table, a.mapping.headerRow)],
    config: { version: 1, mapping: a.mapping, delimiter: ";" },
  };

  it("round-trips through JSON", () => {
    expect(parseProfilesJson(exportProfiles([profile]))).toEqual([profile]);
  });
  it("explains what is wrong with a bad file", () => {
    expect(() => parseProfilesJson("{")).toThrow(/valid JSON/);
    expect(() => parseProfilesJson('{"kind":"other"}')).toThrow(ProfileImportError);
    expect(() =>
      parseProfilesJson('{"kind":"wallt-import-profiles","version":2,"profiles":[]}'),
    ).toThrow(/newer/);
    const broken = (patch: object) =>
      parseProfilesJson(
        JSON.stringify({
          kind: "wallt-import-profiles",
          version: 1,
          profiles: [{ ...profile, ...patch }],
        }),
      );
    expect(() => broken({ name: " " })).toThrow(/no name/);
    expect(() => broken({ fingerprints: [] })).toThrow(/fingerprints/);
    expect(() => broken({ config: { version: 1 } })).toThrow(/configuration/);
  });
  it("dedupes fingerprints and trims names", () => {
    const [p] = parseProfilesJson(
      exportProfiles([{ ...profile, name: "  X  ", fingerprints: ["a", "a", "b"] }]),
    );
    expect(p).toMatchObject({ name: "X", fingerprints: ["a", "b"] });
  });
});

describe("uniqueName", () => {
  it("numbers duplicates, ignoring case", () => {
    expect(uniqueName("Bank", [])).toBe("Bank");
    expect(uniqueName("Bank", ["bank"])).toBe("Bank (2)");
    expect(uniqueName("Bank", ["Bank", "Bank (2)"])).toBe("Bank (3)");
  });
});
