import { Portal, Text, useTheme } from "@wallt/ui";
import { useEffect } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import { useTranslation } from "../i18n";

export interface MenuItem {
  label: string;
  onPress: () => void;
  negative?: boolean;
}

/** Right-click menu at a screen position (web). Closes on any outside click, scroll or Escape. */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Keep the menu inside the window.
  const width = 200;
  const left = Math.min(x, (typeof window === "undefined" ? x : window.innerWidth) - width - 8);
  const top = Math.min(
    y,
    (typeof window === "undefined" ? y : window.innerHeight) - items.length * 40 - 16,
  );
  const fixed = { position: "fixed", left, top, width } as unknown as ViewStyle;
  const scrim = { position: "fixed", left: 0, top: 0, right: 0, bottom: 0 } as unknown as ViewStyle;

  return (
    <Portal>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("transactions.menu.close")}
        onPress={onClose}
        style={scrim}
      />
      <View
        role="menu"
        style={[
          fixed,
          {
            padding: 4,
            borderRadius: 12,
            backgroundColor: colors.elevated,
            boxShadow: `0 12px 32px -8px rgba(0,0,0,0.5), 0 0 0 1px ${colors.borderStrong}`,
          },
        ]}
      >
        {items.map((item) => (
          <Pressable
            key={item.label}
            role="menuitem"
            onPress={() => {
              onClose();
              item.onPress();
            }}
            className="min-h-[36px] justify-center rounded-md px-3 web:cursor-pointer web:outline-none web:hover:bg-text/5 web:focus-visible:bg-text/5"
          >
            <Text tone={item.negative ? "negative" : "default"}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </Portal>
  );
}
