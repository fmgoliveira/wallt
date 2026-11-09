import { DataGate } from "../../src/data/DataGate";
import { FormatsManager } from "../../src/import/FormatsManager";
import { Page } from "../../src/shell/Page";

export default function ImportFormatsScreen() {
  return (
    <Page title="Import formats" subtitle="How each bank's export is read">
      <DataGate>
        <FormatsManager />
      </DataGate>
    </Page>
  );
}
