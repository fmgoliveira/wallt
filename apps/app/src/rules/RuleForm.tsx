import { previewRule, validateCondition } from "@wallt/categorize";
import type { Rule, RuleCondition } from "@wallt/core";
import { AmountInput, Button, Input, Select, Sheet, Tabs, Text, toast, useTheme } from "@wallt/ui";
import type { TFunction } from "i18next";
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
import { useTranslation } from "../i18n";
import { useRuleHistory } from "./data";

type Field = RuleCondition["field"];
type Op = RuleCondition["op"];

const fieldOptions = (t: TFunction): { value: Field; label: string }[] => [
  { value: "payee", label: t("rules.field.payee") },
  { value: "description", label: t("rules.field.description") },
  { value: "amount", label: t("rules.field.amount") },
  { value: "account", label: t("rules.field.account") },
  { value: "sign", label: t("rules.field.sign") },
];

const opOptions = (t: TFunction): Record<Field, { value: Op; label: string }[]> => {
  const text = [
    { value: "contains", label: t("rules.op.contains") },
    { value: "equals", label: t("rules.op.equals") },
    { value: "regex", label: t("rules.op.regex") },
  ] satisfies { value: Op; label: string }[];
  return {
    payee: text,
    description: text,
    amount: [
      { value: "gte", label: t("rules.op.gte") },
      { value: "lte", label: t("rules.op.lte") },
      { value: "equals", label: t("rules.op.equals") },
    ],
    account: [{ value: "equals", label: t("rules.op.is") }],
    sign: [{ value: "equals", label: t("rules.op.is") }],
  };
};

const signOptions = (t: TFunction) =>
  [
    { value: "expense", label: t("rules.sign.expense") },
    { value: "income", label: t("rules.sign.income") },
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
  const op: Op =
    field === "amount" ? "gte" : field === "account" || field === "sign" ? "equals" : "contains";
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
  const { t } = useTranslation();
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
  const fields = fieldOptions(t);
  const ops = opOptions(t);
  const signs = signOptions(t);
  const options = useMemo(
    () => [
      ...categoryOptions(categories, "expense", categoryId),
      ...categoryOptions(categories, "income", categoryId).map((o) => ({
        ...o,
        label: t("rules.form.incomePrefix", { label: o.label }),
      })),
    ],
    [categories, categoryId, t],
  );

  const errors = conditions.map((c) => {
    if (c.field === "amount" && c.value === null) return t("rules.form.enterAmount");
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
  const nameError = submitted && name.trim() === "" ? t("rules.form.nameRequired") : undefined;
  const actionError =
    submitted && !categoryId && rename.trim() === "" ? t("rules.form.actionRequired") : undefined;

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
        toast.success(t("rules.form.updated"));
      } else {
        await create.mutateAsync({
          name: name.trim(),
          conditions: toConditions(conditions),
          action,
        });
        toast.success(t("rules.form.added"));
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("rules.form.couldNotSave"));
    }
  }

  async function del() {
    if (!rule) return;
    try {
      await remove.mutateAsync(rule.id);
      toast.success(t("rules.form.deleted"));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("rules.form.couldNotDelete"));
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={rule ? t("rules.form.editTitle") : t("rules.form.newTitle")}
    >
      <Input
        label={t("rules.form.name")}
        value={name}
        onChangeText={setName}
        placeholder={t("rules.form.exampleLidl")}
        error={nameError}
        autoFocus={!rule}
      />

      <View className="gap-3">
        <Text variant="label" tone="muted">
          {t("rules.form.when")}
        </Text>
        {conditions.map((c, i) => (
          <View key={c.key} className="gap-2 rounded-2xl border border-border p-3">
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <Select
                  label={t("rules.form.field")}
                  options={fields}
                  value={c.field}
                  onChange={(field) => patch(c.key, { field, ...defaultsFor(field) })}
                />
              </View>
              {conditions.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("rules.form.removeCondition")}
                  onPress={() => setConditions((all) => all.filter((x) => x.key !== c.key))}
                  className="h-11 w-11 items-center justify-center web:cursor-pointer web:hover:opacity-70"
                >
                  <Trash2 size={18} color={colors.muted} strokeWidth={1.6} />
                </Pressable>
              ) : null}
            </View>
            {ops[c.field].length > 1 ? (
              <Select options={ops[c.field]} value={c.op} onChange={(op) => patch(c.key, { op })} />
            ) : null}
            {c.field === "payee" || c.field === "description" ? (
              <Input
                value={String(c.value ?? "")}
                onChangeText={(value) => patch(c.key, { value })}
                placeholder={
                  c.op === "regex" ? t("rules.form.regexExample") : t("rules.form.textExample")
                }
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
                placeholder={t("rules.form.pickAccount")}
                options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                value={typeof c.value === "string" && c.value !== "" ? c.value : null}
                onChange={(value) => patch(c.key, { value })}
                error={submitted ? (errors[i] ?? undefined) : undefined}
              />
            ) : null}
            {c.field === "sign" ? (
              <Tabs
                items={signs}
                value={c.value === "income" ? "income" : "expense"}
                onChange={(value) => patch(c.key, { value })}
              />
            ) : null}
          </View>
        ))}
        <Button
          label={t("rules.form.addCondition")}
          variant="ghost"
          leading={<Plus size={16} color={colors.muted} strokeWidth={2} />}
          onPress={() => setConditions((all) => [...all, blank()])}
        />
      </View>

      <View className="gap-3">
        <Text variant="label" tone="muted">
          {t("rules.form.thenLabel")}
        </Text>
        <Select
          label={t("rules.form.setCategory")}
          placeholder={t("rules.form.leaveCategory")}
          options={options}
          value={categoryId}
          onChange={setCategoryId}
          error={actionError}
        />
        <Input
          label={t("rules.form.renameTo")}
          value={rename}
          onChangeText={setRename}
          placeholder={t("rules.form.exampleLidl")}
        />
      </View>

      <View className="gap-1 rounded-2xl bg-bg p-3">
        {!allValid ? (
          <Text tone="muted">{t("rules.form.completeConditions")}</Text>
        ) : preview === null ? (
          <Text tone="muted">{t("rules.form.checking")}</Text>
        ) : (
          <>
            <Text weight="medium">{t("rules.form.wouldMatch", { count: preview.matches })}</Text>
            <Text variant="small" tone="muted">
              {categoryId
                ? t("rules.form.previewCategory", {
                    changed: preview.wouldChange,
                    protected: preview.protectedByUser,
                  })
                : t("rules.form.previewRename")}
            </Text>
          </>
        )}
      </View>

      <Button
        label={rule ? t("rules.form.saveChanges") : t("rules.form.addRule")}
        loading={busy}
        onPress={save}
      />
      {rule ? <Button label={t("rules.form.delete")} variant="ghost" onPress={del} /> : null}
      <Button label={t("rules.form.cancel")} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
