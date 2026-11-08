import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { useTheme } from "../theme/context";
import { motion, withAlpha } from "../tokens";
import { cn } from "./primitives";

export interface SkeletonProps {
  className?: string | undefined;
}

/**
 * Placeholder block (`text/6`) with a slow pulse; static when the OS asks for reduced motion. Size it with
 * `className`. Uses React Native's own `Animated`: the NativeWind wrapper around Reanimated views can drop
 * the animated style on Android, which made these bars invisible.
 */
export function Skeleton({ className }: SkeletonProps) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(1)).current;
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
      opacity.setValue(1);
      return;
    }
    const half = motion.duration.slow * 3;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
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
      <Animated.View style={{ flex: 1, opacity, backgroundColor: withAlpha(colors.text, 0.06) }} />
    </View>
  );
}
