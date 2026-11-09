import {
  addMonths,
  daysInMonth,
  fromLocalDate,
  isValidDate,
  parseDate,
  startOfMonth,
} from "@wallt/core";
import { useId, useState } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "../theme/context";
import { radius, ringShadow } from "../tokens";
import { useControlHeight } from "./Button";
import { cn, Text } from "./primitives";
import { Sheet } from "./Sheet";

const pad = (n: number) => String(n).padStart(2, "0");

/** Locale text for a `YYYY-MM-DD` calendar date, read as a plain date (never shifted by time zone). */
export function formatCalendarDate(value: string, long = false): string {
  if (!isValidDate(value)) return "";
  const { year, month, day } = parseDate(value);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: long ? "long" : "short",
    day: "numeric",
    month: long ? "long" : "short",
    year: "numeric",
  });
}

export interface DatePickerProps {
  label?: string | undefined;
  /** `YYYY-MM-DD`, or empty for none. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Show a "Clear" action (for optional dates such as a range bound). */
  clearable?: boolean;
  error?: string | undefined;
  className?: string | undefined;
}

/** Calendar grid for one month; Monday first. */
function MonthGrid({
  month,
  selected,
  today,
  onPick,
}: {
  month: string;
  selected: string;
  today: string;
  onPick: (date: string) => void;
}) {
  const { colors } = useTheme();
  const { year, month: m } = parseDate(month);
  const total = daysInMonth(year, m);
  // getUTCDay: 0 = Sunday. Shift so Monday is column 0.
  const lead = (new Date(Date.UTC(year, m - 1, 1)).getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));

  return (
    <View accessibilityRole="grid">
      {weeks.map((week, w) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: weeks are positional
        <View key={w} className="flex-row">
          {week.map((day, i) => {
            if (day === null) {
              // biome-ignore lint/suspicious/noArrayIndexKey: empty padding cells are positional
              return <View key={i} className="h-11 flex-1" />;
            }
            const date = `${String(year).padStart(4, "0")}-${pad(m)}-${pad(day)}`;
            const isSelected = date === selected;
            const isToday = date === today;
            return (
              <Pressable
                key={date}
                accessibilityRole="button"
                accessibilityLabel={formatCalendarDate(date, true)}
                accessibilityState={{ selected: isSelected }}
                onPress={() => onPick(date)}
                className="h-11 flex-1 items-center justify-center web:cursor-pointer web:outline-none"
              >
                <View
                  className={cn(
                    "h-10 w-10 items-center justify-center",
                    !isSelected && "web:hover:bg-text/5",
                  )}
                  style={{
                    borderRadius: radius.full,
                    backgroundColor: isSelected ? colors.text : undefined,
                    boxShadow:
                      !isSelected && isToday ? `0 0 0 1.5px ${colors.borderStrong}` : undefined,
                  }}
                >
                  <Text
                    tabular
                    weight={isSelected || isToday ? "semibold" : "regular"}
                    style={isSelected ? { color: colors.bg } : undefined}
                  >
                    {day}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function weekdayLabels(): string[] {
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" }),
  );
}

/**
 * Date field that opens a calendar (bottom sheet on phone, dialog on desktop). Value is a `YYYY-MM-DD`
 * calendar date; no free text, so it can never be malformed.
 */
export function DatePicker({
  label,
  value,
  onChange,
  placeholder = "Pick a date",
  clearable,
  error,
  className,
}: DatePickerProps) {
  const { scheme, colors } = useTheme();
  const height = useControlHeight();
  const id = useId();
  const [open, setOpen] = useState(false);
  const today = fromLocalDate(new Date());
  const [month, setMonth] = useState(startOfMonth(isValidDate(value) ? value : today));

  const show = () => {
    setMonth(startOfMonth(isValidDate(value) ? value : today));
    setOpen(true);
  };
  const pick = (date: string) => {
    onChange(date);
    setOpen(false);
  };
  const title = new Date(parseDate(month).year, parseDate(month).month - 1, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );

  const nav = (delta: number, name: string) => {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={name}
        onPress={() => setMonth(addMonths(month, delta))}
        className="h-11 w-11 items-center justify-center rounded-md web:cursor-pointer web:outline-none web:hover:bg-text/5"
      >
        <Text variant="title" accessibilityElementsHidden>
          {delta < 0 ? "‹" : "›"}
        </Text>
      </Pressable>
    );
  };

  return (
    <View className={cn("gap-1.5", className)}>
      {label ? (
        <Text variant="small" tone="muted" weight="medium" nativeID={`${id}-label`}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          label ? `${label}: ${formatCalendarDate(value) || placeholder}` : undefined
        }
        accessibilityState={{ expanded: open }}
        onPress={show}
        className="flex-row items-center justify-between px-3 web:cursor-pointer web:outline-none web:transition-shadow web:duration-150"
        style={{
          minHeight: height,
          borderRadius: radius.md,
          backgroundColor: scheme === "dark" ? colors.bg : colors.surface,
          boxShadow: ringShadow(colors, error ? "error" : open ? "focus" : "default"),
        }}
      >
        <Text tone={value ? "default" : "subtle"}>{formatCalendarDate(value) || placeholder}</Text>
        <Text tone="subtle" accessibilityElementsHidden>
          ▾
        </Text>
      </Pressable>
      {error ? (
        <Text variant="small" tone="negative">
          {error}
        </Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? placeholder}>
        <View className="flex-row items-center justify-between">
          {nav(-1, "Previous month")}
          <Text weight="semibold" accessibilityRole="header">
            {title}
          </Text>
          {nav(1, "Next month")}
        </View>
        <View className="flex-row">
          {weekdayLabels().map((d, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed seven columns
            <View key={i} className="flex-1 items-center py-1">
              <Text variant="small" tone="subtle">
                {d}
              </Text>
            </View>
          ))}
        </View>
        <MonthGrid month={month} selected={value} today={today} onPick={pick} />
        <View className="flex-row justify-between pt-1">
          <Pressable
            accessibilityRole="button"
            onPress={() => pick(today)}
            className="min-h-touch justify-center px-1 web:cursor-pointer web:outline-none web:hover:opacity-70"
          >
            <Text weight="medium" tone="muted">
              Today
            </Text>
          </Pressable>
          {clearable && value ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => pick("")}
              className="min-h-touch justify-center px-1 web:cursor-pointer web:outline-none web:hover:opacity-70"
            >
              <Text weight="medium" tone="muted">
                Clear
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}
