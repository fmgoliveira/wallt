/**
 * Design tokens (plan §9.1). Single source of truth: the Tailwind preset, the theme provider and the
 * contrast tests all read from here. Colours are `#rrggbb` hex strings.
 */

export type ColorScheme = "light" | "dark";

export const semanticColorNames = [
  "bg",
  "surface",
  "elevated",
  "border",
  "text",
  "muted",
  "accent",
  "accentFg",
  "positive",
  "negative",
  "warning",
] as const;

export type SemanticColorName = (typeof semanticColorNames)[number];
export type SemanticColors = Record<SemanticColorName, string>;

export const lightColors: SemanticColors = {
  bg: "#f4f6f9",
  surface: "#ffffff",
  elevated: "#ffffff",
  border: "#dfe3ea",
  text: "#0e1420",
  muted: "#566170",
  accent: "#4338ca",
  accentFg: "#ffffff",
  positive: "#0b7a4b",
  negative: "#c0222f",
  warning: "#8a5300",
};

export const darkColors: SemanticColors = {
  bg: "#0a0d13",
  surface: "#131822",
  elevated: "#1b2230",
  border: "#2a3447",
  text: "#f1f4f9",
  muted: "#9aa6b8",
  accent: "#9aa0ff",
  accentFg: "#0a0d13",
  positive: "#3ddc97",
  negative: "#ff8591",
  warning: "#f6b94f",
};

export const colorsByScheme: Record<ColorScheme, SemanticColors> = {
  light: lightColors,
  dark: darkColors,
};

/** User-selectable accent colours (plan §9.1: "1 accent color, user-selectable"). Contrast checked in tests. */
export const accentPalette = {
  indigo: { light: "#4338ca", dark: "#9aa0ff" },
  teal: { light: "#0f766e", dark: "#4fd1c5" },
  rose: { light: "#be123c", dark: "#ff8fab" },
  amber: { light: "#92400e", dark: "#fbbf24" },
} as const satisfies Record<string, Record<ColorScheme, string>>;

export type AccentName = keyof typeof accentPalette;

/**
 * Curated category colours. Each has a light and dark variant, both >= 3:1 against `surface`
 * (WCAG non-text contrast) in their scheme; verified in `tokens.test.ts`.
 */
export const categoryPalette = {
  red: { light: "#c0392b", dark: "#ff8a80" },
  orange: { light: "#b8570a", dark: "#ffab5e" },
  amber: { light: "#8f6200", dark: "#f6c85f" },
  green: { light: "#2f7d32", dark: "#7fd97f" },
  teal: { light: "#0f766e", dark: "#4fd1c5" },
  sky: { light: "#0369a1", dark: "#6cc4f5" },
  blue: { light: "#1d4ed8", dark: "#8fb0ff" },
  indigo: { light: "#4338ca", dark: "#a3a8ff" },
  purple: { light: "#7e22ce", dark: "#c99bff" },
  pink: { light: "#be185d", dark: "#ff93c4" },
  brown: { light: "#7a4a2b", dark: "#d4a27f" },
  slate: { light: "#475569", dark: "#a5b1c2" },
} as const satisfies Record<string, Record<ColorScheme, string>>;

export type CategoryColorName = keyof typeof categoryPalette;

export const radius = { sm: 8, md: 12, lg: 20, full: 9999 } as const;

/** 4-pt spacing grid (matches Tailwind's default 1 = 4 px). */
export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;

/** Minimum interactive target size (plan §9.1: 44 px). */
export const minTouchTarget = 44;

export const elevation = {
  e1: "0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 1px rgba(15, 23, 42, 0.04)",
  e2: "0 4px 12px rgba(15, 23, 42, 0.08), 0 1px 3px rgba(15, 23, 42, 0.05)",
  e3: "0 16px 40px rgba(15, 23, 42, 0.18), 0 4px 12px rgba(15, 23, 42, 0.08)",
} as const;

export const motion = {
  duration: { fast: 120, base: 200, slow: 320 },
  /** cubic-bezier control points, usable with Reanimated's `Easing.bezier(...)`. */
  easing: {
    standard: [0.2, 0, 0, 1],
    emphasized: [0.3, 0, 0, 1],
    exit: [0.4, 0, 1, 1],
  },
  spring: { damping: 20, stiffness: 220, mass: 1 },
} as const;

/** Breakpoints from plan §9.2. */
export const breakpoints = { tablet: 640, desktop: 1024 } as const;

export const fontFamily = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export const fontSize = {
  caption: 12,
  small: 13,
  body: 15,
  title: 18,
  heading: 24,
  display: 36,
} as const;

/** `r g b` channel string, used for `rgb(var(--x) / <alpha-value>)` CSS variables. */
export function hexToChannels(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Invalid hex colour: ${hex}`);
  const n = Number.parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

export function cssVarName(name: SemanticColorName): string {
  return `--color-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** CSS variable map for a scheme, optionally overriding the accent colour. */
export function themeVars(
  scheme: ColorScheme,
  accent: AccentName = "indigo",
): Record<string, string> {
  const colors: SemanticColors = {
    ...colorsByScheme[scheme],
    accent: accentPalette[accent][scheme],
  };
  const vars: Record<string, string> = {};
  for (const name of semanticColorNames) {
    vars[cssVarName(name)] = hexToChannels(colors[name]);
  }
  return vars;
}

/** Linear blend of two `#rrggbb` colours; `t` = 0 returns `a`, 1 returns `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (h: string) => Number.parseInt(h.slice(1), 16);
  const [x, y] = [parse(a), parse(b)];
  const ch = (shift: number) =>
    Math.round(((x >> shift) & 255) * (1 - t) + ((y >> shift) & 255) * t)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/**
 * Hero gradient (net-worth card, logo mark). Built from the accent's light-theme shade so white text
 * stays AA on both stops in either scheme; the second stop drifts toward a deep violet-navy.
 */
export function heroGradient(accent: AccentName): readonly [string, string] {
  const base = accentPalette[accent].light;
  return [base, mixHex(base, "#1e1b4b", 0.55)];
}
