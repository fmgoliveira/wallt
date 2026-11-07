/// <reference path="./nativewind-env.d.ts" />
import nativewind from "nativewind/preset";
import type { Config } from "tailwindcss";
import {
  breakpoints,
  cssVarName,
  elevation,
  fontFamily,
  fontSize,
  minTouchTarget,
  motion,
  radius,
  semanticColorNames,
} from "./tokens";

const colors = Object.fromEntries(
  // Tailwind class names are kebab-case: `text-accent-fg`, `bg-surface`.
  semanticColorNames.map((name) => [
    cssVarName(name).replace("--color-", ""),
    `rgb(var(${cssVarName(name)}) / <alpha-value>)`,
  ]),
);

/**
 * Tailwind preset (plan §9.1). Colours are CSS variables so light/dark and the user's accent choice
 * switch at runtime without `dark:` variants on every class (see ThemeProvider).
 */
const preset = {
  presets: [nativewind],
  content: [],
  darkMode: "class",
  theme: {
    screens: {
      tablet: `${breakpoints.tablet}px`,
      desktop: `${breakpoints.desktop}px`,
    },
    extend: {
      colors,
      borderRadius: {
        sm: `${radius.sm}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        full: `${radius.full}px`,
      },
      boxShadow: { e1: elevation.e1, e2: elevation.e2, e3: elevation.e3 },
      minHeight: { touch: `${minTouchTarget}px` },
      minWidth: { touch: `${minTouchTarget}px` },
      fontFamily: {
        // Named `inter-*` so they do not collide with the `font-medium`/`font-bold` weight utilities.
        sans: [fontFamily.regular],
        "inter-medium": [fontFamily.medium],
        "inter-semibold": [fontFamily.semibold],
        "inter-bold": [fontFamily.bold],
      },
      fontSize: {
        caption: `${fontSize.caption}px`,
        small: `${fontSize.small}px`,
        body: `${fontSize.body}px`,
        title: `${fontSize.title}px`,
        heading: `${fontSize.heading}px`,
        display: `${fontSize.display}px`,
      },
      transitionDuration: {
        fast: `${motion.duration.fast}ms`,
        base: `${motion.duration.base}ms`,
        slow: `${motion.duration.slow}ms`,
      },
    },
  },
} satisfies Partial<Config>;

export default preset;
