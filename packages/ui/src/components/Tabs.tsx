import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "../theme/context";
import { controlShadow, motion, radius } from "../tokens";
import { cn, MotionView, Text } from "./primitives";

interface Measurable {
  measure: (cb: (x: number, y: number, width: number, height: number) => void) => void;
}

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

export interface TabsProps<T extends string> {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string | undefined;
}

/**
 * Segmented control for in-screen switching (not app navigation, see the shell). Track `text/5`; the active
 * segment is a raised `elevated` pill that springs between segments (guidelines §7/§8).
 */
export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  const { colors, scheme } = useTheme();
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const placed = useRef(false);
  const refs = useRef<Record<string, Measurable | null>>({});

  // `onLayout` does not fire on these views under NativeWind's wrapper, so measure explicitly (x is relative
  // to the track). Re-measure shortly after mount: fonts finishing loading changes the label widths.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the set of labels changes
  useEffect(() => {
    const measure = () => {
      for (const item of items) {
        refs.current[item.value]?.measure((mx, _my, mw) => {
          setLayouts((prev) =>
            prev[item.value]?.x === mx && prev[item.value]?.width === mw
              ? prev
              : { ...prev, [item.value]: { x: mx, width: mw } },
          );
        });
      }
    };
    measure();
    const t = setTimeout(measure, 150);
    return () => clearTimeout(t);
  }, [items.map((i) => i.label).join("|")]);

  useEffect(() => {
    const l = layouts[value];
    if (!l) return;
    if (!placed.current) {
      // First placement: jump, do not animate in from zero.
      x.value = l.x;
      width.value = l.width;
      placed.current = true;
    } else {
      x.value = withSpring(l.x, motion.spring);
      width.value = withSpring(l.width, motion.spring);
    }
  }, [layouts, value, x, width]);

  const pill = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
    width: width.value,
  }));

  return (
    <View
      accessibilityRole="tablist"
      className={cn("flex-row gap-0.5 self-start bg-text/5 p-[3px]", className)}
      style={{ borderRadius: radius.md }}
    >
      <MotionView
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 0,
            borderRadius: radius.sm,
            backgroundColor: colors.elevated,
            boxShadow: `0 0 0 1px ${colors.border}, ${controlShadow(scheme)}`,
          },
          pill,
        ]}
      />
      {items.map((item) => {
        const active = item.value === value;
        return (
          <View
            key={item.value}
            ref={(node) => {
              refs.current[item.value] = node;
            }}
          >
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(item.value)}
              className={cn(
                "min-h-touch tablet:min-h-[34px] min-w-touch items-center justify-center px-4 web:cursor-pointer web:outline-none web:transition-colors web:duration-150 web:focus-visible:bg-text/5",
                !active && "web:hover:bg-text/5",
              )}
              style={{ borderRadius: radius.sm }}
            >
              <Text variant="small" weight="medium" tone={active ? "default" : "muted"}>
                {item.label}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
