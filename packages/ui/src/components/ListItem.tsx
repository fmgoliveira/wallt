import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { cn, Text } from "./primitives";

export interface ListItemProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  /** Right-aligned content, typically an amount. */
  trailing?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  divider?: boolean;
  className?: string | undefined;
}

export function ListItem({
  title,
  subtitle,
  leading,
  trailing,
  onPress,
  selected,
  divider,
  className,
}: ListItemProps) {
  const body = (
    <>
      {leading ? <View className="mr-3">{leading}</View> : null}
      <View className="flex-1">
        <Text numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text variant="small" tone="muted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View className="ml-3 items-end">{trailing}</View> : null}
    </>
  );

  const base = cn(
    "min-h-[56px] flex-row items-center px-4 py-2",
    divider && "border-b border-border",
    selected && "bg-accent/10",
    className,
  );

  if (!onPress) return <View className={base}>{body}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      className={cn(base, "web:cursor-pointer web:hover:bg-border/40 active:bg-border/40")}
    >
      {body}
    </Pressable>
  );
}
