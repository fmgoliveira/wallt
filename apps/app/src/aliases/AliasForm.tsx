import { aliasPatternKind, previewAlias } from "@wallt/categorize";
import type { PayeeAlias } from "@wallt/core";
import { Button, Input, Sheet, Text, toast } from "@wallt/ui";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useCreatePayeeAlias, useDeletePayeeAlias, useUpdatePayeeAlias } from "../data/hooks";
import { useTranslation } from "../i18n";
import { useRuleHistory } from "../rules/data";

/** Create or edit a payee alias, with a live count of the transactions it matches. */
export function AliasForm({
  alias,
  onClose,
}: {
  alias?: PayeeAlias | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreatePayeeAlias();
  const update = useUpdatePayeeAlias();
  const remove = useDeletePayeeAlias();
  const history = useRuleHistory();
  const [pattern, setPattern] = useState(alias?.pattern ?? "");
  const [payee, setPayee] = useState(alias?.payee ?? "");
  const [submitted, setSubmitted] = useState(false);

  const preview = useMemo(
    () =>
      pattern.trim() === "" || !history.data
        ? null
        : previewAlias({ pattern, payee }, history.data),
    [pattern, payee, history.data],
  );
  const busy = create.isPending || update.isPending || remove.isPending;

  async function save() {
    setSubmitted(true);
    if (pattern.trim() === "" || payee.trim() === "") return;
    try {
      if (alias) {
        await update.mutateAsync({ id: alias.id, patch: { pattern, payee: payee.trim() } });
        toast.success(t("aliases.form.updated"));
      } else {
        await create.mutateAsync({ pattern, payee: payee.trim() });
        toast.success(t("aliases.form.added"));
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("aliases.form.couldNotSave"));
    }
  }

  async function del() {
    if (!alias) return;
    try {
      await remove.mutateAsync(alias.id);
      toast.success(t("aliases.form.deleted"));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("aliases.form.couldNotDelete"));
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={alias ? t("aliases.form.editTitle") : t("aliases.form.newTitle")}
    >
      <Input
        label={t("aliases.form.pattern")}
        value={pattern}
        onChangeText={setPattern}
        placeholder={t("aliases.form.patternExample")}
        error={submitted && pattern.trim() === "" ? t("aliases.form.patternRequired") : undefined}
        autoFocus={!alias}
      />
      {pattern.trim() !== "" ? (
        <Text variant="small" tone="muted">
          {aliasPatternKind(pattern) === "regex"
            ? t("aliases.form.regexHint")
            : t("aliases.form.textHint")}
        </Text>
      ) : null}
      <Input
        label={t("aliases.form.payee")}
        value={payee}
        onChangeText={setPayee}
        placeholder={t("aliases.form.payeeExample")}
        error={submitted && payee.trim() === "" ? t("aliases.form.payeeRequired") : undefined}
      />
      <View className="gap-1 rounded-2xl bg-bg p-3">
        {preview === null ? (
          <Text tone="muted">{t("aliases.form.typePattern")}</Text>
        ) : (
          <>
            <Text weight="medium">{t("aliases.form.matches", { count: preview.matches })}</Text>
            <Text variant="small" tone="muted">
              {t("aliases.form.wouldRename", { n: preview.wouldRename })}
            </Text>
          </>
        )}
      </View>
      <Button
        label={alias ? t("aliases.form.saveChanges") : t("aliases.form.add")}
        loading={busy}
        onPress={save}
      />
      {alias ? <Button label={t("aliases.form.delete")} variant="ghost" onPress={del} /> : null}
      <Button label={t("aliases.form.cancel")} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
