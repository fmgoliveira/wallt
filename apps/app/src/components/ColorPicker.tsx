import { categoryPalette, Text, useTheme } from "@wallt/ui";
import { Pressable, View } from "react-native";
import { useTranslation } from "../i18n";
import { paletteHex, paletteName, paletteNames } from "./colors";

/** Radio group of the curated palette plus "no colour". `value` is the stored hex. */
export function ColorPicker({
  label,
  value,
  onChange,
}: {
  label?: string;
  value: string | null;
  onChange: (hex: string | null) => void;
}) {
  const { scheme, colors } = useTheme();
  const { t } = useTranslation();
  const ring = (selected: boolean) =>
    selected
      ? `0 0 0 2px ${colors.bg}, 0 0 0 3.5px ${colors.text}`
      : `0 0 0 1px ${colors.borderStrong}`;
  const current = paletteName(value);
  return (
    <View className="gap-1.5">
      <Text variant="small" tone="muted" weight="medium">
        {label ?? t("common.colorPicker.colour")}
      </Text>
      <View className="flex-row flex-wrap" accessibilityRole="radiogroup">
        <Pressable
          accessibilityRole="radio"
          accessibilityLabel={t("common.colorPicker.noColour")}
          accessibilityState={{ checked: value === null }}
          onPress={() => onChange(null)}
          className="h-11 w-11 items-center justify-center web:cursor-pointer web:outline-none"
        >
          <View className="h-6 w-6 rounded-sm" style={{ boxShadow: ring(value === null) }} />
        </Pressable>
        {paletteNames.map((n) => {
          const selected = current === n;
          return (
            <Pressable
              key={n}
              accessibilityRole="radio"
              accessibilityLabel={n}
              accessibilityState={{ checked: selected }}
              onPress={() => onChange(paletteHex(n))}
              className="h-11 w-11 items-center justify-center web:cursor-pointer web:outline-none"
            >
              <View
                className="h-6 w-6 rounded-sm"
                style={{
                  backgroundColor: categoryPalette[n][scheme],
                  boxShadow: selected ? ring(true) : undefined,
                }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
