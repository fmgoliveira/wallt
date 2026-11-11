import {
  describeRRule,
  presetOf,
  RECURRENCE_PRESETS,
  type RecurrencePreset,
  type RecurringRule,
  rruleForPreset,
} from "@wallt/core";
import {
  AmountInput,
  Button,
  DatePicker,
  Input,
  Select,
  Sheet,
  Tabs,
  Text,
  toast,
} from "@wallt/ui";
import { useState } from "react";
import { View } from "react-native";
import { categoryOptions } from "../categories/options";
import { useAccounts, useCategories } from "../data/hooks";
import {
  todayDate,
  useCreateRecurringRule,
  useDeleteRecurringRule,
  useUpdateRecurringRule,
} from "../data/recurring";
import { useTranslation } from "../i18n";

/** What the form starts from when it is not editing a saved rule (e.g. an accepted suggestion). */
export interface RuleDraft {
  payee: string;
  amount: number;
  currency: string;
  accountId: string;
  categoryId: string | null;
  rrule: string;
  nextDate: string;
  autoDetected?: boolean;
}

/**
 * Create or edit a recurring rule. Mount it only while open: it owns its field state. Saving never posts a
 * transaction: due items are posted from the Upcoming list.
 */
export function RuleForm({
  rule,
  draft,
  onClose,
}: {
  rule?: RecurringRule | undefined;
  draft?: RuleDraft | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateRecurringRule();
  const update = useUpdateRecurringRule();
  const remove = useDeleteRecurringRule();
  const accounts = useAccounts().data ?? [];
  const categories = useCategories({ includeArchived: true }).data ?? [];

  const start = rule
    ? { ...rule.template, rrule: rule.rrule, nextDate: rule.nextDate }
    : (draft ?? null);
  const [payee, setPayee] = useState(start?.payee ?? "");
  const [direction, setDirection] = useState<"expense" | "income">(
    start && start.amount > 0 ? "income" : "expense",
  );
  const [amount, setAmount] = useState<number | null>(start ? Math.abs(start.amount) : null);
  const [accountId, setAccountId] = useState<string | null>(
    start?.accountId ?? accounts[0]?.id ?? null,
  );
  const [categoryId, setCategoryId] = useState<string | null>(start?.categoryId ?? null);
  const [nextDate, setNextDate] = useState(start?.nextDate ?? todayDate());
  // A rule outside the presets (e.g. daily) keeps its own schedule until the user picks a preset.
  const initialPreset = start ? presetOf(start.rrule, start.nextDate) : "monthly";
  const [preset, setPreset] = useState<RecurrencePreset | "keep">(initialPreset ?? "keep");
  const [active, setActive] = useState(rule?.active ?? true);
  const [submitted, setSubmitted] = useState(false);

  const directions = [
    { value: "expense", label: t("recurring.form.expense") },
    { value: "income", label: t("recurring.form.income") },
  ] as const;
  const account = accounts.find((a) => a.id === accountId);
  const cats = categoryOptions(categories, direction, categoryId);
  const busy = create.isPending || update.isPending || remove.isPending;
  const payeeError =
    submitted && payee.trim() === "" ? t("recurring.form.nameRequired") : undefined;
  const amountError =
    submitted && (amount === null || amount === 0) ? t("recurring.form.enterAmount") : undefined;
  const accountError = submitted && !account ? t("recurring.form.pickAccount") : undefined;

  const presetOptions = [
    ...(initialPreset === null && start
      ? [
          {
            value: "keep" as const,
            label: describeRRule(start.rrule) ?? t("recurring.form.currentSchedule"),
          },
        ]
      : []),
    ...RECURRENCE_PRESETS,
  ];

  async function save() {
    setSubmitted(true);
    if (payee.trim() === "" || !amount || !account) return;
    const rrule =
      preset === "keep" && start
        ? start.rrule
        : rruleForPreset(preset === "keep" ? "monthly" : preset, nextDate);
    const template = {
      payee: payee.trim(),
      amount: direction === "expense" ? -amount : amount,
      currency: account.currency,
      accountId: account.id,
      categoryId,
    };
    try {
      if (rule) {
        await update.mutateAsync({ id: rule.id, patch: { template, rrule, nextDate, active } });
        toast.success(t("recurring.form.updated"));
      } else {
        await create.mutateAsync({
          template,
          rrule,
          nextDate,
          autoDetected: draft?.autoDetected ?? false,
        });
        toast.success(t("recurring.form.added"));
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("recurring.form.saveFailed"));
    }
  }

  async function del() {
    if (!rule) return;
    try {
      await remove.mutateAsync(rule.id);
      toast.success(t("recurring.form.deleted"));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("recurring.form.deleteFailed"));
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={rule ? t("recurring.form.titleEdit") : t("recurring.form.titleNew")}
    >
      <Input
        label={t("recurring.form.name")}
        value={payee}
        onChangeText={setPayee}
        placeholder={t("recurring.form.namePlaceholder")}
        error={payeeError}
        autoFocus={!rule}
      />
      <Tabs
        items={directions}
        value={direction}
        onChange={(d) => {
          setDirection(d);
          setCategoryId(null);
        }}
      />
      <AmountInput
        label={t("recurring.form.amount")}
        value={amount}
        onChangeValue={setAmount}
        currency={account?.currency ?? "EUR"}
        placeholder="0,00"
        error={amountError}
      />
      <Select
        label={t("recurring.form.account")}
        options={accounts.map((a) => ({ value: a.id, label: a.name, description: a.currency }))}
        value={accountId}
        onChange={setAccountId}
        error={accountError}
      />
      <Select
        label={t("recurring.form.category")}
        placeholder={t("recurring.form.uncategorised")}
        options={cats}
        value={categoryId}
        onChange={setCategoryId}
      />
      <DatePicker label={t("recurring.form.nextDue")} value={nextDate} onChange={setNextDate} />
      <Select
        label={t("recurring.form.repeats")}
        options={presetOptions}
        value={preset}
        onChange={setPreset}
      />
      {rule ? (
        <View className="gap-1.5">
          <Text variant="small" tone="muted" weight="medium">
            {t("recurring.form.status")}
          </Text>
          <Tabs
            items={[
              { value: "on", label: t("recurring.form.active") },
              { value: "off", label: t("recurring.form.paused") },
            ]}
            value={active ? "on" : "off"}
            onChange={(v) => setActive(v === "on")}
          />
        </View>
      ) : null}
      <Button
        label={rule ? t("recurring.form.saveChanges") : t("recurring.form.add")}
        loading={busy}
        onPress={save}
      />
      {rule ? <Button label={t("recurring.form.delete")} variant="ghost" onPress={del} /> : null}
      <Button label={t("recurring.cancel")} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
