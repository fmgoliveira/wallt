import { useTheme } from "@wallt/ui";
import type { LucideIcon } from "lucide-react-native";

/** Accent-coloured icon for placeholder empty states. */
export function placeholderIcon(Icon: LucideIcon) {
  return <PlaceholderIcon Icon={Icon} />;
}

function PlaceholderIcon({ Icon }: { Icon: LucideIcon }) {
  const { colors } = useTheme();
  return <Icon size={28} color={colors.accent} />;
}
