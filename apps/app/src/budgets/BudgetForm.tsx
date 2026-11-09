import { type Budget, fromLocalDate, startOfMonth } from "@wallt/core";
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
  useTheme,
} from "@wallt/ui";
import { useState } from "react";
import { View } from "react-native";
import { currencyOptions } from "../accounts/meta";
import { categoryTint } from "../categories/color";
import { categoryOptions } from "../categories/options";
import { displayColor } from "../components/colors";
import { ToggleChip } from "../components/ToggleChip";
import {
  useAccounts,
  useCategories,
  useCreateBudget,
  useDeleteBudget,
  useTags,
  useUpdateBudget,
} from "../data/hooks";

const periods = [
  { value: "month", label: "Monthly" },
  { value: "week", label: "Weekly" },
  { value: "custom", label: "Custom" },
] as const;

const rolloverItems = [
  { value: "no", label: "Off" },
  { value: "yes", label: "On" },
] as const;

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

/** Create or edit a budget (sheet on phone, dialog on desktop). Mount it only while open: it owns its field state. */
export function BudgetForm({
  budget,
  onClose,
}: {
  budget?: Budget | undefined;
  onClose: () => void;
}) {
  const { scheme } = useTheme();
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const remove = useDeleteBudget();
  const accounts = useAccounts().data ?? [];
  const categories = useCategories({ includeArchived: true }).data ?? [];
  const tags = useTags().data ?? [];

  const today = fromLocalDate(new Date());
  const [name, setName] = useState(budget?.name ?? "");
  const [period, setPeriod] = useState<Budget["period"]>(budget?.period ?? "month");
  const [start, setStart] = useState(budget?.start ?? startOfMonth(today));
  const [end, setEnd] = useState(budget?.end ?? "");
  const [amount, setAmount] = useState<number | null>(budget?.amount ?? null);
  const [currency, setCurrency] = useState(budget?.currency ?? accounts[0]?.currency ?? "EUR");
  const [rollover, setRollover] = useState<"yes" | "no">(budget?.rollover ? "yes" : "no");
  const [categoryIds, setCategoryIds] = useState<string[]>(budget?.scope.categoryIds ?? []);
  const [tagIds, setTagIds] = useState<string[]>(budget?.scope.tagIds ?? []);
  const [accountIds, setAccountIds] = useState<string[]>(budget?.scope.accountIds ?? []);
  const [submitted, setSubmitted] = useState(false);

  const nameError = submitted && name.trim() === "" ? "Name is required" : undefined;
  const amountError = submitted && amount === null ? "Enter an amount" : undefined;
  const endError =
    submitted && period === "custom" && end === ""
      ? "A custom period needs an end date"
      : submitted && end !== "" && end < start
        ? "End is before the start"
        : undefined;
  const busy = create.isPending || update.isPending || remove.isPending;
  const cats = categoryOptions(categories, "expense");

  async function save() {
    setSubmitted(true);
    if (name.trim() === "" || amount === null) return;
    if (period === "custom" && end === "") return;
    if (end !== "" && end < start) return;
    const values = {
      name: name.trim(),
      period,
      start,
      end: end === "" ? null : end,
      amount,
      currency,
      rollover: period !== "custom" && rollover === "yes",
      scope: { categoryIds, tagIds, accountIds },
    };
    try {
      if (budget) {
        await update.mutateAsync({ id: budget.id, patch: values });
        toast.success("Budget updated");
      } else {
        await create.mutateAsync(values);
        toast.success("Budget added");
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the budget");
    }
  }

  async function del() {
    if (!budget) return;
    try {
      await remove.mutateAsync(budget.id);
      toast.success("Budget deleted");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the budget");
    }
  }

  return (
    <Sheet visible onClose={onClose} title={budget ? "Edit budget" : "New budget"}>
      <Input
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Groceries"
        error={nameError}
        autoFocus
      />
      <View className="gap-1.5">
        <Text variant="small" tone="muted" weight="medium">
          Period
        </Text>
        <Tabs items={periods} value={period} onChange={setPeriod} />
      </View>
      <AmountInput
        label={
          period === "week" ? "Amount per week" : period === "month" ? "Amount per month" : "Amount"
        }
        value={amount}
        onChangeValue={setAmount}
        currency={currency}
        placeholder="0,00"
        error={amountError}
      />
      <Select label="Currency" options={currencyOptions} value={currency} onChange={setCurrency} />
      <DatePicker label="Starts" value={start} onChange={setStart} />
      <DatePicker
        label={period === "custom" ? "Ends" : "Ends (optional)"}
        value={end}
        onChange={setEnd}
        clearable={period !== "custom"}
        error={endError}
      />
      {period === "custom" ? null : (
        <View className="gap-1.5">
          <Text variant="small" tone="muted" weight="medium">
            Carry unspent money over to the next period
          </Text>
          <Tabs items={rolloverItems} value={rollover} onChange={setRollover} />
        </View>
      )}

      <View className="gap-1.5">
        <Text variant="small" tone="muted" weight="medium">
          Categories (none = all spending)
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {cats.map((c) => (
            <ToggleChip
              key={c.value}
              label={c.label}
              color={categoryTint(
                categories.find((x) => x.id === c.value),
                categories,
                scheme,
              )}
              selected={categoryIds.includes(c.value)}
              onPress={() => setCategoryIds(toggle(categoryIds, c.value))}
            />
          ))}
        </View>
      </View>
      {tags.length > 0 ? (
        <View className="gap-1.5">
          <Text variant="small" tone="muted" weight="medium">
            Tags
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {tags.map((t) => (
              <ToggleChip
                key={t.id}
                label={t.name}
                selected={tagIds.includes(t.id)}
                onPress={() => setTagIds(toggle(tagIds, t.id))}
              />
            ))}
          </View>
        </View>
      ) : null}
      {accounts.length > 1 ? (
        <View className="gap-1.5">
          <Text variant="small" tone="muted" weight="medium">
            Accounts
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {accounts.map((a) => (
              <ToggleChip
                key={a.id}
                label={a.name}
                color={displayColor(a.color, a.id, scheme)}
                selected={accountIds.includes(a.id)}
                onPress={() => setAccountIds(toggle(accountIds, a.id))}
              />
            ))}
          </View>
        </View>
      ) : null}

      <Button label={budget ? "Save changes" : "Add budget"} loading={busy} onPress={save} />
      {budget ? <Button label="Delete budget" variant="ghost" onPress={del} /> : null}
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
