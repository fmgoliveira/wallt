import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, type PressableProps, View } from "react-native";
import { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "../theme/context";
import { motion } from "../tokens";
import { AnimatedView, cn, Text, type TextTone } from "./primitives";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const container: Record<ButtonVariant, string> = {
  primary: "bg-accent",
  secondary:
    "border border-white/70 bg-white/55 dark:border-white/15 dark:bg-white/[0.07] web:backdrop-blur-xl",
  ghost: "bg-transparent",
  danger: "bg-negative",
};

// Hover feedback only applies to enabled buttons.
const hover: Record<ButtonVariant, string> = {
  primary: "web:hover:opacity-90",
  secondary: "web:hover:bg-white/80 dark:web:hover:bg-white/15",
  ghost: "web:hover:bg-border/40",
  danger: "web:hover:opacity-90",
};

const labelTone: Record<ButtonVariant, TextTone> = {
  primary: "onAccent",
  secondary: "default",
  ghost: "accent",
  danger: "onAccent",
};

export interface ButtonProps extends Omit<PressableProps, "children" | "style"> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leading?: ReactNode;
  className?: string | undefined;
}

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading,
  leading,
  disabled,
  className,
  onPressIn,
  onPressOut,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const inactive = disabled || loading;
  const spinner = variant === "primary" || variant === "danger" ? colors.accentFg : colors.accent;

  return (
    <View className={className}>
      <AnimatedView style={style}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: !!inactive, busy: !!loading }}
          disabled={inactive}
          onPressIn={(e) => {
            scale.value = withSpring(0.97, motion.spring);
            onPressIn?.(e);
          }}
          onPressOut={(e) => {
            scale.value = withSpring(1, motion.spring);
            onPressOut?.(e);
          }}
          className={cn(
            "min-h-touch flex-row items-center justify-center gap-2 rounded-md px-4 web:focus-visible:outline-2 web:focus-visible:outline-accent",
            size === "lg" && "min-h-[52px] px-6",
            container[variant],
            inactive
              ? "opacity-50 web:cursor-not-allowed"
              : cn("web:cursor-pointer", hover[variant]),
          )}
          {...rest}
        >
          {loading ? <ActivityIndicator size="small" color={spinner} /> : leading}
          <View>
            <Text variant="body" tone={labelTone[variant]} className="font-inter-semibold">
              {label}
            </Text>
          </View>
        </Pressable>
      </AnimatedView>
    </View>
  );
}
