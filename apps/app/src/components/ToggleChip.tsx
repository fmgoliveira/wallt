import { Text, useTheme } from "@wallt/ui";
import { Pressable } from "react-native";

/** Selectable pill (multi-select lists such as tags, accounts, categories). */
export function ToggleChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="min-h-[36px] justify-center rounded-md px-3 web:cursor-pointer web:outline-none"
      style={{
        backgroundColor: selected ? colors.elevated : undefined,
        boxShadow: selected ? `0 0 0 1.5px ${colors.text}` : `0 0 0 1px ${colors.borderStrong}`,
      }}
    >
      <Text
        variant="small"
        weight={selected ? "medium" : "regular"}
        tone={selected ? "default" : "muted"}
      >
        {label}
      </Text>
    </Pressable>
  );
}
