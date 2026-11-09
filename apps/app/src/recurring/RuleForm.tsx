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

const directions = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const;

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

  const account = accounts.find((a) => a.id === accountId);
  const cats = categoryOptions(categories, direction, categoryId);
  const busy = create.isPending || update.isPending || remove.isPending;
  const payeeError = submitted && payee.trim() === "" ? "Name is required" : undefined;
  const amountError =
    submitted && (amount === null || amount === 0) ? "Enter an amount" : undefined;
  const accountError = submitted && !account ? "Pick an account" : undefined;

  const presetOptions = [
    ...(initialPreset === null && start
      ? [{ value: "keep" as const, label: describeRRule(start.rrule) ?? "Current schedule" }]
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
        toast.success("Recurring item updated");
      } else {
        await create.mutateAsync({
          template,
          rrule,
          nextDate,
          autoDetected: draft?.autoDetected ?? false,
        });
        toast.success("Recurring item added");
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
      toast.success("Recurring item deleted");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete");
    }
  }

  return (
    <Sheet visible onClose={onClose} title={rule ? "Edit recurring item" : "New recurring item"}>
      <Input
        label="Name"
        value={payee}
        onChangeText={setPayee}
        placeholder="e.g. Netflix, Rent"
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
        label="Amount"
        value={amount}
        onChangeValue={setAmount}
        currency={account?.currency ?? "EUR"}
        placeholder="0,00"
        error={amountError}
      />
      <Select
        label="Account"
        options={accounts.map((a) => ({ value: a.id, label: a.name, description: a.currency }))}
        value={accountId}
        onChange={setAccountId}
        error={accountError}
      />
      <Select
        label="Category"
        placeholder="Uncategorised"
        options={cats}
        value={categoryId}
        onChange={setCategoryId}
      />
      <DatePicker label="Next due date" value={nextDate} onChange={setNextDate} />
      <Select label="Repeats" options={presetOptions} value={preset} onChange={setPreset} />
      {rule ? (
        <View className="gap-1.5">
          <Text variant="small" tone="muted" weight="medium">
            Status
          </Text>
          <Tabs
            items={[
              { value: "on", label: "Active" },
              { value: "off", label: "Paused" },
            ]}
            value={active ? "on" : "off"}
            onChange={(v) => setActive(v === "on")}
          />
        </View>
      ) : null}
      <Button label={rule ? "Save changes" : "Add"} loading={busy} onPress={save} />
      {rule ? <Button label="Delete" variant="ghost" onPress={del} /> : null}
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
