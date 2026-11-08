import { Text, useBreakpoint } from "@wallt/ui";
import Head from "expo-router/head";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export interface PageProps {
  title: string;
  subtitle?: string;
  /** Right-aligned header actions (buttons). */
  actions?: ReactNode;
  children?: ReactNode;
}

/** Standard screen frame: web <title>, header, max-width content, room for the phone tab bar. */
export function Page({ title, subtitle, actions, children }: PageProps) {
  const bp = useBreakpoint();
  const insets = useSafeAreaInsets();
  return (
    <>
      <Head>
        {/* biome-ignore lint/correctness/noReactNativeRawText: web document <title>, not RN text */}
        <title>{`${title} · Wallt`}</title>
      </Head>
      <ScrollView
        style={{ paddingTop: insets.top }}
        contentContainerClassName="mx-auto w-full max-w-[1200px] gap-6 px-4 pt-6 pb-32 tablet:px-6 desktop:px-8 desktop:pt-8 desktop:pb-10"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row items-end justify-between gap-4">
          <View className="flex-1 gap-1">
            <Text
              variant={bp === "phone" ? "heading" : "display"}
              accessibilityRole="header"
              aria-level={1}
            >
              {title}
            </Text>
            {subtitle ? <Text tone="muted">{subtitle}</Text> : null}
          </View>
          {actions}
        </View>
        {children}
      </ScrollView>
    </>
  );
}
