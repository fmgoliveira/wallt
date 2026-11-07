import { useEffect } from "react";
import { Pressable, View } from "react-native";
import { FadeOut, ReduceMotion, SlideInUp } from "react-native-reanimated";
import { create } from "zustand";
import { motion } from "../tokens";
import { AnimatedView, cn, Text } from "./primitives";

export type ToastTone = "info" | "success" | "error";

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  items: ToastItem[];
  show: (message: string, tone?: ToastTone) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

const useToastStore = create<ToastState>((set) => ({
  items: [],
  show: (message, tone = "info") => {
    const id = nextId++;
    // Keep the stack short: newest three.
    set((s) => ({ items: [...s.items, { id, message, tone }].slice(-3) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((t) => t.id !== id) })),
}));

/** Imperative API: `toast.show("Saved", "success")` from anywhere (events, mutations). */
export const toast = {
  show: (message: string, tone: ToastTone = "info") => useToastStore.getState().show(message, tone),
  success: (message: string) => useToastStore.getState().show(message, "success"),
  error: (message: string) => useToastStore.getState().show(message, "error"),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
};

const AUTO_DISMISS_MS = 4000;

const toneBar: Record<ToastTone, string> = {
  info: "bg-accent",
  success: "bg-positive",
  error: "bg-negative",
};

function ToastView({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const t = setTimeout(() => dismiss(item.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [item.id, dismiss]);

  return (
    <AnimatedView
      entering={SlideInUp.springify()
        .damping(motion.spring.damping)
        .reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(motion.duration.fast).reduceMotion(ReduceMotion.System)}
      role={item.tone === "error" ? "alert" : "status"}
      accessibilityLiveRegion={item.tone === "error" ? "assertive" : "polite"}
      className="w-full max-w-[420px] flex-row overflow-hidden rounded-md border border-white/70 bg-white/75 shadow-e3 dark:border-white/10 dark:bg-slate-900/70 web:backdrop-blur-2xl"
    >
      <View className={cn("w-1", toneBar[item.tone])} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.message}. Dismiss`}
        onPress={() => dismiss(item.id)}
        className="min-h-touch flex-1 justify-center px-4 py-3"
      >
        <Text variant="small">{item.message}</Text>
      </Pressable>
    </AnimatedView>
  );
}

/** Mounted once by `ThemeProvider`. Top-centre, below the safe area on phones. */
export function ToastHost() {
  const items = useToastStore((s) => s.items);
  if (items.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      className="absolute inset-x-0 top-0 z-[60] items-center gap-2 p-4 pt-12"
    >
      {items.map((item) => (
        <ToastView key={item.id} item={item} />
      ))}
    </View>
  );
}
