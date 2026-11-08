import { useEffect } from "react";
import { View } from "react-native";
import {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useTheme } from "../theme/context";
import { motion } from "../tokens";
import { AnimatedView, cn } from "./primitives";

export interface SkeletonProps {
  className?: string | undefined;
}

/** Placeholder block. Pulses; static when the OS asks for reduced motion. Size it with `className`. */
export function Skeleton({ className }: SkeletonProps) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (reduce) {
      opacity.value = 0.7;
      return;
    }
    opacity.value = withRepeat(
      withTiming(0.45, { duration: motion.duration.slow * 3, reduceMotion: ReduceMotion.System }),
      -1,
      true,
    );
  }, [reduce, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn("h-4 overflow-hidden rounded-sm", className)}
    >
      <AnimatedView style={[{ flex: 1, backgroundColor: colors.border }, style]} />
    </View>
  );
}
