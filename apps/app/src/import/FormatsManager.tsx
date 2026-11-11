import type { ImportProfile } from "@wallt/core";
import {
  exportProfiles,
  isProfileConfig,
  type PortableProfile,
  ProfileImportError,
  parseProfilesJson,
  uniqueName,
} from "@wallt/ingest";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconTile,
  Input,
  ListItem,
  Select,
  Sheet,
  Skeleton,
  Text,
  toast,
  useTheme,
} from "@wallt/ui";
import { ChevronRight, FileSpreadsheet, Plus } from "lucide-react-native";
import { useState } from "react";
import { Platform, Share, View } from "react-native";
import {
  useAccounts,
  useCreateImportProfile,
  useDeleteImportProfile,
  useImportProfiles,
  useUpdateImportProfile,
} from "../data/hooks";
import { useTranslation } from "../i18n";
import { profileImportErrorT } from "../i18n/packages";
import { ImportWizard } from "./ImportWizard";

type View_ = { kind: "list" } | { kind: "setup" } | { kind: "retest"; profile: ImportProfile };

const NO_ACCOUNT = "none";

const toPortable = (p: ImportProfile): PortableProfile => ({
  name: p.name,
  institution: p.institution,
  fingerprints: [...p.fingerprints],
  config: p.config as unknown as PortableProfile["config"],
});

async function copyText(text: string, copied: string): Promise<void> {
  if (Platform.OS === "web" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    toast.success(copied);
    return;
  }
  await Share.share({ message: text });
}

/**
 * Settings -> Import formats (PLAN 5.2): list, set up (the wizard in `setup` mode), edit, duplicate, delete,
 * re-test against a new sample, and JSON export/import. Everything is data, nothing needs a code change.
 */
export function FormatsManager() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const profiles = useImportProfiles();
  const accounts = useAccounts();
  const create = useCreateImportProfile();
  const update = useUpdateImportProfile();
  const remove = useDeleteImportProfile();

  const [view, setView] = useState<View_>({ kind: "list" });
  const [editing, setEditing] = useState<ImportProfile | null>(null);
  const [editName, setEditName] = useState("");
  const [editInstitution, setEditInstitution] = useState("");
  const [editAccount, setEditAccount] = useState<string>(NO_ACCOUNT);
  const [editFingerprints, setEditFingerprints] = useState<string[]>([]);
  const [deleting, setDeleting] = useState<ImportProfile | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [pasted, setPasted] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  const list = profiles.data ?? [];
  const names = list.map((p) => p.name);
  const accountName = (id: string | null) => accounts.data?.find((a) => a.id === id)?.name;

  if (view.kind !== "list") {
    return (
      <View className="gap-4">
        <View className="flex-row items-center justify-between gap-3">
          <Text variant="title">
            {view.kind === "setup"
              ? t("importing.formats.addBank")
              : t("importing.formats.retest", { name: view.profile.name })}
          </Text>
          <Button
            label={t("importing.formats.back")}
            variant="ghost"
            onPress={() => setView({ kind: "list" })}
          />
        </View>
        {view.kind === "retest" ? (
          <Text tone="muted">{t("importing.formats.retestHint")}</Text>
        ) : (
          <Text tone="muted">{t("importing.formats.setupHint")}</Text>
        )}
        <ImportWizard
          mode="setup"
          profile={view.kind === "retest" ? view.profile : undefined}
          onSaved={() => setView({ kind: "list" })}
        />
      </View>
    );
  }

  const openEdit = (p: ImportProfile) => {
    setEditing(p);
    setEditName(p.name);
    setEditInstitution(p.institution ?? "");
    setEditAccount(p.defaultAccountId ?? NO_ACCOUNT);
    setEditFingerprints([...p.fingerprints]);
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await update.mutateAsync({
        id: editing.id,
        patch: {
          name: editName.trim(),
          institution: editInstitution.trim() || null,
          defaultAccountId: editAccount === NO_ACCOUNT ? null : editAccount,
          fingerprints: editFingerprints,
        },
      });
      setEditing(null);
      toast.success(t("importing.formats.updated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("importing.formats.saveFailed"));
    }
  };

  const duplicate = async (p: ImportProfile) => {
    try {
      await create.mutateAsync({
        name: uniqueName(t("importing.formats.copySuffix", { name: p.name }), names),
        institution: p.institution,
        defaultAccountId: p.defaultAccountId,
        fingerprints: [...p.fingerprints],
        config: p.config,
      });
      toast.success(t("importing.formats.duplicated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("importing.formats.duplicateFailed"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      setDeleting(null);
      toast.success(t("importing.formats.deleted"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("importing.formats.deleteFailed"));
    }
  };

  const runImport = async () => {
    try {
      const incoming = parseProfilesJson(pasted);
      const taken = [...names];
      for (const p of incoming) {
        const name = uniqueName(p.name, taken);
        taken.push(name);
        await create.mutateAsync({
          name,
          institution: p.institution,
          fingerprints: p.fingerprints,
          config: p.config as unknown as Record<string, unknown>,
        });
      }
      setImporting(false);
      setPasted("");
      setImportError(null);
      toast.success(t("importing.formats.imported", { count: incoming.length }));
    } catch (e) {
      setImportError(
        e instanceof ProfileImportError
          ? profileImportErrorT(t, e)
          : e instanceof Error
            ? e.message
            : t("importing.formats.importFailed"),
      );
    }
  };

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-2">
        <Button
          label={t("importing.formats.addBank")}
          onPress={() => setView({ kind: "setup" })}
          leading={<Plus size={16} color={colors.accentFg} strokeWidth={1.8} />}
        />
        <Button
          label={t("importing.formats.importJson")}
          variant="secondary"
          onPress={() => setImporting(true)}
        />
        {list.length > 0 ? (
          <Button
            label={t("importing.formats.exportAll")}
            variant="secondary"
            onPress={() => setExporting(exportProfiles(list.map(toPortable)))}
          />
        ) : null}
      </View>

      {profiles.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileSpreadsheet size={20} color={colors.muted} strokeWidth={1.6} />}
            title={t("importing.formats.none")}
            description={t("importing.formats.noneHint")}
            actionLabel={t("importing.formats.addBank")}
            onAction={() => setView({ kind: "setup" })}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {list.map((p, i) => (
            <View key={p.id}>
              <ListItem
                divider={i > 0}
                title={p.name}
                subtitle={[
                  p.institution,
                  accountName(p.defaultAccountId) ? `→ ${accountName(p.defaultAccountId)}` : null,
                  t("importing.formats.layouts", { count: p.fingerprints.length }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                leading={
                  <IconTile>
                    <FileSpreadsheet size={18} color={colors.muted} strokeWidth={1.6} />
                  </IconTile>
                }
                trailing={
                  isProfileConfig(p.config) ? (
                    <ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />
                  ) : (
                    <Chip tone="warning" label={t("importing.formats.unreadable")} />
                  )
                }
                onPress={() => openEdit(p)}
              />
            </View>
          ))}
        </Card>
      )}

      <Sheet
        visible={!!editing}
        onClose={() => setEditing(null)}
        title={t("importing.formats.sheetTitle")}
      >
        <Input label={t("importing.formats.name")} value={editName} onChangeText={setEditName} />
        <Input
          label={t("importing.formats.bank")}
          value={editInstitution}
          onChangeText={setEditInstitution}
          placeholder={t("importing.formats.bankPlaceholder")}
        />
        <Select
          label={t("importing.formats.defaultAccount")}
          options={[
            { value: NO_ACCOUNT, label: t("importing.mapping.none") },
            ...(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name })),
          ]}
          value={editAccount}
          onChange={setEditAccount}
        />
        <View className="gap-1.5">
          <Text variant="small" tone="muted" weight="medium">
            {t("importing.formats.recognised")}
          </Text>
          {editFingerprints.map((f) => (
            <View key={f} className="flex-row items-center justify-between">
              <Text variant="small" tone="muted">
                {f}
              </Text>
              <Button
                label={t("importing.formats.remove")}
                variant="ghost"
                disabled={editFingerprints.length <= 1}
                onPress={() => setEditFingerprints((fs) => fs.filter((x) => x !== f))}
              />
            </View>
          ))}
          <Text variant="small" tone="muted">
            {t("importing.formats.layoutNote")}
          </Text>
        </View>
        <Button
          label={t("importing.formats.save")}
          loading={update.isPending}
          disabled={editName.trim() === ""}
          onPress={saveEdit}
        />
        <View className="flex-row flex-wrap gap-2">
          <Button
            label={t("importing.formats.retestFile")}
            variant="secondary"
            onPress={() => {
              if (!editing) return;
              const p = editing;
              setEditing(null);
              setView({ kind: "retest", profile: p });
            }}
          />
          <Button
            label={t("importing.formats.duplicate")}
            variant="secondary"
            onPress={() => {
              if (!editing) return;
              const p = editing;
              setEditing(null);
              void duplicate(p);
            }}
          />
          <Button
            label={t("importing.formats.export")}
            variant="secondary"
            onPress={() => {
              if (!editing) return;
              const p = editing;
              setEditing(null);
              setExporting(exportProfiles([toPortable(p)]));
            }}
          />
        </View>
        <Button
          label={t("importing.formats.delete")}
          variant="destructive"
          onPress={() => {
            if (!editing) return;
            const p = editing;
            setEditing(null);
            setDeleting(p);
          }}
        />
      </Sheet>

      <Sheet
        visible={!!deleting}
        onClose={() => setDeleting(null)}
        title={t("importing.formats.deleteTitle")}
      >
        <Text tone="muted">
          {t("importing.formats.deleteBody", { name: deleting?.name ?? "" })}
        </Text>
        <Button
          label={t("importing.formats.confirmDelete")}
          variant="destructive"
          loading={remove.isPending}
          onPress={confirmDelete}
        />
        <Button
          label={t("importing.formats.cancel")}
          variant="ghost"
          onPress={() => setDeleting(null)}
        />
      </Sheet>

      <Sheet
        visible={exporting !== null}
        onClose={() => setExporting(null)}
        title={t("importing.formats.exportTitle")}
      >
        <Text tone="muted">{t("importing.formats.exportBody")}</Text>
        <Input
          value={exporting ?? ""}
          multiline
          editable={false}
          accessibilityLabel={t("importing.formats.exportedLabel")}
        />
        <Button
          label={t("importing.formats.copy")}
          onPress={() => exporting && void copyText(exporting, t("importing.formats.copied"))}
        />
      </Sheet>

      <Sheet
        visible={importing}
        onClose={() => {
          setImporting(false);
          setImportError(null);
        }}
        title={t("importing.formats.importJson")}
      >
        <Input
          label={t("importing.formats.pasteLabel")}
          value={pasted}
          onChangeText={(text) => {
            setPasted(text);
            setImportError(null);
          }}
          multiline
          placeholder='{"kind": "wallt-import-profiles", …}'
          error={importError ?? undefined}
        />
        <Button
          label={t("importing.formats.import")}
          loading={create.isPending}
          disabled={pasted.trim() === ""}
          onPress={runImport}
        />
      </Sheet>
    </View>
  );
}
