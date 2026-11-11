import { DataGate } from "../../src/data/DataGate";
import { useTranslation } from "../../src/i18n";
import { ImportWizard } from "../../src/import/ImportWizard";
import { Page } from "../../src/shell/Page";

export default function ImportScreen() {
  const { t } = useTranslation();
  return (
    <Page title={t("importing.page.title")} subtitle={t("importing.page.subtitle")}>
      <DataGate>
        <ImportWizard mode="import" />
      </DataGate>
    </Page>
  );
}
