import { PIN_MAX, PIN_MIN } from "@wallt/core";
import { Text, useTheme } from "@wallt/ui";
import { Check, Delete } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useTranslation } from "../i18n";

function PadKey({
  label,
  hint,
  disabled,
  onPress,
  children,
}: {
  label?: string;
  hint?: string;
  disabled?: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint ?? label}
      disabled={disabled}
      onPress={onPress}
      className="h-16 flex-1 items-center justify-center rounded-lg active:opacity-60 web:cursor-pointer web:outline-none web:hover:bg-text/5"
      style={{ opacity: disabled ? 0.35 : 1 }}
    >
      {children ?? (
        <Text variant="heading" tabular>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Dots for the digits typed so far, then a number pad. Variable length (4 to 8): confirm with the check key. */
export function PinPad({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const add = (d: string) => value.length < PIN_MAX && onChange(value + d);
  const rows = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
  ];
  return (
    <View className="gap-6">
      <View
        className="h-6 flex-row items-center justify-center gap-3"
        accessibilityLabel={t("security.pad.digitsEntered", { count: value.length })}
      >
        {Array.from({ length: Math.max(value.length, PIN_MIN) }, (_, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: dots are positional
            key={i}
            style={{
              width: 12,
              height: 12,
              borderRadius: 6,
              backgroundColor: i < value.length ? colors.text : undefined,
              boxShadow: i < value.length ? undefined : `0 0 0 1.5px ${colors.borderStrong}`,
            }}
          />
        ))}
      </View>
      <View className="gap-1">
        {rows.map((row) => (
          <View key={row.join("")} className="flex-row gap-1">
            {row.map((d) => (
              <PadKey key={d} label={d} disabled={disabled} onPress={() => add(d)} />
            ))}
          </View>
        ))}
        <View className="flex-row gap-1">
          <PadKey
            hint={t("security.pad.delete")}
            disabled={disabled || value.length === 0}
            onPress={() => onChange(value.slice(0, -1))}
          >
            <Delete size={22} color={colors.text} strokeWidth={1.6} />
          </PadKey>
          <PadKey label="0" disabled={disabled} onPress={() => add("0")} />
          <PadKey
            hint={t("security.pad.confirm")}
            disabled={disabled || value.length < PIN_MIN}
            onPress={onSubmit}
          >
            <Check size={24} color={colors.text} strokeWidth={2} />
          </PadKey>
        </View>
      </View>
    </View>
  );
}
