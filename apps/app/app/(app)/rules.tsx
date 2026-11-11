import { useLocalSearchParams } from "expo-router";
import { DataGate } from "../../src/data/DataGate";
import { useTranslation } from "../../src/i18n";
import { RulesManager } from "../../src/rules/RulesManager";
import { Page } from "../../src/shell/Page";

export default function RulesScreen() {
  const { t } = useTranslation();
  const { tx } = useLocalSearchParams<{ tx?: string }>();
  return (
    <Page title={t("rules.page.title")} subtitle={t("rules.page.subtitle")}>
      <DataGate>
        <RulesManager fromTransaction={tx} />
      </DataGate>
    </Page>
  );
}
