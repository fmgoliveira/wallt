import { describeSync } from "@wallt/sync";
import { Chip } from "@wallt/ui";
import { useEffect, useState } from "react";
import { AppState, Pressable } from "react-native";
import { useTranslation } from "../i18n";
import { syncNow, useSyncUi } from "./runtime";

/** Sync status chip (PLAN §10 P3.3): "Synced 2 min ago", offline badge, pending count. Tap to sync now. */
export function SyncStatus() {
  const session = useSyncUi((u) => u.session);
  const state = useSyncUi((u) => u.engine);
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());

  // keep "2 min ago" fresh, and sync when the app comes back to the foreground
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        setNow(Date.now());
        void syncNow();
      }
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);

  const { label, tone } = describeSync(session ? state : null, now);
  const chip = <Chip tone={tone} label={label} />;
  if (!session) return chip;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("sync.status.syncNowLabel", { label })}
      onPress={() => void syncNow()}
    >
      {chip}
    </Pressable>
  );
}
