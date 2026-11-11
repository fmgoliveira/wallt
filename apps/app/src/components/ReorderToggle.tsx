import { Text, useTheme } from "@wallt/ui";
import { ArrowUpDown, Check } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useTranslation } from "../i18n";

/** Header of a reorderable list: a caption on the left, a quiet Reorder / Done link on the right. */
export function ListHeader({
  title,
  sorting,
  onToggle,
  canReorder = true,
}: {
  title: string;
  sorting: boolean;
  onToggle: () => void;
  canReorder?: boolean;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const Icon = sorting ? Check : ArrowUpDown;
  return (
    <View className="min-h-touch flex-row items-center justify-between gap-3">
      <Text variant="label" tone="muted">
        {title}
      </Text>
      {canReorder ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sorting ? t("common.reorder.doneLabel") : t("common.reorder.reorder")}
          onPress={onToggle}
          hitSlop={8}
          className="flex-row items-center gap-1.5 px-1 py-2 web:cursor-pointer web:outline-none web:hover:opacity-70 web:focus-visible:underline active:opacity-60"
        >
          <Icon size={14} color={colors.muted} strokeWidth={1.8} />
          <Text variant="small" tone="muted" weight="medium">
            {sorting ? t("common.reorder.done") : t("common.reorder.reorder")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
