import type { ReactNode } from "react";
import { Children } from "react";
import {
  Easing,
  Keyframe,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { motion } from "../tokens";
import { AnimatedView } from "./primitives";

function rise(delay: number) {
  return new Keyframe({
    0: { opacity: 0, transform: [{ translateY: motion.rise }] },
    100: {
      opacity: 1,
      transform: [{ translateY: 0 }],
      easing: Easing.out(Easing.cubic),
    },
  })
    .duration(motion.duration.base)
    .delay(delay)
    .reduceMotion(ReduceMotion.System);
}

export interface RevealProps {
  /** Position in a staggered group; later items start `stagger.step` ms later, capped at `stagger.max`. */
  index?: number;
  className?: string | undefined;
  children?: ReactNode;
}

/** Entrance (guidelines §8): fade + 6 px rise, 180 ms, 25 ms stagger, at most 8 items. Instant with reduce motion. */
export function Reveal({ index = 0, className, children }: RevealProps) {
  const step = Math.min(index, motion.stagger.max - 1) * motion.stagger.step;
  return (
    <AnimatedView entering={rise(step)} className={className}>
      {children}
    </AnimatedView>
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
 * Press feedback (scale 0.98, spring). Put `style` on an `AnimatedView` that wraps the pressable and
 * wire `onPressIn`/`onPressOut` to it. Never combine with a `className` on the same animated view.
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
