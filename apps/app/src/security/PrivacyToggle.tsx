import { usePrivacyStore, useTheme } from "@wallt/ui";
import { Eye, EyeOff } from "lucide-react-native";
import { Pressable } from "react-native";

/** Eye button for page headers: one tap hides or shows every amount. */
export function PrivacyToggle() {
  const { colors } = useTheme();
  const hidden = usePrivacyStore((s) => s.hidden);
  const toggle = usePrivacyStore((s) => s.toggle);
  const Icon = hidden ? EyeOff : Eye;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hidden ? "Show amounts" : "Hide amounts"}
      accessibilityState={{ selected: hidden }}
      onPress={toggle}
      hitSlop={6}
      className="h-11 w-11 items-center justify-center rounded-md active:bg-text/5 web:cursor-pointer web:outline-none web:hover:bg-text/5 web:focus-visible:bg-text/5"
    >
      <Icon size={20} color={hidden ? colors.text : colors.muted} strokeWidth={1.6} />
    </Pressable>
  );
}
