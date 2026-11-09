import { type AuthClientError, describeSync, normalizeServerUrl } from "@wallt/sync";
import { Button, Card, Input, Sheet, Text, toast } from "@wallt/ui";
import { useState } from "react";
import { Platform, View } from "react-native";
import { syncNow, useSyncUi } from "./runtime";
import { authClientFor, completeSignIn, signOut } from "./session";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Wrong email or password.",
  invalid_code: "That code did not work. Try the next one from your authenticator.",
  locked: "Too many attempts. Wait a few minutes and try again.",
  rate_limited: "Too many attempts from this device. Wait a few minutes.",
  expired: "That took too long. Enter your password again.",
  offline: "Could not reach the server. Check the address and your connection.",
  server: "The server answered with an error.",
};

const defaultServer = () =>
  Platform.OS === "web" && typeof location !== "undefined" ? location.origin : "";

function SignInSheet({ onClose }: { onClose: () => void }) {
  const [server, setServer] = useState(defaultServer());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const kind = (e as AuthClientError).kind;
      setError(MESSAGES[kind ?? ""] ?? (e instanceof Error ? e.message : "Something went wrong"));
      if (kind === "expired") setChallenge(null);
    } finally {
      setBusy(false);
    }
  }

  const baseUrl = normalizeServerUrl(server);

  const step1 = () =>
    run(async () => {
      if (!baseUrl) throw new Error("Enter the server address (https://…).");
      const res = await authClientFor(baseUrl).login(email.trim(), password);
      if (res.status === "enrol_required") {
        throw new Error(
          "Finish two-factor setup on the server's web app first, then sign in here.",
        );
      }
      setChallenge(res.challengeToken);
      setPassword("");
    });

  const step2 = () =>
    run(async () => {
      if (!baseUrl || !challenge) return;
      const proof = useRecovery ? { recoveryCode: code.trim() } : { code: code.trim() };
      const session = await authClientFor(baseUrl).verify(challenge, proof);
      await completeSignIn(session);
      toast.success("Signed in. Syncing…");
      onClose();
    });

  return (
    <Sheet
      visible
      onClose={onClose}
      title={challenge ? "Two-factor code" : "Sign in to your server"}
    >
      {challenge ? (
        <>
          <Input
            label={useRecovery ? "Recovery code" : "6-digit code"}
            value={code}
            onChangeText={setCode}
            autoFocus
            autoCapitalize="none"
            keyboardType={useRecovery ? "default" : "number-pad"}
            error={error ?? undefined}
          />
          <Button label={busy ? "Checking…" : "Sign in"} onPress={step2} disabled={busy || !code} />
          <Button
            label={useRecovery ? "Use authenticator code" : "Use a recovery code"}
            variant="ghost"
            onPress={() => {
              setUseRecovery(!useRecovery);
              setCode("");
              setError(null);
            }}
          />
        </>
      ) : (
        <>
          <Input
            label="Server address"
            value={server}
            onChangeText={setServer}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder="https://wallt.example.com"
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            error={error ?? undefined}
          />
          <Button
            label={busy ? "Checking…" : "Continue"}
            onPress={step1}
            disabled={busy || !email || !password}
          />
        </>
      )}
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

/** Settings card: connect this device to the server (password + 2FA), see sync status, sign out. */
export function SyncSetting() {
  const session = useSyncUi((u) => u.session);
  const engine = useSyncUi((u) => u.engine);
  const [open, setOpen] = useState(false);
  const status = describeSync(session ? engine : null, Date.now());

  return (
    <Card className="gap-3">
      <View className="gap-1">
        <Text variant="title">Sync</Text>
        <Text variant="small" tone="muted">
          {session
            ? `Signed in as ${session.email} on ${session.baseUrl}. ${status.label}.`
            : "Keep this device in step with your server and your other devices. Works offline; changes sync when you are back online."}
        </Text>
      </View>
      {session ? (
        <>
          <Button label="Sync now" variant="secondary" onPress={() => void syncNow()} />
          <Button
            label="Sign out of this device"
            variant="ghost"
            onPress={() => void signOut().catch((e) => toast.error(String(e)))}
          />
        </>
      ) : (
        <Button label="Sign in to sync" onPress={() => setOpen(true)} />
      )}
      {open ? <SignInSheet onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}
