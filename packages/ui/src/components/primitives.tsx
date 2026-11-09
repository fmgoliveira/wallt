import { cssInterop } from "nativewind";
import type { ReactNode } from "react";
import { Text as RNText, type TextProps as RNTextProps, View } from "react-native";
import Animated from "react-native-reanimated";

/** Join class names, skipping falsy values. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// NativeWind maps `className` onto Reanimated's Animated.View via cssInterop (ADR 0004 finding 3), but that wrapper
// flattens the `style` prop and silently drops animated styles (useAnimatedStyle) on both web and Android.
// So there are two views:
//  - AnimatedView: className + entering/exiting layout animations only (never an animated `style`).
//  - MotionView: animated `style` (useAnimatedStyle). It is a separate component, not wrapped by NativeWind,
//    so give it plain style objects only and put any className on a plain parent View.
cssInterop(Animated.View, { className: "style" });

export const AnimatedView = Animated.View;
export const MotionView = Animated.createAnimatedComponent(View);

export type TextVariant = "display" | "heading" | "title" | "body" | "small" | "label";
export type TextTone =
  | "default"
  | "onAccent"
  | "onHero"
  | "muted"
  | "subtle"
  | "data"
  | "positive"
  | "negative"
  | "warning";
export type TextWeight = "regular" | "medium" | "semibold";

const variantClass: Record<TextVariant, string> = {
  display: "text-display font-geist-semibold",
  heading: "text-heading font-geist-semibold",
  title: "text-title font-geist-semibold",
  body: "text-body font-sans",
  small: "text-small font-sans",
  label: "text-label font-mono uppercase",
};

const toneClass: Record<TextTone, string> = {
  default: "text-text",
  onAccent: "text-accent-fg",
  onHero: "text-white",
  muted: "text-muted",
  subtle: "text-subtle",
  data: "text-data",
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
};

const weightClass: Record<TextWeight, string | undefined> = {
  regular: undefined,
  medium: "font-geist-medium",
  semibold: "font-geist-semibold",
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  weight?: TextWeight;
  /** Tabular figures so digits line up (every number; `<Amount>` always sets it). */
  tabular?: boolean;
  className?: string | undefined;
  children?: ReactNode;
}

export function Text({
  variant = "body",
  tone = variant === "label" ? "subtle" : "default",
  weight,
  tabular,
  className,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      {...rest}
      style={tabular ? [{ fontVariant: ["tabular-nums"] }, style] : style}
      className={cn(
        variantClass[variant],
        toneClass[tone],
        weight && weightClass[weight],
        className,
      )}
    />
  );
}
