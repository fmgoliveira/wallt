import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { Platform, StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "../theme/context";
import { type GlassLevel, glassLevels, radius, withAlpha } from "../tokens";
import { cn } from "./primitives";

// Static class names so Tailwind can see them. Blur px per level come from `glassLevels`.
const webBlur: Record<GlassLevel, string> = {
  bar: "web:backdrop-blur-[24px] web:backdrop-saturate-[1.6]",
  sheet: "web:backdrop-blur-[32px] web:backdrop-saturate-[1.6]",
  toast: "web:backdrop-blur-[24px] web:backdrop-saturate-[1.6]",
};

const nativeAlpha: Record<GlassLevel, number> = { bar: 0.92, sheet: 1, toast: 1 };

export interface GlassSurfaceProps {
  level: GlassLevel;
  /** Corner radius token (`xl` for the floating tab bar and sheets, `lg` for toasts and rail). */
  rounded?: keyof typeof radius;
  className?: string | undefined;
  style?: ViewStyle;
  children?: ReactNode;
}

/**
 * Glass (guidelines §4): translucent fill + hairline + top highlight + backdrop blur.
 * Web: CSS `backdrop-filter`. Native: `expo-blur` under a slightly denser fill, so that if blur is weak
 * (Android) text behind a floating layer still does not show through.
 */
export function GlassSurface({
  level,
  rounded = "lg",
  className,
  style,
  children,
}: GlassSurfaceProps) {
  const { scheme, colors } = useTheme();
  const spec = glassLevels[level];
  const native = Platform.OS !== "web";
  // Android blur is weak, so floating layers there are (nearly) opaque to stop content behind showing through.
  const alpha = native ? nativeAlpha[level] : spec.fill[scheme];
  const edge = withAlpha(scheme === "light" ? colors.text : "#ffffff", 0.07);
  const highlight = scheme === "light" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.06)";
  const lift =
    scheme === "light"
      ? "0 12px 32px -12px rgba(16,24,40,0.22)"
      : "0 12px 32px -12px rgba(0,0,0,0.6)";

  return (
    <View
      className={cn("overflow-hidden", webBlur[level], className)}
      style={[
        {
          borderRadius: radius[rounded],
          backgroundColor: withAlpha(colors[spec.from], alpha),
          boxShadow: `0 0 0 1px ${edge}, ${lift}, inset 0 1px 0 ${highlight}`,
        },
        style,
      ]}
    >
      {native && alpha < 1 ? (
        <BlurView
          intensity={spec.intensity}
          tint={scheme === "dark" ? "dark" : "light"}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      ) : null}
      {children}
    </View>
  );
}
