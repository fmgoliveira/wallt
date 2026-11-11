import { type ReactNode, useEffect, useRef } from "react";
import {
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import {
  Easing,
  FadeIn,
  FadeOut,
  ReduceMotion,
  SlideInDown,
  SlideOutDown,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useUiStrings } from "../strings";
import { motion } from "../tokens";
import { GlassSurface } from "./GlassSurface";
import { Portal } from "./Portal";
import { AnimatedView, cn, Text } from "./primitives";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Bottom sheet on phone/tablet, centred modal on desktop (plan §9.2). Glass level `sheet`, radius xl,
 * 32x4 grab handle, scrim `black/40` + 4 px blur on web. Rendered through `<Portal>` so it stays inside
 * the theme provider. Closes on scrim tap and on Escape (web). On web, focus moves into the dialog, Tab stays inside it, and
 * focus returns to the opener on close.
 */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const bp = useBreakpoint();
  const desktop = bp === "desktop";
  const insets = useSafeAreaInsets();
  const ui = useUiStrings();
  // Callers pass inline callbacks; keep the focus effect keyed on `visible` only so typing never re-runs it.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!visible || Platform.OS !== "web" || typeof document === "undefined") return;
    const FOCUSABLE =
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    // The newest dialog is the topmost one (sheets can open over sheets).
    const dialog = () => {
      const all = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
      return all[all.length - 1] ?? null;
    };
    const opener = document.activeElement as HTMLElement | null;
    // Move focus into the dialog once it has mounted, so keyboard and screen-reader users land inside it.
    const focusTimer = setTimeout(() => {
      const d = dialog();
      if (!d || d.contains(document.activeElement)) return;
      (d.querySelector<HTMLElement>(FOCUSABLE) ?? d).focus?.();
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      // Keep Tab inside the dialog (focus trap).
      const d = dialog();
      if (!d) return;
      const items = Array.from(d.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0] as HTMLElement;
      const last = items[items.length - 1] as HTMLElement;
      if (!d.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKey);
      // Give focus back to what opened the dialog.
      if (opener && document.contains(opener)) opener.focus?.();
    };
  }, [visible]);

  // Android back button closes the topmost sheet instead of navigating behind it.
  useEffect(() => {
    if (!visible || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  const enter = desktop
    ? FadeIn.duration(motion.duration.base).reduceMotion(ReduceMotion.System)
    : SlideInDown.duration(motion.duration.slow)
        .easing(Easing.out(Easing.cubic))
        .reduceMotion(ReduceMotion.System);
  const exit = desktop
    ? FadeOut.duration(motion.duration.fast).reduceMotion(ReduceMotion.System)
    : SlideOutDown.duration(motion.duration.base)
        .easing(Easing.in(Easing.cubic))
        .reduceMotion(ReduceMotion.System);

  return (
    <Portal>
      <KeyboardAvoidingView
        behavior="padding"
        enabled={Platform.OS !== "web"}
        className={cn(
          "absolute inset-0 z-50",
          desktop ? "items-center justify-center" : "justify-end",
        )}
      >
        <AnimatedView
          entering={FadeIn.duration(motion.duration.base).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(motion.duration.fast).reduceMotion(ReduceMotion.System)}
          className="absolute inset-0 bg-black/40 web:backdrop-blur-[4px]"
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={ui.close}
            onPress={onClose}
            className="flex-1 web:cursor-default"
          />
        </AnimatedView>
        <AnimatedView
          entering={enter}
          exiting={exit}
          accessibilityViewIsModal
          role="dialog"
          aria-modal
          aria-label={title}
          className={cn("max-h-[85%]", desktop ? "w-full max-w-[560px]" : "w-full")}
        >
          <GlassSurface
            level="sheet"
            rounded="xl"
            // shrink + min-h-0 let the ScrollView below take the leftover height instead of overflowing the cap
            style={{
              flexShrink: 1,
              minHeight: 0,
              ...(desktop ? {} : { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }),
            }}
          >
            {desktop ? null : (
              <View className="items-center pt-2">
                <View className="h-1 w-8 rounded-full bg-border-strong" />
              </View>
            )}
            {title ? (
              <View className="px-5 pt-4 pb-2">
                <Text variant="title">{title}</Text>
              </View>
            ) : null}
            <ScrollView
              style={{ flexShrink: 1, minHeight: 0 }}
              contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
              contentContainerClassName="px-5 pt-2 gap-3"
              keyboardShouldPersistTaps="handled"
            >
              {children}
            </ScrollView>
          </GlassSurface>
        </AnimatedView>
      </KeyboardAvoidingView>
    </Portal>
  );
}
