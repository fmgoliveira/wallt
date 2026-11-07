import "../global.css";

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { ThemeProvider, useTheme } from "@wallt/ui";
import { DefaultTheme, ThemeProvider as NavigationThemeProvider, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

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
  // Inter is bundled with the app (self-hosted: no network font fetch). Render after load so text
  // never flashes in a fallback face with different metrics.
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!loaded && !error) return null;

  return (
    <ThemeProvider>
      <ThemedStack />
    </ThemeProvider>
  );
}
