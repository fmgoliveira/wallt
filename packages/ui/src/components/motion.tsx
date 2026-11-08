import { Children, type ReactNode, useEffect } from "react";
import { View } from "react-native";
import {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { motion } from "../tokens";
import { MotionView } from "./primitives";

export interface RevealProps {
  /** Position in a staggered group; later items start `stagger.step` ms later, capped at `stagger.max`. */
  index?: number;
  /** Applied to a plain wrapper View (layout of the Reveal itself, e.g. `self-start`). */
  className?: string | undefined;
  children?: ReactNode;
}

/**
 * Entrance (guidelines §8): fade + 6 px rise, 180 ms, 25 ms stagger, at most 8 items. Instant with reduce
 * motion. Driven by shared values rather than layout animations: the `entering` path leaves elements
 * `visibility: hidden` on web when the tree mounts late, which made whole screens invisible.
 * Children are laid out in a column inside the animated view; put row layouts inside, not on `className`.
 */
export function Reveal({ index = 0, className, children }: RevealProps) {
  const reduce = useReducedMotion();
  const progress = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    if (reduce) {
      progress.value = 1;
      return;
    }
    const delay = Math.min(index, motion.stagger.max - 1) * motion.stagger.step;
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: motion.duration.base, easing: Easing.out(Easing.cubic) }),
    );
  }, [reduce, index, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * motion.rise }],
  }));

  return (
    <View className={className}>
      <MotionView style={style}>{children}</MotionView>
    </View>
  );
}

/** Wrap each child of a stack in `<Reveal>` with an increasing stagger index. */
export function RevealGroup({ children, start = 0 }: { children: ReactNode; start?: number }) {
  return (
    <>
      {Children.toArray(children).map((child, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: children are static, positions define the stagger
        <Reveal key={i} index={start + i}>
          {child}
        </Reveal>
      ))}
    </>
  );
}

/**
 * Press feedback (scale 0.98, spring). Put `style` on a `MotionView` that wraps the pressable and
 * wire `onPressIn`/`onPressOut` to it.
 */
export function usePressScale() {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return {
    style,
    onPressIn: () => {
      scale.value = withSpring(motion.press.scale, motion.spring);
    },
    onPressOut: () => {
      scale.value = withSpring(1, motion.spring);
    },
  };
}
