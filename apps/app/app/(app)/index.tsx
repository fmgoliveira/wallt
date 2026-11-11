import { Dashboard } from "../../src/dashboard/Dashboard";
import { DataGate } from "../../src/data/DataGate";
import { useTranslation } from "../../src/i18n";
import { Page } from "../../src/shell/Page";

export default function DashboardScreen() {
  const { t } = useTranslation();
  return (
    <Page title={t("dashboard.title")} subtitle={t("dashboard.subtitle")}>
      <DataGate>
        <Dashboard />
      </DataGate>
    </Page>
  );
}
