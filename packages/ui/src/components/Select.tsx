import { useId, useState } from "react";
import { Pressable, View } from "react-native";
import { useUiStrings } from "../strings";
import { useTheme } from "../theme/context";
import { radius, ringShadow } from "../tokens";
import { useControlHeight } from "./Button";
import { cn, Text } from "./primitives";
import { Sheet } from "./Sheet";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Optional secondary text, e.g. an account type. */
  description?: string;
}

export interface SelectProps<T extends string> {
  label?: string | undefined;
  placeholder?: string;
  options: readonly SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | undefined;
  className?: string | undefined;
}

/** Tap-to-open picker: options appear in a bottom sheet (phone) or dialog (desktop). */
export function Select<T extends string>({
  label,
  placeholder,
  options,
  value,
  onChange,
  error,
  className,
}: SelectProps<T>) {
  const { scheme, colors } = useTheme();
  const ui = useUiStrings();
  const shownPlaceholder = placeholder ?? ui.selectPlaceholder;
  const height = useControlHeight();
  const [open, setOpen] = useState(false);
  const id = useId();
  const selected = options.find((o) => o.value === value);

  return (
    <View className={cn("gap-1.5", className)}>
      {label ? (
        <Text variant="small" tone="muted" weight="medium" nativeID={`${id}-label`}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${selected?.label ?? shownPlaceholder}` : undefined}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className="flex-row items-center justify-between px-3 web:cursor-pointer web:outline-none web:transition-shadow web:duration-150"
        style={{
          minHeight: height,
          borderRadius: radius.md,
          backgroundColor: scheme === "dark" ? colors.bg : colors.surface,
          boxShadow: ringShadow(colors, error ? "error" : open ? "focus" : "default"),
        }}
      >
        <Text tone={selected ? "default" : "subtle"}>{selected?.label ?? shownPlaceholder}</Text>
        <Text tone="subtle" accessibilityElementsHidden>
          ▾
        </Text>
      </Pressable>
      {error ? (
        <Text variant="small" tone="negative">
          {error}
        </Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? shownPlaceholder}>
        <View accessibilityRole="radiogroup" className="gap-1">
          {options.map((o) => {
            const active = o.value === value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "min-h-touch flex-row items-center justify-between rounded-md px-3 web:cursor-pointer web:transition-colors web:duration-150 web:hover:bg-text/5",
                  active && "bg-data/10",
                )}
              >
                <View>
                  <Text weight={active ? "semibold" : "medium"}>{o.label}</Text>
                  {o.description ? (
                    <Text variant="small" tone="muted">
                      {o.description}
                    </Text>
                  ) : null}
                </View>
                {active ? <Text tone="data">✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}
