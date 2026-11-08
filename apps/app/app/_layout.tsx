import "../global.css";

import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from "@expo-google-fonts/geist";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono";
import { ThemeProvider, useTheme } from "@wallt/ui";
import { useFonts } from "expo-font";
import { DefaultTheme, ThemeProvider as NavigationThemeProvider, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";

// Navigation paints its own opaque background; make it transparent so our themed backdrop shows.
const transparentNavTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "transparent", card: "transparent" },
};

function ThemedStack() {
  const { scheme } = useTheme();
  return (
    <NavigationThemeProvider value={transparentNavTheme}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "transparent" } }}
      />
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  // Geist is bundled with the app (self-hosted: no network font fetch). Render after load so text
  // never flashes in a fallback face with different metrics.
  const [loaded, error] = useFonts({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    GeistMono_500Medium,
  });

  // Static/SSR rendering has no window size (width 0), so it always produces the phone layout; on desktop the
  // browser would paint that first and then jump to the sidebar layout (and replay the entrance animation).
  // The app sits behind a login, so render it only on the client, once fonts are ready.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || (!loaded && !error)) return null;

  return (
    <ThemeProvider>
      <ThemedStack />
    </ThemeProvider>
  );
}
