import { type ReactNode, useEffect } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import { FadeIn, FadeOut, ReduceMotion, SlideInDown, SlideOutDown } from "react-native-reanimated";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { motion } from "../tokens";
import { Portal } from "./Portal";
import { AnimatedView, cn, Text } from "./primitives";

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/**
 * Bottom sheet on phone/tablet, centred modal on desktop (plan §9.2). Rendered inline as an absolute
 * overlay through `<Portal>` (not RN `Modal`) so it stays inside the theme provider and covers the whole
 * screen wherever it is declared. Closes on backdrop tap and on Escape (web).
 */
export function Sheet({ visible, onClose, title, children }: SheetProps) {
  const bp = useBreakpoint();
  const desktop = bp === "desktop";

  useEffect(() => {
    if (!visible || Platform.OS !== "web" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, onClose]);

  if (!visible) return null;

  const enter = desktop
    ? FadeIn.duration(motion.duration.base).reduceMotion(ReduceMotion.System)
    : SlideInDown.springify().damping(motion.spring.damping).reduceMotion(ReduceMotion.System);
  const exit = desktop
    ? FadeOut.duration(motion.duration.fast).reduceMotion(ReduceMotion.System)
    : SlideOutDown.duration(motion.duration.base).reduceMotion(ReduceMotion.System);

  return (
    <Portal>
      <View
        className={cn(
          "absolute inset-0 z-50",
          desktop ? "items-center justify-center" : "justify-end",
        )}
      >
        <AnimatedView
          entering={FadeIn.duration(motion.duration.base).reduceMotion(ReduceMotion.System)}
          exiting={FadeOut.duration(motion.duration.fast).reduceMotion(ReduceMotion.System)}
          className="absolute inset-0 bg-black/50"
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
          className={cn(
            "max-h-[85%] border border-border bg-elevated/90 shadow-e3 web:backdrop-blur-2xl",
            desktop ? "w-full max-w-[480px] rounded-lg" : "w-full rounded-t-lg",
          )}
        >
          {desktop ? null : (
            <View className="items-center pt-2">
              <View className="h-1 w-10 rounded-full bg-border" />
            </View>
          )}
          {title ? (
            <View className="px-5 pt-4 pb-2">
              <Text variant="title">{title}</Text>
            </View>
          ) : null}
          <ScrollView
            contentContainerClassName="px-5 pt-2 pb-6 gap-3"
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </AnimatedView>
      </View>
    </Portal>
  );
}
