import { useId, useState } from "react";
import { Pressable, View } from "react-native";
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
  placeholder = "Select…",
  options,
  value,
  onChange,
  error,
  className,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const selected = options.find((o) => o.value === value);

  return (
    <View className={cn("gap-1", className)}>
      {label ? (
        <Text variant="caption" tone="muted" nativeID={`${id}-label`}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${selected?.label ?? placeholder}` : undefined}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        className={cn(
          "min-h-touch flex-row items-center justify-between rounded-md border bg-white/50 dark:bg-white/[0.05] web:backdrop-blur-xl px-3 web:cursor-pointer web:hover:bg-white/70 dark:web:hover:bg-white/10",
          error ? "border-negative" : "border-white/70 dark:border-white/15",
        )}
      >
        <Text tone={selected ? "default" : "muted"}>{selected?.label ?? placeholder}</Text>
        <Text tone="muted" accessibilityElementsHidden>
          ▾
        </Text>
      </Pressable>
      {error ? (
        <Text variant="caption" tone="negative">
          {error}
        </Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={label ?? placeholder}>
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
                  "min-h-touch flex-row items-center justify-between rounded-md px-3 web:cursor-pointer web:hover:bg-border/40",
                  active && "bg-accent/10",
                )}
              >
                <View>
                  <Text className={active ? "font-inter-semibold" : undefined}>{o.label}</Text>
                  {o.description ? (
                    <Text variant="caption" tone="muted">
                      {o.description}
                    </Text>
                  ) : null}
                </View>
                {active ? <Text tone="accent">✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}
