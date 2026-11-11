import { getUiLocale, UiStringsProvider } from "@wallt/ui";
import type { ReactNode } from "react";
import { useTranslation } from "./index";

/** Gives the shared UI components their built-in words in the user's language. */
export function UiStringsBridge({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  // `i18n.language` changes with the language, so the provider value is rebuilt when it does
  const value = {
    locale: getUiLocale() ?? i18n.language,
    close: t("common.ui.close"),
    hiddenAmount: t("common.ui.hiddenAmount"),
    dragToReorder: t("common.ui.dragToReorder"),
    selectPlaceholder: t("common.ui.selectPlaceholder"),
    today: t("common.ui.today"),
    yesterday: t("common.ui.yesterday"),
    pickDate: t("common.ui.pickDate"),
    clear: t("common.ui.clear"),
    previousMonth: t("common.ui.previousMonth"),
    nextMonth: t("common.ui.nextMonth"),
  };
  return <UiStringsProvider value={value}>{children}</UiStringsProvider>;
}
