import { DataGate } from "../../src/data/DataGate";
import { useTranslation } from "../../src/i18n";
import { FormatsManager } from "../../src/import/FormatsManager";
import { Page } from "../../src/shell/Page";

export default function ImportFormatsScreen() {
  const { t } = useTranslation();
  return (
    <Page title={t("importing.page.formatsTitle")} subtitle={t("importing.page.formatsSubtitle")}>
      <DataGate>
        <FormatsManager />
      </DataGate>
    </Page>
  );
}
