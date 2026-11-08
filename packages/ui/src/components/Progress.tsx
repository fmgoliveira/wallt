import { useEffect, useRef } from "react";
import { Animated, Easing, View } from "react-native";
import { useTheme } from "../theme/context";
import { motion, progressGradient } from "../tokens";
import { Gradient } from "./Gradient";
import { Text } from "./primitives";

export interface ProgressProps {
  /** 0..1; values above 1 fill the bar and flag it as over (budgets). */
  value: number;
  /** Caption under the bar: "62 % of €2 070". Always show the number, colour is never the only signal. */
  caption?: string;
  /** Style the fill and caption as over budget (`negative`). Defaults to `value > 1`. */
  over?: boolean;
}

/** 6 px bar, radius 3, track `text/6`, fill `progressGradient`. Draws once (450 ms) when it first appears. */
export function Progress({ value, caption, over = value > 1 }: ProgressProps) {
  const { scheme } = useTheme();
  const target = Math.max(0, Math.min(1, value));
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: target,
      duration: motion.duration.draw,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [target, width]);

  return (
    <View className="gap-1.5">
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(target * 100) }}
        className="h-1.5 overflow-hidden rounded-[3px] bg-text/5"
      >
        <Animated.View
          style={{
            height: "100%",
            width: width.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
          }}
        >
          <Gradient fill spec={progressGradient(scheme, over)} />
        </Animated.View>
      </View>
      {caption ? (
        <Text variant="small" tone={over ? "negative" : "muted"} tabular>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
