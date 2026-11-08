import type { NumberLocale } from "@wallt/core";
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "react-native-reanimated";
import { amountParts } from "../format";
import { usePrivacyStore } from "../privacy/store";
import { useTheme } from "../theme/context";
import { motion, onHero, withAlpha } from "../tokens";
import { Text, type TextVariant } from "./primitives";

export type AmountTone = "auto" | "text" | "onHero" | "muted";

export interface AmountProps {
  /** Integer minor units (cents). Negative = outflow. */
  value: number;
  currency?: string;
  locale?: NumberLocale;
  size?: Exclude<TextVariant, "label">;
  /**
   * `auto`: income in `positive` with `+`, expenses in `text` with `−` (guidelines §2.2).
   * Use `text` for balances that are not income/expense; `onHero` on the hero gradient.
   */
  tone?: AmountTone;
  /** Animate to new values over 500 ms (skipped with reduce motion). */
  ticker?: boolean;
  /** Override the global privacy mode. */
  hidden?: boolean;
  className?: string | undefined;
}

/**
 * Display-only count-up for the ticker. Money is never computed from this: it only decides which whole
 * minor-unit value to show on each frame; the final frame is always the exact `target`.
 */
function useTickerValue(target: number, enabled: boolean): number {
  const [shown, setShown] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    if (!enabled || from.current === target) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = Date.now();
    const a = from.current;
    let raf = 0;
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / motion.duration.ticker);
      const eased = 1 - (1 - t) ** 3;
      setShown(t >= 1 ? target : Math.round(a + (target - a) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, enabled]);

  return shown;
}

/**
 * Money, per guidelines §5.1: tabular, integer in the text colour, decimals dimmed, `−`/`+` signs,
 * privacy mode as `••••`. Formatting is `@wallt/core`'s `formatAmount`; this only slices and styles it.
 */
export function Amount({
  value,
  currency = "EUR",
  locale = "pt",
  size = "body",
  tone = "auto",
  ticker,
  hidden,
  className,
}: AmountProps) {
  const { colors } = useTheme();
  const privacy = usePrivacyStore((s) => s.hidden);
  const reduce = useReducedMotion();
  const shown = useTickerValue(value, !!ticker && !reduce);

  const income = tone === "auto" && value > 0;
  const parts = amountParts(shown, currency, locale, income);
  const main =
    tone === "onHero"
      ? onHero.text
      : tone === "muted"
        ? colors.muted
        : income
          ? colors.positive
          : colors.text;
  const dim =
    tone === "onHero" ? onHero.subtle : income ? withAlpha(colors.positive, 0.6) : colors.subtle;

  if (hidden ?? privacy) {
    return (
      <Text
        variant={size}
        tabular
        weight="semibold"
        accessibilityLabel="Hidden amount"
        className={className}
        style={{ color: main }}
      >
        ••••
      </Text>
    );
  }

  const symbol = parts.symbol;
  const label = `${parts.sign}${parts.integer}${parts.decimals} ${symbol}`.trim();
  return (
    <Text
      variant={size}
      tabular
      weight={size === "body" || size === "small" ? "medium" : "semibold"}
      accessibilityLabel={label}
      className={className}
      style={{ color: main }}
    >
      {parts.sign}
      {parts.symbolFirst ? symbol : null}
      {parts.integer}
      <Text variant={size} tabular style={{ color: dim }}>
        {parts.decimals}
      </Text>
      {parts.symbolFirst ? null : ` ${symbol}`}
    </Text>
  );
}
