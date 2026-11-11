import { useQueryClient } from "@tanstack/react-query";
import { DataImportError, tableToCsv } from "@wallt/db";
import { SYNC_TABLES, type SyncTable } from "@wallt/sync";
import { Button, Card, Input, Select, Sheet, Text, toast } from "@wallt/ui";
import { useState } from "react";
import { View } from "react-native";
import { useTranslation } from "../i18n";
import { getDataStore, type SyncSession, syncNow, useSyncUi } from "../sync/runtime";
import { pickJsonText, saveTextFile } from "./files";

const today = () => new Date().toISOString().slice(0, 10);

/** `POST /backups/run`: a fresh server backup. `missing` = the server has no backups configured. */
async function backupFirst(session: SyncSession): Promise<"done" | "missing" | "failed"> {
  try {
    const token = await session.getAccessToken();
    if (!token) return "failed";
    const res = await fetch(`${session.baseUrl.replace(/\/+$/, "")}/backups/run`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    if (res.ok) return "done";
    return res.status === 503 ? "missing" : "failed";
  } catch {
    return "failed";
  }
}

interface PurgeResult {
  total: number;
  remaining: number;
  waitingFor: { name: string }[];
}

/** `POST /sync/purge`: removes this user's deleted rows from the server once every device has applied them. */
async function purgeServer(session: SyncSession): Promise<PurgeResult | null> {
  try {
    const token = await session.getAccessToken();
    if (!token) return null;
    const res = await fetch(`${session.baseUrl.replace(/\/+$/, "")}/sync/purge`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
    return res.ok ? ((await res.json()) as PurgeResult) : null;
  } catch {
    return null;
  }
}

/** Syncs twice (the first sends the deletions, the second tells the server this device has applied them), then purges. */
async function purgeAfterSync(session: SyncSession): Promise<PurgeResult | null> {
  await syncNow();
  await syncNow();
  return purgeServer(session);
}

async function exportJson(): Promise<string> {
  const bundle = await getDataStore().exportBundle(new Date().toISOString());
  const name = `wallt-export-${today()}.json`;
  await saveTextFile(name, "application/json", JSON.stringify(bundle));
  return name;
}

function EraseSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const session = useSyncUi((u) => u.session);
  const client = useQueryClient();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState<null | "backup" | "erase">(null);
  const word = t("yourData.erase.confirmWord");
  const confirmed = typed.trim().toLowerCase() === word.toLowerCase();

  async function run() {
    if (!confirmed || busy) return;
    try {
      if (session) {
        setBusy("backup");
        const backup = await backupFirst(session);
        if (backup === "failed") {
          toast.error(t("yourData.erase.backupFailed"));
          return;
        }
        if (backup === "missing") toast.show(t("yourData.erase.backupMissing"));
      }
      setBusy("erase");
      const deleted = await getDataStore().eraseAll();
      await client.invalidateQueries();
      toast.success(t("yourData.erase.done", { count: deleted }));
      onClose();
      if (session) {
        // pushes the deletions to the server (and through it to the other devices), then removes them there
        const purged = await purgeAfterSync(session);
        if (purged && purged.remaining > 0) {
          toast.show(
            t("yourData.purge.waiting", { names: purged.waitingFor.map((d) => d.name).join(", ") }),
          );
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("yourData.erase.failed"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet
      visible
      onClose={busy ? () => undefined : onClose}
      title={t("yourData.erase.sheetTitle")}
    >
      <Text tone="muted">{t("yourData.erase.hint")}</Text>
      <Text variant="small" tone="muted">
        {session ? t("yourData.erase.warningSynced") : t("yourData.erase.warningLocal")}
      </Text>
      <Button
        label={t("yourData.erase.exportFirst")}
        variant="secondary"
        onPress={() => {
          void exportJson().catch(() => toast.error(t("yourData.exportFailed")));
        }}
      />
      <Input
        label={t("yourData.erase.typeToConfirm", { word })}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      <Button
        label={busy === "backup" ? t("yourData.erase.backingUp") : t("yourData.erase.confirm")}
        variant="destructive"
        disabled={!confirmed || busy !== null}
        onPress={() => void run()}
      />
      <Button
        label={t("yourData.erase.cancel")}
        variant="ghost"
        disabled={busy !== null}
        onPress={onClose}
      />
    </Sheet>
  );
}

/** Settings card: export (JSON / CSV), restore from a JSON export, delete everything. */
export function DataSetting() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const session = useSyncUi((u) => u.session);
  const [table, setTable] = useState<SyncTable>("transactions");
  const [erasing, setErasing] = useState(false);

  const guard = (fn: () => Promise<void>, failed: string) => async () => {
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : failed);
    }
  };

  const onExportJson = guard(async () => {
    toast.success(t("yourData.exported", { name: await exportJson() }));
  }, t("yourData.exportFailed"));

  const onExportCsv = guard(async () => {
    const bundle = await getDataStore().exportBundle(new Date().toISOString());
    const name = `wallt-${table}-${today()}.csv`;
    await saveTextFile(name, "text/csv", tableToCsv(table, bundle.tables[table]));
    toast.success(t("yourData.exported", { name }));
  }, t("yourData.exportFailed"));

  const onPurge = async () => {
    if (!session) return;
    await syncNow();
    const r = await purgeServer(session);
    if (!r) toast.error(t("yourData.purge.failed"));
    else if (r.remaining > 0 && r.waitingFor.length > 0)
      toast.show(
        t("yourData.purge.waiting", { names: r.waitingFor.map((d) => d.name).join(", ") }),
      );
    else if (r.total > 0) toast.success(t("yourData.purge.done", { count: r.total }));
    else toast.show(t("yourData.purge.nothing"));
  };

  const onRestore = async () => {
    try {
      const text = await pickJsonText();
      if (text === null) return;
      const { rows } = await getDataStore().importBundle(
        JSON.parse(text),
        session?.userId ?? "local",
      );
      await client.invalidateQueries();
      void syncNow();
      toast.success(t("yourData.restored", { count: rows }));
    } catch (e) {
      if (e instanceof DataImportError) toast.error(t(`yourData.restoreErrors.${e.code}`));
      else if (e instanceof SyntaxError) toast.error(t("yourData.restoreErrors.invalid"));
      else if (e instanceof Error && e.message === "too large")
        toast.error(t("yourData.restoreErrors.tooLarge"));
      else toast.error(t("yourData.restoreErrors.generic"));
    }
  };

  return (
    <Card className="gap-4">
      <View className="gap-1">
        <Text variant="title">{t("yourData.title")}</Text>
        <Text variant="small" tone="muted">
          {t("yourData.hint")}
        </Text>
      </View>

      <View className="gap-2">
        <Text weight="medium">{t("yourData.exportJson")}</Text>
        <Text variant="small" tone="muted">
          {t("yourData.exportJsonHint")}
        </Text>
        <Button
          label={t("yourData.exportJson")}
          variant="secondary"
          onPress={() => void onExportJson()}
          className="self-start"
        />
      </View>

      <View className="gap-2">
        <Text weight="medium">{t("yourData.exportCsv")}</Text>
        <Text variant="small" tone="muted">
          {t("yourData.exportCsvHint")}
        </Text>
        <Select
          label={t("yourData.pickTable")}
          options={SYNC_TABLES.map((name) => ({
            value: name,
            label: t(`yourData.tables.${name}`),
          }))}
          value={table}
          onChange={setTable}
        />
        <Button
          label={t("yourData.exportCsvAction")}
          variant="secondary"
          onPress={() => void onExportCsv()}
          className="self-start"
        />
      </View>

      <View className="gap-2">
        <Text weight="medium">{t("yourData.restore")}</Text>
        <Text variant="small" tone="muted">
          {t("yourData.restoreHint")}
        </Text>
        <Button
          label={t("yourData.restoreAction")}
          variant="secondary"
          onPress={() => void onRestore()}
          className="self-start"
        />
      </View>

      {session ? (
        <View className="gap-2">
          <Text weight="medium">{t("yourData.purge.title")}</Text>
          <Text variant="small" tone="muted">
            {t("yourData.purge.hint")}
          </Text>
          <Button
            label={t("yourData.purge.action")}
            variant="secondary"
            onPress={() => void onPurge()}
            className="self-start"
          />
        </View>
      ) : null}

      <View className="gap-2">
        <Text weight="medium" tone="negative">
          {t("yourData.erase.title")}
        </Text>
        <Text variant="small" tone="muted">
          {t("yourData.erase.hint")}
        </Text>
        <Button
          label={t("yourData.erase.action")}
          variant="destructive"
          onPress={() => setErasing(true)}
          className="self-start"
        />
      </View>
      {erasing ? <EraseSheet onClose={() => setErasing(false)} /> : null}
    </Card>
  );
}
