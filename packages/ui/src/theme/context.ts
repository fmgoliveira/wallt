import { createContext, useContext } from "react";
import type { AccentName, ColorScheme, SemanticColors } from "../tokens";
import type { SchemePreference } from "./store";

export interface Theme {
  scheme: ColorScheme;
  preference: SchemePreference;
  accent: AccentName;
  /** Resolved hex colours, for places Tailwind classes cannot reach (icons, Reanimated, charts). */
  colors: SemanticColors;
  setPreference: (p: SchemePreference) => void;
  setAccent: (a: AccentName) => void;
}

export const ThemeContext = createContext<Theme | null>(null);

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used inside <ThemeProvider>");
  return theme;
}
