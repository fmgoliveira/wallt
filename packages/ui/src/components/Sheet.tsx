import { type ReactNode, useEffect } from "react";
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
 * the theme provider. Closes on scrim tap and on Escape (web).
 */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const bp = useBreakpoint();
  const desktop = bp === "desktop";
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible || Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

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
            accessibilityLabel="Close"
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
            style={desktop ? undefined : { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }}
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
