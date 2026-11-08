import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { useTheme } from "../theme/context";
import { motion } from "../tokens";
import { cn } from "./primitives";

export interface SkeletonProps {
  className?: string | undefined;
}

/**
 * Placeholder block. Pulses; static when the OS asks for reduced motion. Size it with `className`.
 * Uses React Native's own `Animated` (native driver): the NativeWind wrapper around Reanimated views
 * can drop the animated style on Android, which made these bars invisible.
 */
export function Skeleton({ className }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.9)).current;
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (alive) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduce) {
      opacity.setValue(0.7);
      return;
    }
    const half = motion.duration.slow * 3;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, opacity]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn("h-4 overflow-hidden rounded-sm", className)}
    >
      <Animated.View style={{ flex: 1, opacity, backgroundColor: colors.border }} />
    </View>
  );
}
