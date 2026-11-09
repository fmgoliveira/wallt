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
import { ImportWizard } from "./ImportWizard";

type View_ = { kind: "list" } | { kind: "setup" } | { kind: "retest"; profile: ImportProfile };

const NO_ACCOUNT = "none";

const toPortable = (p: ImportProfile): PortableProfile => ({
  name: p.name,
  institution: p.institution,
  fingerprints: [...p.fingerprints],
  config: p.config as unknown as PortableProfile["config"],
});

async function copyText(text: string): Promise<void> {
  if (Platform.OS === "web" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to the clipboard");
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
            {view.kind === "setup" ? "Add bank format" : `Re-test “${view.profile.name}”`}
          </Text>
          <Button label="Back" variant="ghost" onPress={() => setView({ kind: "list" })} />
        </View>
        {view.kind === "retest" ? (
          <Text tone="muted">
            Upload a new sample to check this format still reads it. If the layout changed, saving
            teaches the format the new layout.
          </Text>
        ) : (
          <Text tone="muted">
            Upload one sample export. Wallt detects the layout; fix anything it got wrong and save.
            Nothing is imported while you set up a format.
          </Text>
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
      toast.success("Format updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    }
  };

  const duplicate = async (p: ImportProfile) => {
    try {
      await create.mutateAsync({
        name: uniqueName(`${p.name} copy`, names),
        institution: p.institution,
        defaultAccountId: p.defaultAccountId,
        fingerprints: [...p.fingerprints],
        config: p.config,
      });
      toast.success("Format duplicated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not duplicate");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await remove.mutateAsync(deleting.id);
      setDeleting(null);
      toast.success("Format deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
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
      toast.success(`Imported ${incoming.length} format${incoming.length === 1 ? "" : "s"}`);
    } catch (e) {
      setImportError(
        e instanceof ProfileImportError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not import",
      );
    }
  };

  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Add bank format"
          onPress={() => setView({ kind: "setup" })}
          leading={<Plus size={16} color={colors.accentFg} strokeWidth={1.8} />}
        />
        <Button label="Import from JSON" variant="secondary" onPress={() => setImporting(true)} />
        {list.length > 0 ? (
          <Button
            label="Export all"
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
            title="No formats yet"
            description="A format remembers how one bank's export is laid out, so importing it again takes one click. They are also saved the first time you import a new file."
            actionLabel="Add bank format"
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
                  `${p.fingerprints.length} layout${p.fingerprints.length === 1 ? "" : "s"}`,
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
                    <Chip tone="warning" label="Unreadable" />
                  )
                }
                onPress={() => openEdit(p)}
              />
            </View>
          ))}
        </Card>
      )}

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title="Import format">
        <Input label="Name" value={editName} onChangeText={setEditName} />
        <Input
          label="Bank (optional)"
          value={editInstitution}
          onChangeText={setEditInstitution}
          placeholder="e.g. Banco Exemplo"
        />
        <Select
          label="Default account"
          options={[
            { value: NO_ACCOUNT, label: "None" },
            ...(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name })),
          ]}
          value={editAccount}
          onChange={setEditAccount}
        />
        <View className="gap-1.5">
          <Text variant="small" tone="muted" weight="medium">
            Layouts it recognises
          </Text>
          {editFingerprints.map((f) => (
            <View key={f} className="flex-row items-center justify-between">
              <Text variant="small" tone="muted">
                {f}
              </Text>
              <Button
                label="Remove"
                variant="ghost"
                disabled={editFingerprints.length <= 1}
                onPress={() => setEditFingerprints((fs) => fs.filter((x) => x !== f))}
              />
            </View>
          ))}
          <Text variant="small" tone="muted">
            A bank that changes its export gets a new layout: re-test with a new sample to add it.
          </Text>
        </View>
        <Button
          label="Save"
          loading={update.isPending}
          disabled={editName.trim() === ""}
          onPress={saveEdit}
        />
        <View className="flex-row flex-wrap gap-2">
          <Button
            label="Re-test with a file"
            variant="secondary"
            onPress={() => {
              if (!editing) return;
              const p = editing;
              setEditing(null);
              setView({ kind: "retest", profile: p });
            }}
          />
          <Button
            label="Duplicate"
            variant="secondary"
            onPress={() => {
              if (!editing) return;
              const p = editing;
              setEditing(null);
              void duplicate(p);
            }}
          />
          <Button
            label="Export"
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
          label="Delete format"
          variant="destructive"
          onPress={() => {
            if (!editing) return;
            const p = editing;
            setEditing(null);
            setDeleting(p);
          }}
        />
      </Sheet>

      <Sheet visible={!!deleting} onClose={() => setDeleting(null)} title="Delete this format?">
        <Text tone="muted">
          “{deleting?.name}” is removed. Imported transactions are not affected; the next file from
          this bank will be detected from scratch.
        </Text>
        <Button
          label="Delete"
          variant="destructive"
          loading={remove.isPending}
          onPress={confirmDelete}
        />
        <Button label="Cancel" variant="ghost" onPress={() => setDeleting(null)} />
      </Sheet>

      <Sheet visible={exporting !== null} onClose={() => setExporting(null)} title="Export formats">
        <Text tone="muted">
          Keep this text, or paste it into Import from JSON on another install.
        </Text>
        <Input
          value={exporting ?? ""}
          multiline
          editable={false}
          accessibilityLabel="Exported formats"
        />
        <Button label="Copy" onPress={() => exporting && void copyText(exporting)} />
      </Sheet>

      <Sheet
        visible={importing}
        onClose={() => {
          setImporting(false);
          setImportError(null);
        }}
        title="Import from JSON"
      >
        <Input
          label="Paste exported formats"
          value={pasted}
          onChangeText={(t) => {
            setPasted(t);
            setImportError(null);
          }}
          multiline
          placeholder='{"kind": "wallt-import-profiles", …}'
          error={importError ?? undefined}
        />
        <Button
          label="Import"
          loading={create.isPending}
          disabled={pasted.trim() === ""}
          onPress={runImport}
        />
      </Sheet>
    </View>
  );
}
