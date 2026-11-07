import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import {
  accentPalette,
  type ColorScheme,
  categoryPalette,
  colorsByScheme,
  cssVarName,
  heroGradient,
  hexToChannels,
  mixHex,
  semanticColorNames,
  themeVars,
} from "./tokens";

const schemes: ColorScheme[] = ["light", "dark"];
const AA_TEXT = 4.5;
const AA_UI = 3;

describe("contrast helper", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThan(4.5); // classic AA grey
  });
});

describe.each(schemes)("%s theme contrast (WCAG AA)", (scheme) => {
  const c = colorsByScheme[scheme];

  it.each(["bg", "surface", "elevated"] as const)("text and muted are readable on %s", (bg) => {
    expect(contrastRatio(c.text, c[bg])).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.muted, c[bg])).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(["accent", "positive", "negative", "warning"] as const)(
    "%s text is readable on bg, surface and elevated",
    (name) => {
      for (const bg of ["bg", "surface", "elevated"] as const) {
        expect(contrastRatio(c[name], c[bg])).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  it("accent foreground is readable on the accent fill", () => {
    expect(contrastRatio(c.accentFg, c.accent)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("borders are visible against surfaces", () => {
    expect(contrastRatio(c.border, c.surface)).toBeGreaterThanOrEqual(1.2);
  });

  it.each(Object.entries(accentPalette))("accent option %s works as text and fill", (_n, v) => {
    const accent = v[scheme];
    expect(contrastRatio(accent, c.bg)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(accent, c.surface)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.accentFg, accent)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(Object.entries(categoryPalette))(
    "category colour %s has >= 3:1 on bg and surface",
    (_n, v) => {
      expect(contrastRatio(v[scheme], c.surface)).toBeGreaterThanOrEqual(AA_UI);
      expect(contrastRatio(v[scheme], c.bg)).toBeGreaterThanOrEqual(AA_UI);
    },
  );
});

describe("token helpers", () => {
  it("converts hex to channel triples", () => {
    expect(hexToChannels("#ffffff")).toBe("255 255 255");
    expect(hexToChannels("#4338ca")).toBe("67 56 202");
    expect(() => hexToChannels("red")).toThrow();
  });

  it("builds kebab-case CSS variable names", () => {
    expect(cssVarName("accentFg")).toBe("--color-accent-fg");
    expect(cssVarName("bg")).toBe("--color-bg");
  });

  it("emits a variable for every semantic colour and honours the accent choice", () => {
    const vars = themeVars("dark", "teal");
    expect(Object.keys(vars)).toHaveLength(semanticColorNames.length);
    expect(vars["--color-accent"]).toBe(hexToChannels(accentPalette.teal.dark));
  });
});

describe("hero gradient", () => {
  it.each(Object.keys(accentPalette) as (keyof typeof accentPalette)[])(
    "white text is AA on both stops for %s",
    (name) => {
      for (const stop of heroGradient(name)) {
        expect(contrastRatio("#ffffff", stop)).toBeGreaterThanOrEqual(4.5);
      }
    },
  );

  it("mixes colours", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#123456", "#123456", 0.3)).toBe("#123456");
  });
});
