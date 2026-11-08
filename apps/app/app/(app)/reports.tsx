import { EmptyState } from "@wallt/ui";
import { ChartColumn } from "lucide-react-native";
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";

export default function Reports() {
  return (
    <Page title="Reports" subtitle="Charts and trends">
      <EmptyState
        icon={placeholderIcon(ChartColumn)}
        title="Coming soon"
        description="This screen is planned for P4.4."
      />
    </Page>
  );
}
