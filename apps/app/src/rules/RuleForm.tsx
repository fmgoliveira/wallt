import { previewRule, validateCondition } from "@wallt/categorize";
import type { Rule, RuleCondition } from "@wallt/core";
import { AmountInput, Button, Input, Select, Sheet, Tabs, Text, toast, useTheme } from "@wallt/ui";
import { Plus, Trash2 } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { categoryOptions } from "../categories/options";
import {
  useAccounts,
  useCategories,
  useCreateRule,
  useDeleteRule,
  useUpdateRule,
} from "../data/hooks";
import { useRuleHistory } from "./data";

type Field = RuleCondition["field"];
type Op = RuleCondition["op"];

const FIELDS: { value: Field; label: string }[] = [
  { value: "payee", label: "Payee" },
  { value: "description", label: "Description" },
  { value: "amount", label: "Amount" },
  { value: "account", label: "Account" },
  { value: "sign", label: "Money" },
];

const OPS: Record<Field, { value: Op; label: string }[]> = {
  payee: [
    { value: "contains", label: "contains" },
    { value: "equals", label: "is exactly" },
    { value: "regex", label: "matches pattern" },
  ],
  description: [
    { value: "contains", label: "contains" },
    { value: "equals", label: "is exactly" },
    { value: "regex", label: "matches pattern" },
  ],
  amount: [
    { value: "gte", label: "is at least" },
    { value: "lte", label: "is at most" },
    { value: "equals", label: "is exactly" },
  ],
  account: [{ value: "equals", label: "is" }],
  sign: [{ value: "equals", label: "is" }],
};

const SIGNS = [
  { value: "expense", label: "Money out" },
  { value: "income", label: "Money in" },
] as const;

/** A condition while it is being edited: the value may be empty. */
interface Draft {
  key: number;
  field: Field;
  op: Op;
  value: string | number | null;
}

/** What the form starts from when it is not editing a saved rule ("create a rule from this transaction"). */
export interface RuleDraft {
  name: string;
  conditions: RuleCondition[];
  categoryId: string | null;
}

let nextKey = 1;
const toConditions = (drafts: readonly Draft[]): RuleCondition[] =>
  drafts.map((c) => ({ field: c.field, op: c.op, value: c.value ?? "" }) as RuleCondition);
const toDraft = (c: RuleCondition): Draft => ({ ...c, key: nextKey++ });
const blank = (): Draft => ({ key: nextKey++, field: "payee", op: "contains", value: "" });

function defaultsFor(field: Field): Pick<Draft, "op" | "value"> {
  const op = (OPS[field][0] as { value: Op }).value;
  return { op, value: field === "amount" ? null : field === "sign" ? "expense" : "" };
}

/** Create or edit a categorization rule, with a live count of the transactions it would match. */
export function RuleForm({
  rule,
  draft,
  onClose,
}: {
  rule?: Rule | undefined;
  draft?: RuleDraft | undefined;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const create = useCreateRule();
  const update = useUpdateRule();
  const remove = useDeleteRule();
  const accounts = useAccounts({ includeArchived: true }).data ?? [];
  const categories = useCategories({ includeArchived: true }).data ?? [];
  const history = useRuleHistory();

  const start = rule ?? draft ?? null;
  const [name, setName] = useState(start?.name ?? "");
  const [conditions, setConditions] = useState<Draft[]>(
    start && start.conditions.length > 0 ? start.conditions.map(toDraft) : [blank()],
  );
  const [categoryId, setCategoryId] = useState<string | null>(
    rule ? (rule.action.categoryId ?? null) : (draft?.categoryId ?? null),
  );
  const [rename, setRename] = useState(rule?.action.payeeRename ?? "");
  const [submitted, setSubmitted] = useState(false);

  const currency = accounts[0]?.currency ?? "EUR";
  const options = useMemo(
    () => [
      ...categoryOptions(categories, "expense", categoryId),
      ...categoryOptions(categories, "income", categoryId).map((o) => ({
        ...o,
        label: `Income › ${o.label}`,
      })),
    ],
    [categories, categoryId],
  );

  const errors = conditions.map((c) => {
    if (c.field === "amount" && c.value === null) return "Enter an amount";
    return validateCondition({ field: c.field, op: c.op, value: c.value ?? "" } as RuleCondition);
  });
  const allValid = errors.every((e) => e === null);

  const preview = useMemo(() => {
    if (!allValid || !history.data) return null;
    return previewRule(
      { conditions: toConditions(conditions), action: categoryId ? { categoryId } : {} },
      history.data,
    );
  }, [allValid, conditions, categoryId, history.data]);

  const patch = (key: number, change: Partial<Draft>) =>
    setConditions((all) => all.map((c) => (c.key === key ? { ...c, ...change } : c)));

  const busy = create.isPending || update.isPending || remove.isPending;
  const nameError = submitted && name.trim() === "" ? "Name is required" : undefined;
  const actionError =
    submitted && !categoryId && rename.trim() === ""
      ? "Pick a category or a new payee name"
      : undefined;

  async function save() {
    setSubmitted(true);
    if (name.trim() === "" || !allValid || (!categoryId && rename.trim() === "")) return;
    const action = {
      ...(rule?.action.tagIds ? { tagIds: rule.action.tagIds } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(rename.trim() ? { payeeRename: rename.trim() } : {}),
    };
    try {
      if (rule) {
        await update.mutateAsync({
          id: rule.id,
          patch: { name: name.trim(), conditions: toConditions(conditions), action },
        });
        toast.success("Rule updated");
      } else {
        await create.mutateAsync({
          name: name.trim(),
          conditions: toConditions(conditions),
          action,
        });
        toast.success("Rule added");
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    }
  }

  async function del() {
    if (!rule) return;
    try {
      await remove.mutateAsync(rule.id);
      toast.success("Rule deleted");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  }

  return (
    <Sheet visible onClose={onClose} title={rule ? "Edit rule" : "New rule"}>
      <Input
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Lidl"
        error={nameError}
        autoFocus={!rule}
      />

      <View className="gap-3">
        <Text variant="label" tone="muted">
          When all of these are true
        </Text>
        {conditions.map((c, i) => (
          <View key={c.key} className="gap-2 rounded-2xl border border-border p-3">
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <Select
                  label="Field"
                  options={FIELDS}
                  value={c.field}
                  onChange={(field) => patch(c.key, { field, ...defaultsFor(field) })}
                />
              </View>
              {conditions.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove condition"
                  onPress={() => setConditions((all) => all.filter((x) => x.key !== c.key))}
                  className="h-11 w-11 items-center justify-center web:cursor-pointer web:hover:opacity-70"
                >
                  <Trash2 size={18} color={colors.muted} strokeWidth={1.6} />
                </Pressable>
              ) : null}
            </View>
            {OPS[c.field].length > 1 ? (
              <Select options={OPS[c.field]} value={c.op} onChange={(op) => patch(c.key, { op })} />
            ) : null}
            {c.field === "payee" || c.field === "description" ? (
              <Input
                value={String(c.value ?? "")}
                onChangeText={(value) => patch(c.key, { value })}
                placeholder={c.op === "regex" ? "e.g. ^PINGO\\s+DOCE" : "e.g. continente"}
                error={submitted ? (errors[i] ?? undefined) : undefined}
              />
            ) : null}
            {c.field === "amount" ? (
              <AmountInput
                value={typeof c.value === "number" ? c.value : null}
                onChangeValue={(value) => patch(c.key, { value })}
                currency={currency}
                placeholder="0,00"
                error={submitted ? (errors[i] ?? undefined) : undefined}
              />
            ) : null}
            {c.field === "account" ? (
              <Select
                placeholder="Pick an account"
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                value={typeof c.value === "string" && c.value !== "" ? c.value : null}
                onChange={(value) => patch(c.key, { value })}
                error={submitted ? (errors[i] ?? undefined) : undefined}
              />
            ) : null}
            {c.field === "sign" ? (
              <Tabs
                items={SIGNS}
                value={c.value === "income" ? "income" : "expense"}
                onChange={(value) => patch(c.key, { value })}
              />
            ) : null}
          </View>
        ))}
        <Button
          label="Add condition"
          variant="ghost"
          leading={<Plus size={16} color={colors.muted} strokeWidth={2} />}
          onPress={() => setConditions((all) => [...all, blank()])}
        />
      </View>

      <View className="gap-3">
        <Text variant="label" tone="muted">
          Then
        </Text>
        <Select
          label="Set category"
          placeholder="Leave the category alone"
          options={options}
          value={categoryId}
          onChange={setCategoryId}
          error={actionError}
        />
        <Input
          label="Rename payee to (optional)"
          value={rename}
          onChangeText={setRename}
          placeholder="e.g. Lidl"
        />
      </View>

      <View className="gap-1 rounded-2xl bg-bg p-3">
        {!allValid ? (
          <Text tone="muted">Complete the conditions to see what this rule would match.</Text>
        ) : preview === null ? (
          <Text tone="muted">Checking your history…</Text>
        ) : (
          <>
            <Text weight="medium">
              Would match {preview.matches} transaction{preview.matches === 1 ? "" : "s"}
            </Text>
            <Text variant="small" tone="muted">
              {categoryId
                ? `${preview.wouldChange} would get this category. ${preview.protectedByUser} you categorised yourself stay as they are.`
                : "Without a category it only renames the payee on new imports."}
            </Text>
          </>
        )}
      </View>

      <Button label={rule ? "Save changes" : "Add rule"} loading={busy} onPress={save} />
      {rule ? <Button label="Delete" variant="ghost" onPress={del} /> : null}
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
