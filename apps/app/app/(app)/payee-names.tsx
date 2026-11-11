import { AliasesManager } from "../../src/aliases/AliasesManager";
import { DataGate } from "../../src/data/DataGate";
import { useTranslation } from "../../src/i18n";
import { Page } from "../../src/shell/Page";

export default function PayeeNamesScreen() {
  const { t } = useTranslation();
  return (
    <Page title={t("aliases.page.title")} subtitle={t("aliases.page.subtitle")}>
      <DataGate>
        <AliasesManager />
      </DataGate>
    </Page>
  );
}
