import { AUTO_LOCK_OPTIONS, isValidPin } from "@wallt/core";
import {
  Button,
  Card,
  Input,
  Select,
  Sheet,
  Switch,
  Text,
  toast,
  usePrivacyStore,
} from "@wallt/ui";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useTranslation } from "../i18n";
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

const AUTO_LOCK_KEYS = {
  0: "immediately",
  60000: "min1",
  300000: "min5",
  900000: "min15",
} as const;

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
  const { t } = useTranslation();

  async function go() {
    if (confirmNew) {
      if (!isValidPin(pin)) return setError(t("security.pinSheet.invalidLength"));
      if (pin !== again) return setError(t("security.pinSheet.mismatch"));
    }
    setError(await onSubmit(pin));
  }

  return (
    <Sheet visible onClose={onClose} title={title}>
      <Input
        label={confirmNew ? t("security.pinSheet.newLabel") : t("security.pinSheet.pinLabel")}
        value={pin}
        onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))}
        secureTextEntry
        keyboardType="number-pad"
        autoFocus
        error={confirmNew ? undefined : (error ?? undefined)}
      />
      {confirmNew ? (
        <Input
          label={t("security.pinSheet.repeat")}
          value={again}
          onChangeText={(v) => setAgain(v.replace(/\D/g, "").slice(0, 8))}
          secureTextEntry
          keyboardType="number-pad"
          error={error ?? undefined}
        />
      ) : null}
      <Button label={t("security.pinSheet.continue")} onPress={go} />
      <Button label={t("security.pinSheet.cancel")} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

/** Privacy mode: hides every amount in the app, on all platforms. Remembered between launches. */
export function PrivacySetting() {
  const hidden = usePrivacyStore((s) => s.hidden);
  const { t } = useTranslation();
  return (
    <Card>
      <Switch
        label={t("security.privacy.title")}
        description={t("security.privacy.hint")}
        value={hidden}
        onValueChange={(v) => usePrivacyStore.getState().setHidden(v)}
      />
    </Card>
  );
}

/** App lock (Android/iOS): PIN with optional fingerprint/face, and how long the app may sit in the background. */
export function LockSetting() {
  const { lockEnabled, timeoutMs, biometrics } = useSecurityStore();
  const [flow, setFlow] = useState<Flow>(null);
  const [bioOk, setBioOk] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    void biometricsAvailable().then(setBioOk);
  }, []);

  if (!lockSupported) {
    return (
      <Card className="gap-1">
        <Text variant="title">{t("security.appLock.title")}</Text>
        <Text variant="small" tone="muted">
          {t("security.appLock.unsupported")}
        </Text>
      </Card>
    );
  }

  const close = () => setFlow(null);
  const fail = (e: unknown) =>
    toast.error(e instanceof Error ? e.message : t("security.appLock.genericError"));

  return (
    <Card className="gap-4">
      <Switch
        label={t("security.appLock.title")}
        description={bioOk ? t("security.appLock.hintBiometrics") : t("security.appLock.hint")}
        value={lockEnabled}
        onValueChange={(v) => setFlow(v ? "enable" : "disable")}
      />
      {lockEnabled ? (
        <>
          <Select
            label={t("security.appLock.lockAfter")}
            options={AUTO_LOCK_OPTIONS.map((o) => {
              const key = AUTO_LOCK_KEYS[o.ms as keyof typeof AUTO_LOCK_KEYS];
              return {
                value: String(o.ms),
                label: key ? t(`security.appLock.autoLock.${key}`) : o.label,
              };
            })}
            value={String(timeoutMs)}
            onChange={(v) => void setAutoLock(Number(v))}
          />
          {bioOk ? (
            <Switch
              label={t("security.appLock.biometricsLabel")}
              value={biometrics}
              onValueChange={(v) => void setBiometrics(v)}
            />
          ) : null}
          <View className="flex-row">
            <Button
              label={t("security.appLock.changePin")}
              variant="secondary"
              onPress={() => setFlow("change-verify")}
            />
          </View>
        </>
      ) : null}

      {flow === "enable" ? (
        <PinSheet
          title={t("security.appLock.choosePin")}
          confirmNew
          onClose={close}
          onSubmit={async (pin) => {
            try {
              await enableLock(pin);
              close();
              toast.success(t("security.appLock.enabled"));
              return null;
            } catch (e) {
              fail(e);
              return t("security.appLock.saveFailed");
            }
          }}
        />
      ) : null}
      {flow === "disable" ? (
        <PinSheet
          title={t("security.appLock.disableTitle")}
          confirmNew={false}
          onClose={close}
          onSubmit={async (pin) => {
            if (!checkPin(pin)) return t("security.lock.wrongPin");
            await disableLock();
            close();
            toast.success(t("security.appLock.disabled"));
            return null;
          }}
        />
      ) : null}
      {flow === "change-verify" ? (
        <PinSheet
          title={t("security.appLock.currentPin")}
          confirmNew={false}
          onClose={close}
          onSubmit={async (pin) => {
            if (!checkPin(pin)) return t("security.lock.wrongPin");
            setFlow("change-new");
            return null;
          }}
        />
      ) : null}
      {flow === "change-new" ? (
        <PinSheet
          title={t("security.appLock.chooseNewPin")}
          confirmNew
          onClose={close}
          onSubmit={async (pin) => {
            try {
              await enableLock(pin);
              close();
              toast.success(t("security.appLock.pinChanged"));
              return null;
            } catch (e) {
              fail(e);
              return t("security.appLock.saveFailed");
            }
          }}
        />
      ) : null}
    </Card>
  );
}
