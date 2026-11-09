import { useLocalSearchParams } from "expo-router";
import { DataGate } from "../../src/data/DataGate";
import { RulesManager } from "../../src/rules/RulesManager";
import { Page } from "../../src/shell/Page";

export default function RulesScreen() {
  const { tx } = useLocalSearchParams<{ tx?: string }>();
  return (
    <Page title="Rules" subtitle="Put transactions in a category automatically">
      <DataGate>
        <RulesManager fromTransaction={tx} />
      </DataGate>
    </Page>
  );
}
