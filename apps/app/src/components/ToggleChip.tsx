import { Text, useTheme } from "@wallt/ui";
import { Pressable, View } from "react-native";

/** Selectable pill (multi-select lists such as tags, accounts, categories). */
export function ToggleChip({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Resolved colour of the thing the chip stands for (account, category): shown as a dot. */
  color?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="min-h-[36px] flex-row items-center gap-2 rounded-md px-3 web:cursor-pointer web:outline-none"
      style={{
        backgroundColor: selected ? colors.elevated : undefined,
        boxShadow: selected ? `0 0 0 1.5px ${colors.text}` : `0 0 0 1px ${colors.borderStrong}`,
      }}
    >
      {color ? (
        <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: color }} />
      ) : null}
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
