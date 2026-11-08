import { cn, Text, useTheme } from "@wallt/ui";
import { type Href, Link } from "expo-router";
import { Pressable, View } from "react-native";
import type { NavItem } from "./nav";

export type NavVariant = "bar" | "rail" | "sidebar" | "sidebar-collapsed";

const layout: Record<NavVariant, string> = {
  bar: "flex-1 items-center justify-center gap-0.5 py-2",
  rail: "w-full items-center justify-center gap-1 rounded-md py-2.5",
  sidebar: "flex-row items-center gap-3 rounded-md px-3 py-2.5",
  "sidebar-collapsed": "w-full items-center justify-center rounded-md py-3",
};

/** One navigation destination. A real link on web (middle-click, URL on hover, Tab + Enter). */
export function NavButton({
  item,
  active,
  variant,
}: {
  item: NavItem;
  active: boolean;
  variant: NavVariant;
}) {
  const { colors } = useTheme();
  const Icon = item.icon;
  const labelled = variant !== "sidebar-collapsed";
  const color = active ? colors.accent : colors.muted;

  return (
    <Link href={item.href as Href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={item.label}
        accessibilityState={{ selected: active }}
        className={cn(
          "min-h-touch web:cursor-pointer web:outline-none web:focus-visible:ring-2 web:focus-visible:ring-accent",
          layout[variant],
          variant !== "bar" && active && "bg-accent/15",
          variant !== "bar" && !active && "web:hover:bg-white/40 dark:web:hover:bg-white/10",
        )}
      >
        <View className={cn(variant === "bar" && active && "rounded-full bg-accent/15 px-4 py-1")}>
          <Icon size={variant === "bar" ? 22 : 20} color={color} strokeWidth={active ? 2.4 : 2} />
        </View>
        {labelled ? (
          <Text
            variant="caption"
            tone={active ? "accent" : "muted"}
            numberOfLines={1}
            className={cn(
              active && "font-inter-semibold",
              variant === "rail" && "text-[11px]",
              variant === "bar" && "text-[11px]",
              variant === "sidebar" && "text-body",
            )}
          >
            {variant === "bar" ? (item.shortLabel ?? item.label) : item.label}
          </Text>
        ) : null}
      </Pressable>
    </Link>
  );
}
