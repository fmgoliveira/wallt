import { AUTO_LOCK_OPTIONS, isValidPin } from "@wallt/core";
import { Button, Card, Input, Select, Sheet, Tabs, Text, toast, usePrivacyStore } from "@wallt/ui";
import { useEffect, useState } from "react";
import { View } from "react-native";
import {
  biometricsAvailable,
  checkPin,
  disableLock,
  enableLock,
  lockSupported,
  setAutoLock,
  setBiometrics,
  useSecurityStore,
} from "./securityStore";

const onOff = [
  { value: "off", label: "Off" },
  { value: "on", label: "On" },
] as const;

type Flow = null | "enable" | "disable" | "change-verify" | "change-new";

/** One sheet for every PIN step: enter a new PIN (twice) or confirm the current one. */
function PinSheet({
  title,
  confirmNew,
  onSubmit,
  onClose,
}: {
  title: string;
  /** Ask twice (a new PIN) instead of once (verify the current one). */
  confirmNew: boolean;
  onSubmit: (pin: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [pin, setPin] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (confirmNew) {
      if (!isValidPin(pin)) return setError("Use 4 to 8 digits");
      if (pin !== again) return setError("The two PINs do not match");
    }
    setError(await onSubmit(pin));
  }

  return (
    <Sheet visible onClose={onClose} title={title}>
      <Input
        label={confirmNew ? "New PIN (4 to 8 digits)" : "PIN"}
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))}
        secureTextEntry
        keyboardType="number-pad"
        autoFocus
        error={confirmNew ? undefined : (error ?? undefined)}
      />
      {confirmNew ? (
        <Input
          label="Repeat PIN"
          value={again}
          onChangeText={(v) => setAgain(v.replace(/\D/g, "").slice(0, 8))}
          secureTextEntry
          keyboardType="number-pad"
          error={error ?? undefined}
        />
      ) : null}
      <Button label="Continue" onPress={go} />
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

/** Privacy mode: hides every amount in the app, on all platforms. Remembered between launches. */
export function PrivacySetting() {
  const hidden = usePrivacyStore((s) => s.hidden);
  return (
    <Card className="gap-3">
      <View className="gap-1">
        <Text variant="title">Privacy mode</Text>
        <Text variant="small" tone="muted">
          Replaces every amount with dots. Handy in public; you can also toggle it with the eye in
          the page header.
        </Text>
      </View>
      <Tabs
        items={onOff}
        value={hidden ? "on" : "off"}
        onChange={(v) => usePrivacyStore.getState().setHidden(v === "on")}
      />
    </Card>
  );
}

/** App lock (Android/iOS): PIN with optional fingerprint/face, and how long the app may sit in the background. */
export function LockSetting() {
  const { lockEnabled, timeoutMs, biometrics } = useSecurityStore();
  const [flow, setFlow] = useState<Flow>(null);
  const [bioOk, setBioOk] = useState(false);

  useEffect(() => {
    void biometricsAvailable().then(setBioOk);
  }, []);

  if (!lockSupported) {
    return (
      <Card className="gap-1">
        <Text variant="title">App lock</Text>
        <Text variant="small" tone="muted">
          Available in the Android app. On the web, your browser and device sign-in protect the
          session.
        </Text>
      </Card>
    );
  }

  const close = () => setFlow(null);
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

  return (
    <Card className="gap-4">
      <View className="gap-1">
        <Text variant="title">App lock</Text>
        <Text variant="small" tone="muted">
          Ask for your PIN{bioOk ? " or fingerprint/face" : ""} when you open Wallt after it has
          been in the background.
        </Text>
      </View>
      <Tabs
        items={onOff}
        value={lockEnabled ? "on" : "off"}
        onChange={(v) => setFlow(v === "on" ? "enable" : "disable")}
      />
      {lockEnabled ? (
        <>
          <Select
            label="Lock the app"
            options={AUTO_LOCK_OPTIONS.map((o) => ({ value: String(o.ms), label: o.label }))}
            value={String(timeoutMs)}
            onChange={(v) => void setAutoLock(Number(v))}
          />
          {bioOk ? (
            <View className="gap-1.5">
              <Text variant="small" tone="muted" weight="medium">
                Fingerprint or face
              </Text>
              <Tabs
                items={onOff}
                value={biometrics ? "on" : "off"}
                onChange={(v) => void setBiometrics(v === "on")}
              />
            </View>
          ) : null}
          <View className="flex-row">
            <Button
              label="Change PIN"
              variant="secondary"
              onPress={() => setFlow("change-verify")}
            />
          </View>
        </>
      ) : null}

      {flow === "enable" ? (
        <PinSheet
          title="Choose a PIN"
          confirmNew
          onClose={close}
          onSubmit={async (pin) => {
            try {
              await enableLock(pin);
              close();
              toast.success("App lock is on");
              return null;
            } catch (e) {
              fail(e);
              return "Could not save the PIN";
            }
          }}
        />
      ) : null}
      {flow === "disable" ? (
        <PinSheet
          title="Enter your PIN to turn the lock off"
          confirmNew={false}
          onClose={close}
          onSubmit={async (pin) => {
            if (!checkPin(pin)) return "Wrong PIN";
            await disableLock();
            close();
            toast.success("App lock is off");
            return null;
          }}
        />
      ) : null}
      {flow === "change-verify" ? (
        <PinSheet
          title="Enter your current PIN"
          confirmNew={false}
          onClose={close}
          onSubmit={async (pin) => {
            if (!checkPin(pin)) return "Wrong PIN";
            setFlow("change-new");
            return null;
          }}
        />
      ) : null}
      {flow === "change-new" ? (
        <PinSheet
          title="Choose a new PIN"
          confirmNew
          onClose={close}
          onSubmit={async (pin) => {
            try {
              await enableLock(pin);
              close();
              toast.success("PIN changed");
              return null;
            } catch (e) {
              fail(e);
              return "Could not save the PIN";
            }
          }}
        />
      ) : null}
    </Card>
  );
}
