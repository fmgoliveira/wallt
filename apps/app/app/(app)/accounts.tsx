import { EmptyState } from "@wallt/ui";
import { Wallet } from "lucide-react-native";
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";

export default function Accounts() {
  return (
    <Page title="Accounts" subtitle="Balances across all your accounts">
      <EmptyState
        icon={placeholderIcon(Wallet)}
        title="No accounts yet"
        description="Accounts arrive in P2.4."
      />
    </Page>
  );
}
