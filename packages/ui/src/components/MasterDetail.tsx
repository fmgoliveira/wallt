import type { ReactNode } from "react";
import { View } from "react-native";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { Card } from "./Card";
import { Text } from "./primitives";
import { Sheet } from "./Sheet";

export interface MasterDetailProps {
  list: ReactNode;
  /** Detail content for the selected item; `null` when nothing is selected. */
  detail: ReactNode | null;
  detailTitle?: string;
  /** Shown in the side panel when nothing is selected (desktop only). */
  placeholder?: ReactNode;
  onCloseDetail: () => void;
}

/**
 * Plan §9.2: desktop shows list + detail side panel; phone/tablet show the list and open the detail in a
 * sheet. Selection state lives in the caller (ideally the URL).
 */
export function MasterDetail({
  list,
  detail,
  detailTitle,
  placeholder,
  onCloseDetail,
}: MasterDetailProps) {
  const desktop = useBreakpoint() === "desktop";

  if (!desktop) {
    return (
      <View>
        {list}
        <Sheet visible={detail !== null} onClose={onCloseDetail} title={detailTitle}>
          {detail}
        </Sheet>
      </View>
    );
  }

  return (
    <View className="flex-row items-start gap-6">
      <View className="flex-1">{list}</View>
      <Card className="w-[400px] gap-3">
        {detail !== null && detailTitle ? <Text variant="title">{detailTitle}</Text> : null}
        {detail ?? placeholder}
      </Card>
    </View>
  );
}
