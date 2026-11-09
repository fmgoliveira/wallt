import { type ReactNode, useEffect } from "react";
import { AppState } from "react-native";
import { LockScreen } from "./LockScreen";
import {
  hydrateSecurity,
  lockSupported,
  noteBackground,
  noteForeground,
  useSecurityStore,
} from "./securityStore";

/**
 * Wraps the app: loads the security settings, watches the app going to the background and back, and covers
 * everything with the lock screen when it must lock. Also covers the app while settings load (native), so
 * locked content never flashes.
 */
export function SecurityGate({ children }: { children: ReactNode }) {
  const ready = useSecurityStore((s) => s.ready);
  const locked = useSecurityStore((s) => s.locked);

  useEffect(() => {
    void hydrateSecurity();
    if (!lockSupported) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") noteForeground();
      else noteBackground();
    });
    return () => sub.remove();
  }, []);

  return (
    <>
      {children}
      {lockSupported && (!ready || locked) ? <LockScreen /> : null}
    </>
  );
}
