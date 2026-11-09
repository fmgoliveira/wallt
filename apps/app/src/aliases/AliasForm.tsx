import { aliasPatternKind, previewAlias } from "@wallt/categorize";
import type { PayeeAlias } from "@wallt/core";
import { Button, Input, Sheet, Text, toast } from "@wallt/ui";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useCreatePayeeAlias, useDeletePayeeAlias, useUpdatePayeeAlias } from "../data/hooks";
import { useRuleHistory } from "../rules/data";

/** Create or edit a payee alias, with a live count of the transactions it matches. */
export function AliasForm({
  alias,
  onClose,
}: {
  alias?: PayeeAlias | undefined;
  onClose: () => void;
}) {
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
        toast.success("Payee name updated");
      } else {
        await create.mutateAsync({ pattern, payee: payee.trim() });
        toast.success("Payee name added");
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    }
  }

  async function del() {
    if (!alias) return;
    try {
      await remove.mutateAsync(alias.id);
      toast.success("Payee name deleted");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  }

  return (
    <Sheet visible onClose={onClose} title={alias ? "Edit payee name" : "New payee name"}>
      <Input
        label="When the description matches"
        value={pattern}
        onChangeText={setPattern}
        placeholder="e.g. pingo\s*doce"
        error={submitted && pattern.trim() === "" ? "Enter some text or a pattern" : undefined}
        autoFocus={!alias}
      />
      {pattern.trim() !== "" ? (
        <Text variant="small" tone="muted">
          {aliasPatternKind(pattern) === "regex"
            ? "Not case sensitive. Characters like . * + ( ) [ ] have a special meaning in patterns."
            : "Not a valid pattern, so it matches this exact text anywhere in the description."}
        </Text>
      ) : null}
      <Input
        label="Show the payee as"
        value={payee}
        onChangeText={setPayee}
        placeholder="e.g. Pingo Doce"
        error={submitted && payee.trim() === "" ? "Payee name is required" : undefined}
      />
      <View className="gap-1 rounded-2xl bg-bg p-3">
        {preview === null ? (
          <Text tone="muted">Type a pattern to see what it matches.</Text>
        ) : (
          <>
            <Text weight="medium">
              Matches {preview.matches} transaction{preview.matches === 1 ? "" : "s"}
            </Text>
            <Text variant="small" tone="muted">
              {preview.wouldRename} would be renamed when you apply it to existing transactions.
            </Text>
          </>
        )}
      </View>
      <Button label={alias ? "Save changes" : "Add"} loading={busy} onPress={save} />
      {alias ? <Button label="Delete" variant="ghost" onPress={del} /> : null}
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
