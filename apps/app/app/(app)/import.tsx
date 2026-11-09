import { DataGate } from "../../src/data/DataGate";
import { ImportWizard } from "../../src/import/ImportWizard";
import { Page } from "../../src/shell/Page";

export default function ImportScreen() {
  return (
    <Page title="Import" subtitle="Bring in a statement from your bank: CSV, Excel, OFX or CAMT">
      <DataGate>
        <ImportWizard mode="import" />
      </DataGate>
    </Page>
  );
}
