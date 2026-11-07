import { cssInterop } from "nativewind";
import type { ReactNode } from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import Animated from "react-native-reanimated";

/** Join class names, skipping falsy values. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// NativeWind does not map `className` onto Reanimated components automatically (ADR 0004 finding 3).
cssInterop(Animated.View, { className: "style" });

export const AnimatedView = Animated.View;

export type TextVariant = "display" | "heading" | "title" | "body" | "small" | "caption";
export type TextTone =
  | "default"
  | "onAccent"
  | "onHero"
  | "muted"
  | "accent"
  | "positive"
  | "negative"
  | "warning";

const variantClass: Record<TextVariant, string> = {
  display: "text-display font-inter-bold",
  heading: "text-heading font-inter-semibold",
  title: "text-title font-inter-semibold",
  body: "text-body font-sans",
  small: "text-small font-sans",
  caption: "text-caption font-inter-medium",
};

const toneClass: Record<TextTone, string> = {
  default: "text-text",
  onAccent: "text-accent-fg",
  onHero: "text-white",
  muted: "text-muted",
  accent: "text-accent",
  positive: "text-positive",
  negative: "text-negative",
  warning: "text-warning",
};

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Use tabular figures so digits line up (all monetary amounts). */
  tabular?: boolean;
  className?: string | undefined;
  children?: ReactNode;
}

export function Text({
  variant = "body",
  tone = "default",
  tabular,
  className,
  ...rest
}: TextProps) {
  return (
    <RNText
      {...rest}
      className={cn(variantClass[variant], toneClass[tone], tabular && "tabular-nums", className)}
    />
  );
}

/**
 * Shared "glass" recipe: a white-tinted translucent fill, a bright hairline edge, an inner top highlight and
 * (web) a heavy saturating backdrop blur. Needs the themed `<Backdrop>` glows behind it to read as glass.
 */
export const glass =
  "border border-white/70 bg-white/55 dark:border-white/10 dark:bg-white/[0.06] " +
  "web:backdrop-blur-2xl web:backdrop-saturate-150 " +
  "web:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_8px_32px_rgba(15,23,42,0.10)] " +
  "dark:web:shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_8px_32px_rgba(0,0,0,0.35)]";
