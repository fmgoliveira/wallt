import type { ReactNode } from "react";
import { Platform, View } from "react-native";
import { useTheme } from "../theme/context";
import { type CategoryColorName, categoryPalette, onHero, radius, withAlpha } from "../tokens";
import { cn, Text } from "./primitives";

/** Keyboard hint (`N`, `⌘K`). Web only: renders nothing on native. */
export function Kbd({ children, onAccent }: { children: string; onAccent?: boolean }) {
  const { colors } = useTheme();
  if (Platform.OS !== "web") return null;
  return (
    <View
      style={{
        borderRadius: 4,
        paddingHorizontal: 5,
        paddingVertical: 1,
        backgroundColor: withAlpha(
          onAccent ? colors.accentFg : colors.text,
          onAccent ? 0.16 : 0.07,
        ),
      }}
    >
      <Text
        variant="label"
        tone={onAccent ? "onAccent" : "muted"}
        className="normal-case"
        style={{ opacity: onAccent ? 0.8 : 1 }}
      >
        {children}
      </Text>
    </View>
  );
}

export type ChipTone = "neutral" | "positive" | "negative" | "warning";

const chipText: Record<ChipTone, "muted" | "positive" | "negative" | "warning"> = {
  neutral: "muted",
  positive: "positive",
  negative: "negative",
  warning: "warning",
};

/** Status chip (the only pill-ish element): `tone/12` fill, tone text. */
export function Chip({
  tone = "neutral",
  label,
  onHero: onHeroSurface,
}: {
  tone?: ChipTone;
  label: string;
  /** On the hero gradient: uses the hero's own fill and light-green text. */
  onHero?: boolean;
}) {
  const { colors } = useTheme();
  const base = tone === "neutral" ? colors.text : colors[tone];
  return (
    <View
      className="flex-row items-center gap-1 self-start px-2 py-0.5"
      style={{
        borderRadius: radius.sm,
        backgroundColor: onHeroSurface
          ? onHero.positiveFill
          : withAlpha(base, tone === "neutral" ? 0.07 : 0.12),
      }}
    >
      <Text
        variant="small"
        tone={onHeroSurface ? "onHero" : chipText[tone]}
        weight="medium"
        style={onHeroSurface ? { color: onHero.positive } : undefined}
      >
        {label}
      </Text>
    </View>
  );
}

/** 36 px neutral icon tile (`elevated` + hairline + highlight). Category colour never fills it. */
export function IconTile({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  const { scheme, colors } = useTheme();
  return (
    <View
      className={cn("items-center justify-center", className)}
      style={{
        width: 36,
        height: 36,
        borderRadius: radius.md,
        backgroundColor: colors.elevated,
        boxShadow: `0 0 0 1px ${colors.border}, inset 0 1px 0 ${
          scheme === "light" ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.06)"
        }`,
      }}
    >
      {children}
    </View>
  );
}

/** 6 px rounded-square category dot (or chart segment colour). */
export function CategoryDot({ color }: { color: CategoryColorName }) {
  const { scheme } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      style={{
        width: 6,
        height: 6,
        borderRadius: 2,
        backgroundColor: categoryPalette[color][scheme],
      }}
    />
  );
}
