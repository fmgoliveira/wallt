import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { cn } from "./primitives";

export interface GlassSurfaceProps {
  className?: string | undefined;
  /** Blur strength for the native `BlurView` (0-100). */
  intensity?: number;
  children?: ReactNode;
}

/**
 * Translucent "glass" surface (ADR 0004). Web: CSS `backdrop-filter`. Native: `expo-blur` BlurView under a
 * translucent fill. If blur is unavailable the translucent fill + border still read as a card.
 */
export function GlassSurface({ className, intensity = 40, children }: GlassSurfaceProps) {
  const { scheme } = useTheme();
  const base = cn("overflow-hidden rounded-lg border border-border bg-surface/70", className);

  if (Platform.OS === "web") {
    return <View className={cn(base, "web:backdrop-blur-xl")}>{children}</View>;
  }
  return (
    <View className={base}>
      <BlurView
        intensity={intensity}
        tint={scheme === "dark" ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}
