import { Pressable, View } from "react-native";
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

/** Segmented-style tabs for in-screen switching (not the app navigation, see P2.2). */
export function Tabs<T extends string>({ items, value, onChange, className }: TabsProps<T>) {
  return (
    <View
      accessibilityRole="tablist"
      className={cn("flex-row gap-1 self-start rounded-md bg-border/50 p-1", className)}
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
              "min-h-[36px] min-w-touch items-center justify-center rounded-sm px-4 web:cursor-pointer",
              active ? "bg-surface shadow-e1" : "web:hover:bg-border/60",
            )}
          >
            <Text
              variant="small"
              tone={active ? "default" : "muted"}
              className={active ? "font-inter-semibold" : "font-inter-medium"}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
