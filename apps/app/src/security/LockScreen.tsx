import { Button, Text, useTheme } from "@wallt/ui";
import { Fingerprint, Lock } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { PinPad } from "./PinPad";
import { submitPin, unlockWithBiometrics, useSecurityStore } from "./securityStore";

/** Full-screen cover shown while the app is locked (and, on native, until the stored settings are read). */
export function LockScreen() {
  const { colors } = useTheme();
  const { ready, biometrics, blockedUntil } = useSecurityStore();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const waitSeconds = Math.max(0, Math.ceil((blockedUntil - now) / 1000));

  useEffect(() => {
    if (blockedUntil <= Date.now()) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [blockedUntil]);

  const bio = useCallback(() => void unlockWithBiometrics(), []);
  // Offer the system prompt as soon as the lock appears.
  useEffect(() => {
    if (ready && biometrics) bio();
  }, [ready, biometrics, bio]);

  async function submit() {
    const result = await submitPin(pin);
    setPin("");
    setError(
      result === "wrong" ? "Wrong PIN" : result === "blocked" ? "Too many attempts. Wait." : null,
    );
  }

  return (
    <View
      accessibilityViewIsModal
      className="absolute inset-0 z-[100] items-center justify-center px-8"
      style={{ backgroundColor: colors.bg }}
    >
      {ready ? (
        <View className="w-full max-w-[320px] gap-8">
          <View className="items-center gap-2">
            <Lock size={28} color={colors.muted} strokeWidth={1.6} />
            <Text variant="heading">Wallt is locked</Text>
            <Text tone={error || waitSeconds > 0 ? "negative" : "muted"} className="text-center">
              {waitSeconds > 0
                ? `Try again in ${waitSeconds} s`
                : (error ?? "Enter your PIN to continue")}
            </Text>
          </View>
          <PinPad value={pin} onChange={setPin} onSubmit={submit} disabled={waitSeconds > 0} />
          {biometrics ? (
            <Button
              label="Use fingerprint or face"
              variant="ghost"
              leading={<Fingerprint size={18} color={colors.muted} strokeWidth={1.6} />}
              onPress={bio}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
