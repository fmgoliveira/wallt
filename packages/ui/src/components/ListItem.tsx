import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { cn, Text } from "./primitives";

export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Leading content, normally an `<IconTile>`. */
  leading?: ReactNode;
  /** Small node before the subtitle, normally a `<CategoryDot>`. */
  subtitleLeading?: ReactNode;
  /** Right-aligned content, normally an `<Amount>`. */
  trailing?: ReactNode;
  onPress?: () => void;
  selected?: boolean;
  /** Inset hairline above the row (pass for every row but the first); starts after the leading tile. */
  divider?: boolean;
  className?: string | undefined;
}

/** 60 px two-line / 48 px one-line row (guidelines §7). */
export function ListItem({
  title,
  subtitle,
  leading,
  subtitleLeading,
  trailing,
  onPress,
  selected,
  divider,
  className,
}: ListItemProps) {
  const body = (
    <>
      {divider ? (
        <View
          pointerEvents="none"
          className="absolute top-0 right-0 h-px bg-border"
          style={{ left: leading ? 62 : 14 }}
        />
      ) : null}
      {leading ? <View className="mr-3">{leading}</View> : null}
      <View className="flex-1">
        <Text weight="medium" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <View className="flex-row items-center gap-1.5">
            {subtitleLeading}
            <Text variant="small" tone="muted" numberOfLines={1} className="flex-shrink">
              {subtitle}
            </Text>
          </View>
        ) : null}
      </View>
      {trailing ? <View className="ml-3 items-end">{trailing}</View> : null}
    </>
  );

  const base = cn(
    "flex-row items-center px-3.5 py-2.5",
    subtitle ? "min-h-[60px]" : "min-h-[48px]",
    selected && "bg-data/10",
    className,
  );

  if (!onPress) return <View className={base}>{body}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      className={cn(
        base,
        "rounded-md web:cursor-pointer web:outline-none web:transition-colors web:duration-150 web:hover:bg-text/5 web:focus-visible:bg-text/5 active:bg-text/5",
      )}
    >
      {body}
    </Pressable>
  );
}
