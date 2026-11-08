import { Pressable, View } from "react-native";
import { useTheme } from "../theme/context";
import { controlShadow, radius } from "../tokens";
import { cn, Text } from "./primitives";

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
 * segment is `elevated` with the depth recipe so it looks raised.
 */
export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  const { colors, scheme } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      className={cn("flex-row gap-0.5 self-start bg-text/5 p-[3px]", className)}
      style={{ borderRadius: radius.md }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <Pressable
            key={item.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(item.value)}
            className={cn(
              "min-h-[34px] min-w-touch items-center justify-center px-4 web:cursor-pointer web:outline-none web:focus-visible:bg-text/5",
              !active && "web:hover:bg-text/5",
            )}
            style={{
              borderRadius: radius.sm,
              backgroundColor: active ? colors.elevated : undefined,
              boxShadow: active
                ? `0 0 0 1px ${colors.border}, ${controlShadow(scheme)}`
                : undefined,
            }}
          >
            <Text variant="small" weight="medium" tone={active ? "default" : "muted"}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
