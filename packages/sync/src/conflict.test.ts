import { describe, expect, it } from "vitest";
import { resolveConflict } from "./conflict";

const h = (n: number) => `${n.toString(16).padStart(12, "0")}-0000-n`;

describe("resolveConflict", () => {
  it("takes the incoming row when there is nothing local", () => {
    expect(resolveConflict("accounts", null, { hlc: h(1) })).toBe("incoming");
  });

  it("last writer wins by hlc", () => {
    expect(resolveConflict("accounts", { hlc: h(1) }, { hlc: h(2) })).toBe("incoming");
    expect(resolveConflict("accounts", { hlc: h(2) }, { hlc: h(1) })).toBe("existing");
  });

  it("equal hlc is the same write", () => {
    expect(resolveConflict("tags", { hlc: h(3) }, { hlc: h(3) })).toBe("same");
  });

  it("a user category beats a newer ML/rule category", () => {
    const user = { hlc: h(1), categorization_method: "user" };
    const ml = { hlc: h(9), categorization_method: "ml" };
    expect(resolveConflict("transactions", user, ml)).toBe("existing");
    expect(resolveConflict("transactions", ml, user)).toBe("incoming");
    expect(resolveConflict("transactions", { ...user, hlc: h(5) }, { ...user, hlc: h(2) })).toBe(
      "existing",
    );
  });

  it("the user exception applies to transactions only", () => {
    const a = { hlc: h(1), categorization_method: "user" };
    const b = { hlc: h(9), categorization_method: "ml" };
    expect(resolveConflict("accounts", a, b)).toBe("incoming");
  });
});
