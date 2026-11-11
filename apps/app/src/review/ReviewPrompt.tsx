import { Button, Sheet, Text } from "@wallt/ui";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTransactionCount } from "../data/hooks";
import { useTranslation } from "../i18n";

/** The prompt shows once per app open, however many times the shell remounts. */
let shownThisSession = false;

/** On open: if transactions need a category, say so once and offer to go through them (PLAN §6, dismissible). */
export function ReviewPrompt() {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const count = useTransactionCount({ needsReview: true });
  const [open, setOpen] = useState(false);
  const n = count.data ?? 0;

  useEffect(() => {
    if (shownThisSession || n === 0) return;
    shownThisSession = true;
    if (pathname.startsWith("/review") || pathname.startsWith("/import")) return;
    setOpen(true);
  }, [n, pathname]);

  return (
    <Sheet visible={open} onClose={() => setOpen(false)} title={t("review.prompt.title")}>
      <View className="gap-4">
        <Text>{t("review.prompt.body", { count: n })}</Text>
        <Button
          label={t("review.prompt.reviewNow")}
          onPress={() => {
            setOpen(false);
            router.push("/review");
          }}
        />
        <Button label={t("review.prompt.later")} variant="ghost" onPress={() => setOpen(false)} />
      </View>
    </Sheet>
  );
}
