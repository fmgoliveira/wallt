import { AliasesManager } from "../../src/aliases/AliasesManager";
import { DataGate } from "../../src/data/DataGate";
import { Page } from "../../src/shell/Page";

export default function PayeeNamesScreen() {
  return (
    <Page title="Payee names" subtitle="Turn messy bank text into clean payees">
      <DataGate>
        <AliasesManager />
      </DataGate>
    </Page>
  );
}
