import {
  actionGradient,
  actionShadow,
  Button,
  Chip,
  cn,
  GlassSurface,
  Gradient,
  MotionView,
  radius,
  Text,
  useBreakpoint,
  usePressScale,
  useTheme,
} from "@wallt/ui";
import { usePathname } from "expo-router";
import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react-native";
import { type ReactNode, useEffect } from "react";
import { Image, Platform, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSyncUi } from "../sync/runtime";
import { SyncStatus } from "../sync/SyncStatus";
import { useEditorStore } from "../transactions/editorStore";
import { TransactionEditorHost } from "../transactions/TransactionEditor";
import { NavButton } from "./NavButton";
import { isActive, phoneItems, wideItems } from "./nav";
import { hydrateShellStore, useShellStore } from "./store";

const icon = require("../../assets/icon.png");

/**
 * Sync status; on web, while signed out, also the interim notice (ADR 0005): web data stays in this browser only and
 * clearing site data erases it.
 */
function StatusRow() {
  const signedIn = useSyncUi((u) => u.session !== null);
  // Android without a server session has nothing to say: keep the P2 layout untouched.
  if (Platform.OS !== "web" && !signedIn) return null;
  return (
    <View className="mx-auto w-full max-w-[1200px] px-4 pt-3 tablet:px-6 desktop:px-8">
      <View className="flex-row flex-wrap items-center gap-2">
        <SyncStatus />
        {Platform.OS === "web" && !signedIn ? (
          <Chip tone="warning" label="Interim: web data stays in this browser only" />
        ) : null}
      </View>
    </View>
  );
}

function addTransaction() {
  useEditorStore.getState().openNew();
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
  const { colors } = useTheme();
  return (
    <View className={cn("flex-row items-center gap-3", !showName && "justify-center")}>
      <View
        className="items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: radius.md,
          backgroundColor: colors.elevated,
          boxShadow: `0 0 0 1px ${colors.borderStrong}`,
        }}
      >
        <Image
          source={icon}
          style={{ width: 28, height: 28 }}
          resizeMode="contain"
          accessibilityLabel="Wallt"
        />
      </View>
      {showName ? <Text variant="title">Wallt</Text> : null}
    </View>
  );
}

/** 44x40 add button (guidelines §7): `actionGradient`, radius md. Centre of the phone tab bar; compact on the rail. */
function AddTabButton({ fill }: { fill?: boolean }) {
  const { scheme, colors } = useTheme();
  const press = usePressScale();
  return (
    <MotionView style={press.style}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        accessibilityRole="button"
        accessibilityLabel="Add transaction"
        onPress={addTransaction}
        className={cn(
          "items-center justify-center overflow-hidden web:cursor-pointer web:outline-none web:focus-visible:outline web:focus-visible:outline-2 web:focus-visible:outline-offset-2 web:focus-visible:outline-data",
          fill && "self-stretch",
        )}
        style={{
          width: fill ? undefined : 44,
          height: 40,
          borderRadius: radius.md,
          boxShadow: actionShadow(scheme),
        }}
      >
        <Gradient fill spec={actionGradient(scheme)} />
        <View>
          <Plus size={20} color={colors.accentFg} strokeWidth={2} />
        </View>
      </Pressable>
    </MotionView>
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
    <View className="my-3 ml-3">
      <GlassSurface
        level="bar"
        rounded="lg"
        className={cn("flex-1 gap-4 p-2", expanded ? "w-[232px]" : wide ? "w-[76px]" : "w-[92px]")}
      >
        <View role="navigation" aria-label="Main" className="flex-1 gap-4">
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
          {expanded ? (
            <Button
              label="Add transaction"
              kbd="N"
              leading={<Plus size={18} color={colors.accentFg} strokeWidth={2} />}
              onPress={addTransaction}
            />
          ) : (
            <View className="items-center">
              <AddTabButton />
            </View>
          )}
          {wide ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onPress={toggle}
              className="min-h-touch items-center justify-center rounded-md web:cursor-pointer web:outline-none web:hover:bg-text/5 web:focus-visible:outline web:focus-visible:outline-2 web:focus-visible:outline-data"
            >
              <Toggle size={18} color={colors.subtle} strokeWidth={1.6} />
            </Pressable>
          ) : null}
        </View>
      </GlassSurface>
    </View>
  );
}

function BottomBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const half = phoneItems.length / 2;
  return (
    <View style={{ marginBottom: Math.max(insets.bottom, 8) }} className="mx-3">
      <GlassSurface level="bar" rounded="xl" className="h-[60px] flex-row items-center px-1">
        <View role="navigation" aria-label="Main" className="flex-1 flex-row items-center">
          {phoneItems.slice(0, half).map((item) => (
            <NavButton key={item.key} item={item} active={isActive(item, pathname)} variant="bar" />
          ))}
          <View className="items-center justify-center px-2">
            <AddTabButton />
          </View>
          {phoneItems.slice(half).map((item) => (
            <NavButton key={item.key} item={item} active={isActive(item, pathname)} variant="bar" />
          ))}
        </View>
      </GlassSurface>
    </View>
  );
}

/**
 * Responsive shell (plan §9.2): phone < 640 glass tab bar with the add button in the middle,
 * tablet 640-1023 rail, desktop >= 1024 collapsible sidebar. The content area is whatever the route renders.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const bp = useBreakpoint();
  useAddShortcut();
  useEffect(() => hydrateShellStore(), []);

  return (
    <View className="flex-1 flex-row">
      {bp === "phone" ? null : <SideNav wide={bp === "desktop"} />}
      <View className="flex-1">
        <StatusRow />
        <View className="flex-1">{children}</View>
        {bp === "phone" ? (
          // Floats over the content so lists run full height and scroll behind the glass bar.
          <View pointerEvents="box-none" className="absolute right-0 bottom-0 left-0">
            <BottomBar />
          </View>
        ) : null}
      </View>
      <TransactionEditorHost />
    </View>
  );
}
