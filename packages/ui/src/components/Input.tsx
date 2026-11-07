import { useId, useState } from "react";
import { TextInput, type TextInputProps, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { cn, Text } from "./primitives";

export interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string | undefined;
  helper?: string | undefined;
  error?: string | undefined;
  className?: string | undefined;
}

export function Input({ label, helper, error, className, onFocus, onBlur, ...rest }: InputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const id = useId();

  return (
    <View className={cn("gap-1", className)}>
      {label ? (
        <Text variant="caption" tone="muted" nativeID={`${id}-label`}>
          {label}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        accessibilityLabelledBy={label ? `${id}-label` : undefined}
        accessibilityHint={error ?? helper}
        placeholderTextColor={colors.muted}
        selectionColor={colors.accent}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className={cn(
          "min-h-touch rounded-md border bg-surface/70 px-3 font-sans text-body text-text web:outline-none",
          error ? "border-negative" : focused ? "border-accent" : "border-border",
          focused && "web:ring-2 web:ring-accent/30",
        )}
        {...rest}
      />
      {error ? (
        <Text variant="caption" tone="negative">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="caption" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
