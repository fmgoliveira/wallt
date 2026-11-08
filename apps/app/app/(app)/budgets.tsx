import { EmptyState } from "@wallt/ui";
import { PiggyBank } from "lucide-react-native";
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";

export default function Budgets() {
  return (
    <Page title="Budgets" subtitle="Spending limits and progress">
      <EmptyState
        icon={placeholderIcon(PiggyBank)}
        title="Coming soon"
        description="This screen is planned for P4.1."
      />
    </Page>
  );
}
