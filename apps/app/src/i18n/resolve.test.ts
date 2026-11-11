import { describe, expect, it } from "vitest";
import { isLanguagePreference, resolveLanguage } from "./resolve";

describe("resolveLanguage", () => {
  it("honours an explicit choice over the device", () => {
    expect(resolveLanguage("en", ["pt-PT"])).toBe("en");
    expect(resolveLanguage("pt", ["en-US"])).toBe("pt");
  });
  it("follows the first supported device locale", () => {
    expect(resolveLanguage("system", ["pt-PT", "en-US"])).toBe("pt");
    expect(resolveLanguage("system", ["fr-FR", "pt_BR"])).toBe("pt");
    expect(resolveLanguage("system", ["EN-gb"])).toBe("en");
  });
  it("falls back to English", () => {
    expect(resolveLanguage("system", [])).toBe("en");
    expect(resolveLanguage("system", ["de-DE", "fr"])).toBe("en");
  });
  it("validates stored values", () => {
    expect(isLanguagePreference("system")).toBe(true);
    expect(isLanguagePreference("es")).toBe(false);
    expect(isLanguagePreference(null)).toBe(false);
  });
});
