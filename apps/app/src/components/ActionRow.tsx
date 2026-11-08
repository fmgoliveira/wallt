import { cn, IconTile, Text, useTheme } from "@wallt/ui";
import type { LucideIcon } from "lucide-react-native";
import { ChevronRight } from "lucide-react-native";
import { Pressable, View } from "react-native";

/** One action in a "manage" card: icon tile, label, optional hint. `negative` is for destructive actions. */
export function ActionRow({
  icon: Icon,
  label,
  hint,
  tone = "default",
  divider,
  disabled,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  tone?: "default" | "negative";
  divider?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const negative = tone === "negative";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "min-h-[56px] flex-row rounded-md items-center px-3.5 py-2.5 active:bg-text/5",
        "web:cursor-pointer web:outline-none web:transition-colors web:duration-150 web:hover:bg-text/5 web:focus-visible:bg-text/5",
        disabled && "opacity-50 web:cursor-not-allowed web:hover:bg-transparent",
      )}
    >
      {divider ? (
        <View
          pointerEvents="none"
          className="absolute top-0 right-0 h-px bg-border"
          style={{ left: 62 }}
        />
      ) : null}
      <IconTile className="mr-3">
        <Icon size={18} color={negative ? colors.negative : colors.muted} strokeWidth={1.6} />
      </IconTile>
      <View className="flex-1">
        <Text weight="medium" tone={negative ? "negative" : "default"}>
          {label}
        </Text>
        {hint ? (
          <Text variant="small" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />
    </Pressable>
  );
}
