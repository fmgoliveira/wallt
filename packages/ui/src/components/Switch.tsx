import { Pressable, View } from "react-native";
import { useTheme } from "../theme/context";
import { radius } from "../tokens";
import { cn, Text } from "./primitives";

export interface SwitchProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  /** Label on the left; the whole row is the hit target. */
  label: string;
  description?: string | undefined;
  disabled?: boolean;
  className?: string | undefined;
}

/** Settings-style row: label (and optional description) on the left, toggle on the right. */
export function Switch({
  value,
  onValueChange,
  label,
  description,
  disabled,
  className,
}: SwitchProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      className={cn(
        "min-h-touch flex-row items-center justify-between gap-3 web:cursor-pointer web:outline-none",
        disabled && "opacity-50",
        className,
      )}
    >
      <View className="flex-1">
        <Text weight="medium">{label}</Text>
        {description ? (
          <Text variant="small" tone="muted">
            {description}
          </Text>
        ) : null}
      </View>
      <View
        className="web:transition-colors web:duration-150"
        style={{
          width: 44,
          height: 26,
          borderRadius: radius.full,
          padding: 3,
          justifyContent: "center",
          alignItems: value ? "flex-end" : "flex-start",
          backgroundColor: value ? colors.text : colors.borderStrong,
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: radius.full,
            backgroundColor: value ? colors.bg : colors.muted,
          }}
        />
      </View>
    </Pressable>
  );
}
