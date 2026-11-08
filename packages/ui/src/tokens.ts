/**
 * Design tokens. Source of truth for `docs/design/GUIDELINES.md` (rev. 2): the Tailwind preset, the theme provider,
 * components and the contrast tests all read from here. Never hard-code hex, px or ms in screens: add a token.
 * Colours are `#rrggbb` hex strings.
 */

export type ColorScheme = "light" | "dark";

export const semanticColorNames = [
  "bg",
  "surface",
  "elevated",
  "border",
  "borderStrong",
  "text",
  "muted",
  "subtle",
  "accent",
  "accentFg",
  "data",
  "positive",
  "negative",
  "warning",
] as const;

export type SemanticColorName = (typeof semanticColorNames)[number];
export type SemanticColors = Record<SemanticColorName, string>;

export const lightColors: SemanticColors = {
  bg: "#f4f5f7",
  surface: "#ffffff",
  elevated: "#ffffff",
  border: "#e4e7ec",
  borderStrong: "#d3d8e0",
  text: "#0c1118",
  muted: "#5b6573",
  // Decimals, section labels, inactive icons. Below AA: decorative / large text only (never body copy).
  subtle: "#8a94a3",
  accent: "#1d2532",
  accentFg: "#ffffff",
  data: "#41618a",
  positive: "#0d7f48",
  negative: "#d1293d",
  warning: "#a15c00",
};

export const darkColors: SemanticColors = {
  bg: "#0a0c0f",
  surface: "#12151a",
  elevated: "#191d24",
  border: "#23282f",
  borderStrong: "#2e343d",
  text: "#eef1f5",
  muted: "#8b95a5",
  subtle: "#5f6978",
  accent: "#e8edf3",
  accentFg: "#0a0c0f",
  data: "#8fa8c9",
  positive: "#3fcf8e",
  negative: "#f2606f",
  warning: "#f0b54a",
};

export const colorsByScheme: Record<ColorScheme, SemanticColors> = {
  light: lightColors,
  dark: darkColors,
};

/**
 * The only user-selectable colour (plan §9.1, decided in #79): it recolours charts' main series, the focus ring,
 * selected rows and links. Everything else stays greyscale. Steel blue is the default.
 */
export const dataPalette = {
  steel: { light: "#41618a", dark: "#8fa8c9" },
  teal: { light: "#2d6a6e", dark: "#7fc4c6" },
  violet: { light: "#5a5a9c", dark: "#a9a8e0" },
  clay: { light: "#85553b", dark: "#d3a98d" },
} as const satisfies Record<string, Record<ColorScheme, string>>;

export type DataColorName = keyof typeof dataPalette;

/**
 * Category colours: a 6 px rounded-square dot or a chart segment only, never a filled tile.
 * Each variant is >= 3:1 against `surface` (WCAG non-text contrast); verified in `tokens.test.ts`.
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

/** Radii (guidelines §6): sm chips/kbd, md buttons/inputs/tiles, lg cards/hero/menus, xl sheets/tab bar. */
export const radius = { sm: 6, md: 8, lg: 12, xl: 16, full: 9999 } as const;

/** 4-pt spacing grid (matches Tailwind's default 1 = 4 px). */
export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 12: 48 } as const;

/** Minimum interactive target (touch) and the compact desktop-web control height. */
export const minTouchTarget = 44;
export const controlHeight = { touch: 44, desktop: 36 } as const;

export const motion = {
  duration: { fast: 120, base: 180, slow: 320, ticker: 500, draw: 450 },
  /** cubic-bezier control points, usable with Reanimated's `Easing.bezier(...)`. */
  easing: {
    standard: [0.2, 0, 0, 1],
    emphasized: [0.3, 0, 0, 1],
    exit: [0.4, 0, 1, 1],
  },
  spring: { damping: 20, stiffness: 260, mass: 1 },
  press: { scale: 0.98 },
  stagger: { step: 25, max: 8 },
  rise: 6,
} as const;

/** Breakpoints from plan §9.2. */
export const breakpoints = { tablet: 640, desktop: 1024 } as const;

export const fontFamily = {
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semibold: "Geist_600SemiBold",
  mono: "GeistMono_500Medium",
} as const;

/**
 * Type scale (guidelines §5). `tracking` is in px (em x size) because React Native has no em letter-spacing.
 * Weights: 400 body, 500 UI/emphasis, 600 headings and amounts. No 700+.
 */
export const typeScale = {
  display: { size: 34, line: 38, tracking: -1.36, family: fontFamily.semibold },
  heading: { size: 24, line: 28, tracking: -0.84, family: fontFamily.semibold },
  title: { size: 16, line: 20, tracking: -0.24, family: fontFamily.semibold },
  body: { size: 14, line: 20, tracking: -0.084, family: fontFamily.regular },
  small: { size: 12.5, line: 18, tracking: 0, family: fontFamily.regular },
  label: { size: 11, line: 16, tracking: 0.66, family: fontFamily.mono },
} as const;

export type TypeVariant = keyof typeof typeScale;

/** `r g b` channel string, used for `rgb(var(--x) / <alpha-value>)` CSS variables. */
export function hexToChannels(hex: string): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m?.[1]) throw new Error(`Invalid hex colour: ${hex}`);
  const n = Number.parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** `#rrggbb` + alpha (0-1) -> `rgba(r, g, b, a)`. */
export function withAlpha(hex: string, alpha: number): string {
  return `rgba(${hexToChannels(hex).split(" ").join(", ")}, ${alpha})`;
}

export function cssVarName(name: SemanticColorName): string {
  return `--color-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Colours for a scheme with the user's `data` colour applied. */
export function resolveColors(
  scheme: ColorScheme,
  dataColor: DataColorName = "steel",
): SemanticColors {
  return { ...colorsByScheme[scheme], data: dataPalette[dataColor][scheme] };
}

/** CSS variable map for a scheme, optionally overriding the `data` colour. */
export function themeVars(
  scheme: ColorScheme,
  dataColor: DataColorName = "steel",
): Record<string, string> {
  const colors = resolveColors(scheme, dataColor);
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

/* ------------------------------------------------------------------ gradients (guidelines §3) */
/** All gradients are monochrome and subtle: they add light, never colour. */

export interface GradientSpec {
  /** Top-to-bottom (or 160° for the hero) colour stops. */
  colors: readonly [string, string];
  /** CSS-like angle in degrees (180 = top to bottom). */
  angle: number;
}

const heroStops: Record<ColorScheme, readonly [string, string]> = {
  light: ["#1d2532", "#0e131a"],
  dark: ["#2b3442", "#151a21"],
};

/** Net-worth hero, logo mark, onboarding hero. Content on it is always white (AA on both stops). */
export function heroGradient(scheme: ColorScheme): GradientSpec {
  return { colors: heroStops[scheme], angle: 160 };
}

/** Faint `data` spot in the hero's top-right corner (always the dark-theme data shade, alpha .22). */
export function heroSpot(dataColor: DataColorName = "steel"): string {
  return withAlpha(dataPalette[dataColor].dark, 0.22);
}

const actionStops: Record<ColorScheme, readonly [string, string]> = {
  light: ["#3a4658", "#1d2532"],
  dark: ["#ffffff", "#d5dde7"],
};

/** Primary button and the add button. Text on it is `accentFg`. */
export function actionGradient(scheme: ColorScheme): GradientSpec {
  return { colors: actionStops[scheme], angle: 180 };
}

const surfaceStops: Record<ColorScheme, readonly [string, string]> = {
  light: ["#ffffff", "#fbfcfd"],
  dark: ["#15181e", "#111419"],
};

/** Cards: barely visible, but removes the flat look. */
export function surfaceGradient(scheme: ColorScheme): GradientSpec {
  return { colors: surfaceStops[scheme], angle: 180 };
}

/** Chart area fills and the hero sparkline: `color/30 -> color/0`, vertical. */
export function areaGradient(color: string): GradientSpec {
  return { colors: [withAlpha(color, 0.3), withAlpha(color, 0)], angle: 180 };
}

/** Budget/goal bars. On track: `subtle -> text`. Over: `negative/60 -> negative`. Horizontal (90°). */
export function progressGradient(scheme: ColorScheme, over = false): GradientSpec {
  const c = colorsByScheme[scheme];
  return {
    colors: over ? [withAlpha(c.negative, 0.6), c.negative] : [c.subtle, c.text],
    angle: 90,
  };
}

/** Two large, blurred, desaturated slate-blue blobs for the page backdrop only. */
export const glowColors: Record<ColorScheme, { a: string; b: string; alpha: number }> = {
  light: { a: "#b9c6d8", b: "#d5dde8", alpha: 0.9 },
  dark: { a: "#2c3a50", b: "#1c2636", alpha: 0.8 },
};

/* ------------------------------------------------------------------ depth + glass (guidelines §3/§4) */

/** Depth recipe: 1 px top highlight + soft layered shadow, as CSS `box-shadow` (RN 0.76+ understands it). */
export function depthShadow(scheme: ColorScheme): string {
  return scheme === "light"
    ? "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(16,24,40,0.05), 0 6px 20px -8px rgba(16,24,40,0.10)"
    : "inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.4), 0 12px 32px -16px rgba(0,0,0,0.7)";
}

/** Lighter variant for controls (buttons, inputs, segments). */
export function controlShadow(scheme: ColorScheme): string {
  return scheme === "light"
    ? "inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(16,24,40,0.08)"
    : "inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.4)";
}

export type GlassLevel = "bar" | "sheet" | "toast";

/** Glass levels (guidelines §4): which colour, fill alpha per scheme, web blur px and native `BlurView` intensity. */
export const glassLevels: Record<
  GlassLevel,
  {
    from: "surface" | "elevated" | "bg";
    fill: Record<ColorScheme, number>;
    blur: number;
    intensity: number;
  }
> = {
  bar: { from: "surface", fill: { light: 0.74, dark: 0.66 }, blur: 24, intensity: 50 },
  sheet: { from: "elevated", fill: { light: 0.86, dark: 0.8 }, blur: 32, intensity: 60 },
  toast: { from: "elevated", fill: { light: 0.86, dark: 0.8 }, blur: 24, intensity: 50 },
};

/** Colours for content placed on the hero gradient (always dark behind it, in both themes). */
export const onHero = {
  text: "#ffffff",
  muted: "rgba(255,255,255,0.6)",
  subtle: "rgba(255,255,255,0.45)",
  positive: "#5fe0a6",
  positiveFill: "rgba(63,207,142,0.14)",
} as const;

/** CSS-angle gradient -> expo-linear-gradient start/end points (unit box). 180 = top to bottom, 90 = left to right. */
export function gradientPoints(angle: number): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const rad = (angle * Math.PI) / 180;
  const sx = Math.sin(rad) / 2;
  const cy = Math.cos(rad) / 2;
  return { start: { x: 0.5 - sx, y: 0.5 + cy }, end: { x: 0.5 + sx, y: 0.5 - cy } };
}

export type RingState = "default" | "focus" | "error";

/** Ring-based control outline (guidelines §7): a 1 px ring instead of a border; focus/error add a soft halo. */
export function ringShadow(colors: SemanticColors, state: RingState = "default"): string {
  if (state === "focus")
    return `0 0 0 1px ${colors.data}, 0 0 0 4px ${withAlpha(colors.data, 0.22)}`;
  if (state === "error")
    return `0 0 0 1px ${colors.negative}, 0 0 0 4px ${withAlpha(colors.negative, 0.14)}`;
  return `0 0 0 1px ${colors.borderStrong}, 0 1px 2px rgba(0,0,0,0.04)`;
}

/** Shadow for the add button (`actionGradient` surface): top/bottom highlight + a soft lift. */
export function actionShadow(scheme: ColorScheme): string {
  return scheme === "light"
    ? "inset 0 1px 0 rgba(255,255,255,0.2), 0 10px 24px -8px rgba(0,0,0,0.5)"
    : "inset 0 -1px 0 rgba(0,0,0,0.12), 0 10px 24px -8px rgba(0,0,0,0.6)";
}
