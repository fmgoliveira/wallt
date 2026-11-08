import { useId, useState } from "react";
import { TextInput, type TextInputProps, View } from "react-native";
import { useTheme } from "../theme/context";
import { fontFamily, radius, ringShadow, typeScale } from "../tokens";
import { useControlHeight } from "./Button";
import { cn, Text } from "./primitives";

export interface InputProps extends Omit<TextInputProps, "style"> {
  label?: string | undefined;
  helper?: string | undefined;
  error?: string | undefined;
  className?: string | undefined;
}

export function Input({ label, helper, error, className, onFocus, onBlur, ...rest }: InputProps) {
  const { scheme, colors } = useTheme();
  const height = useControlHeight();
  const [focused, setFocused] = useState(false);
  const id = useId();

  return (
    <View className={cn("gap-1.5", className)}>
      {label ? (
        <Text variant="small" tone="muted" weight="medium" nativeID={`${id}-label`}>
          {label}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        accessibilityLabelledBy={label ? `${id}-label` : undefined}
        accessibilityHint={error ?? helper}
        placeholderTextColor={colors.subtle}
        selectionColor={colors.data}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className="web:outline-none web:transition-shadow web:duration-150"
        style={{
          minHeight: height,
          paddingHorizontal: 12,
          borderRadius: radius.md,
          // Dark inputs sit on `bg` (inset look); light inputs on `surface`.
          backgroundColor: scheme === "dark" ? colors.bg : colors.surface,
          color: colors.text,
          fontFamily: fontFamily.regular,
          fontSize: typeScale.body.size,
          boxShadow: ringShadow(colors, error ? "error" : focused ? "focus" : "default"),
        }}
        {...rest}
      />
      {error ? (
        <Text variant="small" tone="negative">
          {error}
        </Text>
      ) : helper ? (
        <Text variant="small" tone="muted">
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
