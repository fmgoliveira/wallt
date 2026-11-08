import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { useTheme } from "../theme/context";
import { dataPalette, heroGradient, radius } from "../tokens";
import { Gradient } from "./Gradient";
import { cn } from "./primitives";

export interface HeroCardProps {
  className?: string | undefined;
  children?: ReactNode;
}

/**
 * Hero surface (net worth, key balance): `heroGradient` (160°) plus a faint `data` spot at the top right.
 * Content is white (AA on both stops). At most one per screen.
 */
export function HeroCard({ className, children }: HeroCardProps) {
  const { scheme, dataColor } = useTheme();
  const spot = dataPalette[dataColor].dark;
  return (
    <View
      className={cn("overflow-hidden", className)}
      style={{
        borderRadius: radius.lg,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.10), 0 0 0 1px rgba(255,255,255,0.06), 0 16px 32px -16px rgba(0,0,0,0.6)",
      }}
    >
      <Gradient fill spec={heroGradient(scheme)} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <RadialGradient id="hero-spot" cx="100%" cy="0%" r="75%">
            <Stop offset="0%" stopColor={spot} stopOpacity={0.22} />
            <Stop offset="100%" stopColor={spot} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#hero-spot)" />
      </Svg>
      <View className="p-[18px]">{children}</View>
    </View>
  );
}
