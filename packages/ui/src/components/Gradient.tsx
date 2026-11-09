import { LinearGradient } from "expo-linear-gradient";
import type { StyleProp, ViewStyle } from "react-native";
import { StyleSheet } from "react-native";
import { type GradientSpec, gradientPoints } from "../tokens";

export interface GradientProps {
  spec: GradientSpec;
  /** Fill the parent (absolute) instead of sizing as a normal view. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** A token gradient (`GradientSpec`) rendered with expo-linear-gradient. */
export function Gradient({ spec, fill, style, children }: GradientProps) {
  const { start, end } = gradientPoints(spec.angle);
  return (
    <LinearGradient
      colors={[...spec.colors]}
      start={start}
      end={end}
      pointerEvents={fill ? "none" : "auto"}
      style={[fill ? StyleSheet.absoluteFill : null, style]}
    >
      {children}
    </LinearGradient>
  );
}
