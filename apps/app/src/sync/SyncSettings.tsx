import { type AuthClientError, normalizeServerUrl } from "@wallt/sync";
import { Button, Card, Input, Sheet, Text, toast } from "@wallt/ui";
import { useState } from "react";
import { Platform, View } from "react-native";
import { useTranslation } from "../i18n";
import { describeSyncT } from "../i18n/packages";
import { syncNow, useSyncUi } from "./runtime";
import { authClientFor, completeSignIn, signOut } from "./session";

const ERROR_KINDS = [
  "invalid_credentials",
  "invalid_code",
  "locked",
  "rate_limited",
  "expired",
  "offline",
  "server",
] as const;
type ErrorKind = (typeof ERROR_KINDS)[number];
const isErrorKind = (k: unknown): k is ErrorKind => ERROR_KINDS.includes(k as ErrorKind);

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
  const { t } = useTranslation();

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const kind = (e as AuthClientError).kind;
      setError(
        isErrorKind(kind)
          ? t(`sync.errors.${kind}`)
          : e instanceof Error
            ? e.message
            : t("sync.errors.generic"),
      );
      if (kind === "expired") setChallenge(null);
    } finally {
      setBusy(false);
    }
  }

  const baseUrl = normalizeServerUrl(server);

  const step1 = () =>
    run(async () => {
      if (!baseUrl) throw new Error(t("sync.errors.enterServer"));
      const res = await authClientFor(baseUrl).login(email.trim(), password);
      if (res.status === "enrol_required") {
        throw new Error(t("sync.errors.enrolRequired"));
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
      toast.success(t("sync.signIn.done"));
      onClose();
    });

  return (
    <Sheet
      visible
      onClose={onClose}
      title={challenge ? t("sync.signIn.titleCode") : t("sync.signIn.titleServer")}
    >
      {challenge ? (
        <>
          <Input
            label={useRecovery ? t("sync.signIn.recoveryCode") : t("sync.signIn.sixDigitCode")}
            value={code}
            onChangeText={setCode}
            autoFocus
            autoCapitalize="none"
            keyboardType={useRecovery ? "default" : "number-pad"}
            error={error ?? undefined}
          />
          <Button
            label={busy ? t("sync.signIn.checking") : t("sync.signIn.submit")}
            onPress={step2}
            disabled={busy || !code}
          />
          <Button
            label={useRecovery ? t("sync.signIn.useAuthenticator") : t("sync.signIn.useRecovery")}
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
            label={t("sync.signIn.serverAddress")}
            value={server}
            onChangeText={setServer}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            placeholder={t("sync.signIn.serverPlaceholder")}
          />
          <Input
            label={t("sync.signIn.email")}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
          />
          <Input
            label={t("sync.signIn.password")}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            error={error ?? undefined}
          />
          <Button
            label={busy ? t("sync.signIn.checking") : t("sync.signIn.continue")}
            onPress={step1}
            disabled={busy || !email || !password}
          />
        </>
      )}
      <Button label={t("sync.signIn.cancel")} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

/** Settings card: connect this device to the server (password + 2FA), see sync status, sign out. */
export function SyncSetting() {
  const session = useSyncUi((u) => u.session);
  const engine = useSyncUi((u) => u.engine);
  const [open, setOpen] = useState(false);
  const { t } = useTranslation();
  const status = describeSyncT(t, session ? engine : null, Date.now());

  return (
    <Card className="gap-3">
      <View className="gap-1">
        <Text variant="title">{t("sync.settings.title")}</Text>
        <Text variant="small" tone="muted">
          {session
            ? t("sync.settings.signedIn", {
                email: session.email,
                server: session.baseUrl,
                status: status.label,
              })
            : t("sync.settings.signedOut")}
        </Text>
      </View>
      {session ? (
        <>
          <Button
            label={t("sync.settings.syncNow")}
            variant="secondary"
            onPress={() => void syncNow()}
          />
          <Button
            label={t("sync.settings.signOut")}
            variant="ghost"
            onPress={() => void signOut().catch((e) => toast.error(String(e)))}
          />
        </>
      ) : (
        <Button label={t("sync.settings.signInToSync")} onPress={() => setOpen(true)} />
      )}
      {open ? <SignInSheet onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}
