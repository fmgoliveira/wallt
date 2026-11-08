import { EmptyState } from "@wallt/ui";
import { Settings as SettingsIcon } from "lucide-react-native";
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";

export default function SettingsScreen() {
  return (
    <Page title="Settings" subtitle="Theme, currency, backups, devices">
      <EmptyState
        icon={placeholderIcon(SettingsIcon)}
        title="Coming soon"
        description="This screen is planned for later."
      />
    </Page>
  );
}
