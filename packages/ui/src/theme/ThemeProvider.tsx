import { useColorScheme as useNativeWindScheme, vars } from "nativewind";
import { type ReactNode, useEffect, useMemo } from "react";
import { Appearance, Platform, useColorScheme as useSystemScheme, View } from "react-native";
import { Backdrop } from "../components/Backdrop";
import { PortalHost } from "../components/Portal";
import { ToastHost } from "../components/Toast";
import { accentPalette, type ColorScheme, colorsByScheme, themeVars } from "../tokens";
import { type Theme, ThemeContext } from "./context";
import { useThemeStore } from "./store";

/**
 * Owns the colour scheme (ADR 0004 finding 4: do not rely on the default). Applies the semantic colour
 * variables to a root view (native) and to <html> (web, so portals and the page background follow too).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemScheme();
  const preference = useThemeStore((s) => s.preference);
  const accent = useThemeStore((s) => s.accent);
  const setPreference = useThemeStore((s) => s.setPreference);
  const setAccent = useThemeStore((s) => s.setAccent);
  const hydrate = useThemeStore((s) => s.hydrate);
  const { setColorScheme } = useNativeWindScheme();

  // Run after mount so static output and the first client render agree (ADR 0004 finding 6).
  useEffect(() => hydrate(), [hydrate]);

  const scheme: ColorScheme =
    preference === "system" ? (system === "dark" ? "dark" : "light") : preference;

  // Keep `dark:` variants in step with the user's choice.
  // Web: NativeWind toggles the `dark` class. Native: NativeWind throws on manual switching unless its
  // darkMode flag is "class", so drive React Native's own appearance instead (the `dark:` media variants
  // follow it). `"unspecified"` hands control back to the OS for "system".
  useEffect(() => {
    if (Platform.OS === "web") {
      try {
        setColorScheme(scheme);
      } catch {
        // darkMode flag not "class": the CSS variables still carry the theme
      }
    } else {
      Appearance.setColorScheme(preference === "system" ? "unspecified" : preference);
    }
  }, [scheme, preference, setColorScheme]);

  const cssVars = useMemo(() => themeVars(scheme, accent), [scheme, accent]);
  const nativeVars = useMemo(() => vars(cssVars), [cssVars]);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const root = document.documentElement;
    for (const [k, v] of Object.entries(cssVars)) root.style.setProperty(k, v);
    root.style.colorScheme = scheme;
    root.style.backgroundColor = colorsByScheme[scheme].bg;
  }, [cssVars, scheme]);

  const theme = useMemo<Theme>(
    () => ({
      scheme,
      preference,
      accent,
      colors: { ...colorsByScheme[scheme], accent: accentPalette[accent][scheme] },
      setPreference,
      setAccent,
    }),
    [scheme, preference, accent, setPreference, setAccent],
  );

  return (
    <ThemeContext.Provider value={theme}>
      <View style={[{ flex: 1 }, nativeVars]} className="bg-bg">
        <Backdrop />
        {children}
        <PortalHost />
        <ToastHost />
      </View>
    </ThemeContext.Provider>
  );
}
