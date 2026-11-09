import { Dashboard } from "../../src/dashboard/Dashboard";
import { DataGate } from "../../src/data/DataGate";
import { Page } from "../../src/shell/Page";

export default function DashboardScreen() {
  return (
    <Page title="Dashboard" subtitle="Your money at a glance">
      <DataGate>
        <Dashboard />
      </DataGate>
    </Page>
  );
}
