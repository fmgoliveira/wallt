import { useTheme } from "@wallt/ui";
import type { LucideIcon } from "lucide-react-native";

/** Line icon for placeholder empty states (stroke 1.6, `muted`, never coloured). */
export function placeholderIcon(Icon: LucideIcon) {
  return <PlaceholderIcon Icon={Icon} />;
}

function PlaceholderIcon({ Icon }: { Icon: LucideIcon }) {
  const { colors } = useTheme();
  return <Icon size={20} color={colors.muted} strokeWidth={1.6} />;
}
