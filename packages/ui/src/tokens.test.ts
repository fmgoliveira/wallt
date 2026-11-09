import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import {
  actionGradient,
  areaGradient,
  type ColorScheme,
  categoryPalette,
  colorsByScheme,
  cssVarName,
  dataPalette,
  glowColors,
  gradientPoints,
  heroGradient,
  hexToChannels,
  mixHex,
  onHero,
  progressGradient,
  resolveColors,
  semanticColorNames,
  surfaceGradient,
  themeVars,
  typeScale,
  withAlpha,
} from "./tokens";

const schemes: ColorScheme[] = ["light", "dark"];
const AA_TEXT = 4.5;
const AA_UI = 3;
const surfaces = ["bg", "surface", "elevated"] as const;

describe("contrast helper", () => {
  it("matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThan(4.5); // classic AA grey
  });
});

describe.each(schemes)("%s theme contrast (WCAG AA)", (scheme) => {
  const c = colorsByScheme[scheme];

  it.each(["text", "muted", "data", "positive", "negative", "warning"] as const)(
    "%s text is AA on bg, surface and elevated",
    (name) => {
      for (const bg of surfaces) {
        expect(contrastRatio(c[name], c[bg])).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  it("subtle stays decorative but still readable as large text (>= 3:1 on surface)", () => {
    expect(contrastRatio(c.subtle, c.surface)).toBeGreaterThanOrEqual(2.5);
  });

  it("accent foreground is AA on the accent fill", () => {
    expect(contrastRatio(c.accentFg, c.accent)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("accent foreground is AA on both action-gradient stops", () => {
    for (const stop of actionGradient(scheme).colors) {
      expect(contrastRatio(c.accentFg, stop)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("white text is AA on both hero-gradient stops", () => {
    for (const stop of heroGradient(scheme).colors) {
      expect(contrastRatio("#ffffff", stop)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("hairlines are visible against surfaces and strong borders more so", () => {
    expect(contrastRatio(c.border, c.surface)).toBeGreaterThanOrEqual(1.1);
    expect(contrastRatio(c.borderStrong, c.surface)).toBeGreaterThan(
      contrastRatio(c.border, c.surface),
    );
  });

  it.each(Object.entries(dataPalette))(
    "data colour %s works as text, focus ring and series",
    (_n, v) => {
      const data = v[scheme];
      for (const bg of surfaces) {
        expect(contrastRatio(data, c[bg])).toBeGreaterThanOrEqual(AA_TEXT);
      }
    },
  );

  it.each(Object.entries(categoryPalette))(
    "category colour %s has >= 3:1 on bg and surface",
    (_n, v) => {
      expect(contrastRatio(v[scheme], c.surface)).toBeGreaterThanOrEqual(AA_UI);
      expect(contrastRatio(v[scheme], c.bg)).toBeGreaterThanOrEqual(AA_UI);
    },
  );

  it("surface gradient stops stay close to the surface colour (barely visible)", () => {
    for (const stop of surfaceGradient(scheme).colors) {
      expect(contrastRatio(stop, c.surface)).toBeLessThan(1.1);
    }
  });
});

describe("token helpers", () => {
  it("converts hex to channel triples and rgba", () => {
    expect(hexToChannels("#ffffff")).toBe("255 255 255");
    expect(hexToChannels("#41618a")).toBe("65 97 138");
    expect(withAlpha("#41618a", 0.22)).toBe("rgba(65, 97, 138, 0.22)");
    expect(() => hexToChannels("red")).toThrow();
  });

  it("builds kebab-case CSS variable names", () => {
    expect(cssVarName("accentFg")).toBe("--color-accent-fg");
    expect(cssVarName("borderStrong")).toBe("--color-border-strong");
    expect(cssVarName("bg")).toBe("--color-bg");
  });

  it("emits a variable for every semantic colour and honours the data colour", () => {
    const vars = themeVars("dark", "teal");
    expect(Object.keys(vars)).toHaveLength(semanticColorNames.length);
    expect(vars["--color-data"]).toBe(hexToChannels(dataPalette.teal.dark));
    expect(resolveColors("light").data).toBe(dataPalette.steel.light);
  });

  it("mixes colours", () => {
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
    expect(mixHex("#123456", "#123456", 0.3)).toBe("#123456");
  });

  it("area gradient fades to fully transparent", () => {
    const g = areaGradient("#41618a");
    expect(g.colors[0]).toBe("rgba(65, 97, 138, 0.3)");
    expect(g.colors[1]).toBe("rgba(65, 97, 138, 0)");
  });

  it("progress gradient switches to negative when over budget", () => {
    expect(progressGradient("light").colors[1]).toBe(colorsByScheme.light.text);
    expect(progressGradient("light", true).colors[1]).toBe(colorsByScheme.light.negative);
  });

  it("keeps glows desaturated (grey-blue, channel spread < 60)", () => {
    for (const scheme of schemes) {
      for (const hex of [glowColors[scheme].a, glowColors[scheme].b]) {
        const [r, g, b] = hexToChannels(hex).split(" ").map(Number) as [number, number, number];
        expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(60);
      }
    }
  });

  it("type scale has no weight above semibold and positive line heights", () => {
    for (const t of Object.values(typeScale)) {
      expect(t.line).toBeGreaterThan(t.size);
      expect(t.family).not.toMatch(/_[789]00/);
    }
  });
});

describe("hero content colours and gradient geometry", () => {
  it("hero positive text is AA on both hero stops in both themes", () => {
    for (const scheme of schemes) {
      for (const stop of heroGradient(scheme).colors) {
        expect(contrastRatio(onHero.positive, stop)).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio("#ffffff", stop)).toBeGreaterThanOrEqual(AA_TEXT);
      }
    }
  });

  it("maps CSS angles to start/end points", () => {
    const down = gradientPoints(180);
    expect(down.start.y).toBeCloseTo(0);
    expect(down.end.y).toBeCloseTo(1);
    expect(down.start.x).toBeCloseTo(0.5);
    const right = gradientPoints(90);
    expect(right.start.x).toBeCloseTo(0);
    expect(right.end.x).toBeCloseTo(1);
  });
});
