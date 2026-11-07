import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { heroGradient } from "../tokens";
import { cn } from "./primitives";

export interface HeroCardProps {
  className?: string | undefined;
  children?: ReactNode;
}

/**
 * Gradient hero surface (net worth, key balance). Content must be white: both gradient stops are
 * verified AA against white. Use at most once per screen.
 */
export function HeroCard({ className, children }: HeroCardProps) {
  const { accent } = useTheme();
  return (
    <View className={cn("overflow-hidden rounded-lg shadow-e2", className)}>
      <LinearGradient
        colors={[...heroGradient(accent)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 20 }}
      >
        <View className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-white/10" />
        {children}
      </LinearGradient>
    </View>
  );
}
