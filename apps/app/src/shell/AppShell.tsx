import { cn, glass, glassOverlay, Text, toast, useBreakpoint, useTheme } from "@wallt/ui";
import { usePathname } from "expo-router";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react-native";
import { type ReactNode, useEffect } from "react";
import { Image, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavButton } from "./NavButton";
import { isActive, phoneItems, wideItems } from "./nav";
import { hydrateShellStore, useShellStore } from "./store";

const icon = require("../../assets/icon.png");

/** Placeholder until the transaction editor exists (P2.6). */
function addTransaction() {
  toast.show("Add transaction arrives with P2.6");
}

function useAddShortcut() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        addTransaction();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

function Brand({ showName }: { showName: boolean }) {
  return (
    <View className={cn("flex-row items-center gap-3", !showName && "justify-center")}>
      <View className="h-10 w-10 items-center justify-center rounded-md bg-white/70 dark:bg-white/20">
        <Image
          source={icon}
          style={{ width: 32, height: 32 }}
          resizeMode="contain"
          accessibilityLabel="Wallt"
        />
      </View>
      {showName ? <Text variant="title">Wallt</Text> : null}
    </View>
  );
}

function AddButton({ compact }: { compact: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add transaction"
      onPress={addTransaction}
      className={cn(
        "min-h-touch flex-row items-center justify-center gap-2 rounded-md bg-accent web:cursor-pointer web:outline-none web:hover:opacity-90 web:focus-visible:ring-2 web:focus-visible:ring-accent/60",
        compact ? "w-full" : "px-4",
      )}
    >
      <Plus size={20} color={colors.accentFg} strokeWidth={2.4} />
      {compact ? null : (
        <Text tone="onAccent" className="font-inter-semibold">
          Add transaction
        </Text>
      )}
    </Pressable>
  );
}

function SideNav({ wide }: { wide: boolean }) {
  const pathname = usePathname();
  const { colors } = useTheme();
  const collapsed = useShellStore((s) => s.collapsed);
  const toggle = useShellStore((s) => s.toggleCollapsed);
  const expanded = wide && !collapsed;
  const Toggle = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <View
      role="navigation"
      aria-label="Main"
      className={cn(
        "my-3 ml-3 gap-4 rounded-lg p-2",
        glass,
        expanded ? "w-[232px]" : wide ? "w-[76px]" : "w-[92px]",
      )}
    >
      <View className="px-1 pt-2">
        <Brand showName={expanded} />
      </View>
      <View className="gap-1">
        {wideItems.map((item) => (
          <NavButton
            key={item.key}
            item={item}
            active={isActive(item, pathname)}
            variant={expanded ? "sidebar" : wide ? "sidebar-collapsed" : "rail"}
          />
        ))}
      </View>
      <View className="flex-1" />
      <AddButton compact={!expanded} />
      {wide ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onPress={toggle}
          className="min-h-touch items-center justify-center rounded-md web:cursor-pointer web:outline-none web:hover:bg-white/40 dark:web:hover:bg-white/10 web:focus-visible:ring-2 web:focus-visible:ring-accent"
        >
          <Toggle size={20} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

function BottomBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={addTransaction}
        style={{ bottom: 76 + Math.max(insets.bottom, 8) + 8 }}
        className="absolute right-4 z-40 h-14 w-14 items-center justify-center rounded-full bg-accent shadow-e3 web:cursor-pointer web:outline-none web:hover:opacity-90 web:focus-visible:ring-2 web:focus-visible:ring-accent/60"
      >
        <Plus size={26} color={colors.accentFg} strokeWidth={2.4} />
      </Pressable>
      <View
        role="navigation"
        aria-label="Main"
        style={{ marginBottom: Math.max(insets.bottom, 8) }}
        className={cn("mx-3 h-[68px] flex-row rounded-lg px-1", glassOverlay)}
      >
        {phoneItems.map((item) => (
          <NavButton key={item.key} item={item} active={isActive(item, pathname)} variant="bar" />
        ))}
      </View>
    </>
  );
}

/**
 * Responsive shell (plan §9.2): phone < 640 bottom tabs + FAB, tablet 640-1023 rail,
 * desktop >= 1024 collapsible sidebar. Content area is whatever the route renders.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const bp = useBreakpoint();
  useAddShortcut();
  useEffect(() => hydrateShellStore(), []);

  return (
    <View className="flex-1 flex-row">
      {bp === "phone" ? null : <SideNav wide={bp === "desktop"} />}
      <View className="flex-1">
        <View className="flex-1">{children}</View>
        {bp === "phone" ? <BottomBar /> : null}
      </View>
    </View>
  );
}
