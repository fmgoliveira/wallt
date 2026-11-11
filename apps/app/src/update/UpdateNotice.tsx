import { Chip } from "@wallt/ui";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Linking, Platform, Pressable } from "react-native";
import { useTranslation } from "../i18n";
import { useSyncUi } from "../sync/runtime";
import { isNewerVersion } from "./version";

const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
let lastCheck = 0;
let cached: string | null = null;

/** The version the server reports on `/health`, or null (older server, offline, unreadable). */
async function serverVersion(baseUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`);
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}

/**
 * Android only: when your server runs a newer release than this app, say so and link to the release (the APK is
 * attached to it). The web app is served by the server, so it is always current. No third-party service is called:
 * the version comes from the server you already sync with.
 */
export function UpdateNotice() {
  const { t } = useTranslation();
  const baseUrl = useSyncUi((u) => u.session?.baseUrl ?? null);
  const [latest, setLatest] = useState<string | null>(cached);
  const appVersion = Constants.expoConfig?.version ?? "0.0.0";
  const releasesUrl = (Constants.expoConfig?.extra as { releasesUrl?: string } | undefined)
    ?.releasesUrl;

  useEffect(() => {
    if (Platform.OS === "web" || !baseUrl) return;
    if (Date.now() - lastCheck < CHECK_EVERY_MS) return;
    lastCheck = Date.now();
    void serverVersion(baseUrl).then((v) => {
      cached = v;
      setLatest(v);
    });
  }, [baseUrl]);

  if (Platform.OS === "web" || !baseUrl || !latest || !isNewerVersion(latest, appVersion)) {
    return null;
  }
  const label = t("common.update.available", { version: latest });
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t("common.update.openLabel", { version: latest })}
      onPress={() => {
        if (releasesUrl) void Linking.openURL(`${releasesUrl}/tag/v${latest}`);
      }}
      className="web:cursor-pointer"
    >
      <Chip tone="warning" label={label} />
    </Pressable>
  );
}
