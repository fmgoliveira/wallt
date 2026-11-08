import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, type PressableProps, View } from "react-native";
import { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useTheme } from "../theme/context";
import {
  actionGradient,
  controlHeight,
  controlShadow,
  type GradientSpec,
  mixHex,
  motion,
  radius,
  withAlpha,
} from "../tokens";
import { Gradient } from "./Gradient";
import { cn, MotionView, Text, type TextTone } from "./primitives";
import { Kbd } from "./small";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "md" | "lg";

const labelTone: Record<ButtonVariant, TextTone> = {
  primary: "onAccent",
  secondary: "default",
  ghost: "muted",
  destructive: "onAccent",
};

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leading?: ReactNode;
  /** Web keyboard hint shown at the right (e.g. `N`). Ignored on native. */
  kbd?: string;
  className?: string | undefined;
}

/** 36 px on desktop web, 44 px for touch (guidelines §6). */
export function useControlHeight(): number {
  const desktop = useBreakpoint() === "desktop" && Platform.OS === "web";
  return desktop ? controlHeight.desktop : controlHeight.touch;
}

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading,
  leading,
  kbd,
  disabled,
  className,
  onPressIn,
  onPressOut,
  ...rest
}: ButtonProps) {
  const { scheme, colors } = useTheme();
  const height = useControlHeight();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || loading;

  const light = scheme === "light";
  let fill: GradientSpec | null = null;
  let background: string | undefined;
  let shadow: string | undefined;
  let spinner = colors.text;

  if (variant === "primary") {
    fill = actionGradient(scheme);
    shadow = light
      ? `inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.25), 0 0 0 1px ${colors.accent}`
      : "inset 0 -1px 0 rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.4)";
    spinner = colors.accentFg;
  } else if (variant === "secondary") {
    background = colors.elevated;
    shadow = `0 0 0 1px ${colors.borderStrong}, ${controlShadow(scheme)}`;
  } else if (variant === "destructive") {
    if (light) {
      fill = { colors: [mixHex(colors.negative, "#ffffff", 0.1), colors.negative], angle: 180 };
      shadow = "inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 2px rgba(0,0,0,0.2)";
      spinner = "#ffffff";
    } else {
      background = withAlpha(colors.negative, 0.14);
      shadow = `0 0 0 1px ${withAlpha(colors.negative, 0.3)}`;
      spinner = colors.negative;
    }
  } else {
    spinner = colors.muted;
  }

  const darkDestructive = variant === "destructive" && !light;
  const tone: TextTone = darkDestructive ? "negative" : labelTone[variant];

  return (
    <View className={className}>
      <MotionView style={anim}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!inactive, busy: !!loading }}
          disabled={inactive}
          onPressIn={(e) => {
            scale.value = withSpring(motion.press.scale, motion.spring);
            onPressIn?.(e);
          }}
          onPressOut={(e) => {
            scale.value = withSpring(1, motion.spring);
            onPressOut?.(e);
          }}
          className={cn(
            "flex-row items-center justify-center gap-2 overflow-hidden px-4 web:focus-visible:outline web:focus-visible:outline-2 web:focus-visible:outline-offset-2 web:focus-visible:outline-data",
            inactive
              ? "opacity-50 web:cursor-not-allowed"
              : "web:cursor-pointer web:transition-[filter,background-color] web:duration-150 web:hover:brightness-[1.06]",
            variant === "ghost" && !inactive && "web:hover:bg-text/5",
          )}
          style={{
            minHeight: size === "lg" ? height + 8 : height,
            borderRadius: radius.md,
            backgroundColor: background,
            boxShadow: shadow,
          }}
          {...rest}
        >
          {fill ? <Gradient fill spec={fill} /> : null}
          {loading ? (
            <ActivityIndicator size="small" color={spinner} />
          ) : leading ? (
            <View>{leading}</View>
          ) : null}
          <Text variant="body" tone={tone} weight="medium">
            {label}
          </Text>
          {kbd ? <Kbd onAccent={variant === "primary"}>{kbd}</Kbd> : null}
        </Pressable>
      </MotionView>
    </View>
  );
}
