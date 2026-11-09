import { Text, useTheme } from "@wallt/ui";
import { Delete } from "lucide-react-native";
import { Pressable, View } from "react-native";

const MAX = 99_999_999_999; // 11 digits of minor units: far above any real balance, far below 2^53

/** Append digits ATM-style: every key press shifts the amount left, so cents are never typed with a decimal mark. */
export function pressDigits(value: number, digits: string): number {
  let next = value;
  for (const d of digits) {
    const candidate = next * 10 + Number(d);
    if (candidate > MAX) return next;
    next = candidate;
  }
  return next;
}

export const backspace = (value: number): number => Math.floor(value / 10);

function Key({
  label,
  hint,
  onPress,
  children,
}: {
  label: string;
  hint?: string;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ?? label}
      onPress={onPress}
      className="h-14 flex-1 items-center justify-center rounded-lg active:opacity-60 web:cursor-pointer web:outline-none web:transition-colors web:duration-100 web:hover:bg-text/5"
      style={{ backgroundColor: undefined, borderColor: colors.border }}
    >
      {children ?? (
        <Text variant="heading" tabular>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Numeric pad for the amount step: big keys, no system keyboard. */
export function AmountKeypad({
  value,
  onChange,
  hundreds = true,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Show the "00" key (hidden for currencies without decimals). */
  hundreds?: boolean;
}) {
  const { colors } = useTheme();
  const rows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
  ];
  return (
    <View className="gap-1">
      {rows.map((row) => (
        <View key={row.join("")} className="flex-row gap-1">
          {row.map((d) => (
            <Key key={d} label={d} onPress={() => onChange(pressDigits(value, d))} />
          ))}
        </View>
      ))}
      <View className="flex-row gap-1">
        {hundreds ? (
          <Key label="00" onPress={() => onChange(pressDigits(value, "00"))} />
        ) : (
          <View className="flex-1" />
        )}
        <Key label="0" onPress={() => onChange(pressDigits(value, "0"))} />
        <Key label="⌫" hint="Delete" onPress={() => onChange(backspace(value))}>
          <Delete size={22} color={colors.text} strokeWidth={1.6} />
        </Key>
      </View>
    </View>
  );
}
