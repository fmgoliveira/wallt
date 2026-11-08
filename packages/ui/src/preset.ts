/// <reference path="./nativewind-env.d.ts" />
import nativewind from "nativewind/preset";
import type { Config } from "tailwindcss";
import {
  breakpoints,
  cssVarName,
  fontFamily,
  minTouchTarget,
  motion,
  radius,
  semanticColorNames,
  typeScale,
} from "./tokens";

const colors = Object.fromEntries(
  // Tailwind class names are kebab-case: `text-accent-fg`, `bg-surface`, `border-border-strong`.
  semanticColorNames.map((name) => [
    cssVarName(name).replace("--color-", ""),
    `rgb(var(${cssVarName(name)}) / <alpha-value>)`,
  ]),
);

const px = (n: number) => `${n}px`;

/** `[size, { lineHeight, letterSpacing }]` entries so each text class sets size, leading and tracking. */
const fontSize: Record<string, [string, { lineHeight: string; letterSpacing: string }]> =
  Object.fromEntries(
    Object.entries(typeScale).map(([k, t]) => [
      k,
      [px(t.size), { lineHeight: px(t.line), letterSpacing: px(t.tracking) }],
    ]),
  );

/**
 * Tailwind preset (guidelines rev. 2). Colours are CSS variables so light/dark and the user's data colour
 * switch at runtime. There are deliberately no brand-colour utilities: UI chrome is greyscale.
 */
const preset = {
  presets: [nativewind],
  content: [],
  darkMode: "class",
  theme: {
    screens: {
      tablet: px(breakpoints.tablet),
      desktop: px(breakpoints.desktop),
    },
    extend: {
      colors,
      borderRadius: {
        sm: px(radius.sm),
        md: px(radius.md),
        lg: px(radius.lg),
        xl: px(radius.xl),
        full: px(radius.full),
      },
      minHeight: { touch: px(minTouchTarget) },
      minWidth: { touch: px(minTouchTarget) },
      fontFamily: {
        // Named so they do not collide with the `font-medium` / `font-semibold` weight utilities.
        sans: [fontFamily.regular],
        "geist-medium": [fontFamily.medium],
        "geist-semibold": [fontFamily.semibold],
        mono: [fontFamily.mono],
      },
      fontSize,
      transitionDuration: {
        fast: `${motion.duration.fast}ms`,
        base: `${motion.duration.base}ms`,
        slow: `${motion.duration.slow}ms`,
      },
    },
  },
} satisfies Partial<Config>;

export default preset;
