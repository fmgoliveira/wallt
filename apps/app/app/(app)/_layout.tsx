import { Slot } from "expo-router";
import { AppShell } from "../../src/shell/AppShell";

export default function AppLayout() {
  return (
    <AppShell>
      <Slot />
    </AppShell>
  );
}
