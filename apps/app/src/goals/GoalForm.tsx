import type { Goal } from "@wallt/core";
import {
  AmountInput,
  Button,
  DatePicker,
  Input,
  Select,
  Sheet,
  Text,
  toast,
  useTheme,
} from "@wallt/ui";
import { useState } from "react";
import { View } from "react-native";
import { currencyOptions } from "../accounts/meta";
import { ColorPicker } from "../components/ColorPicker";
import { displayColor } from "../components/colors";
import { ToggleChip } from "../components/ToggleChip";
import { useCreateGoal, useDeleteGoal, useUpdateGoal } from "../data/goals";
import { useAccounts } from "../data/hooks";

/** Create or edit a savings goal. Mount it only while open: it owns its field state. */
export function GoalForm({ goal, onClose }: { goal?: Goal | undefined; onClose: () => void }) {
  const { scheme } = useTheme();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const remove = useDeleteGoal();
  const accounts = useAccounts().data ?? [];

  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState<number | null>(goal?.targetAmount ?? null);
  const [currency, setCurrency] = useState(goal?.currency ?? accounts[0]?.currency ?? "EUR");
  const [deadline, setDeadline] = useState(goal?.deadline ?? "");
  const [accountIds, setAccountIds] = useState<string[]>(goal?.accountIds ?? []);
  const [colorHex, setColorHex] = useState<string | null>(goal?.color ?? null);
  const [submitted, setSubmitted] = useState(false);

  const nameError = submitted && name.trim() === "" ? "Name is required" : undefined;
  const targetError = submitted && !target ? "Enter a target amount" : undefined;
  const busy = create.isPending || update.isPending || remove.isPending;
  const usable = accounts.filter((a) => a.currency === currency);

  async function save() {
    setSubmitted(true);
    if (name.trim() === "" || !target) return;
    const values = {
      name: name.trim(),
      targetAmount: target,
      currency,
      deadline: deadline === "" ? null : deadline,
      accountIds: accountIds.filter((id) => usable.some((a) => a.id === id)),
      color: colorHex,
    };
    try {
      if (goal) {
        await update.mutateAsync({ id: goal.id, patch: values });
        toast.success("Goal updated");
      } else {
        await create.mutateAsync(values);
        toast.success("Goal added");
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the goal");
    }
  }

  async function del() {
    if (!goal) return;
    try {
      await remove.mutateAsync(goal.id);
      toast.success("Goal deleted");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the goal");
    }
  }

  return (
    <Sheet visible onClose={onClose} title={goal ? "Edit goal" : "New goal"}>
      <Input
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Holiday fund"
        error={nameError}
        autoFocus={!goal}
      />
      <AmountInput
        label="Target"
        value={target}
        onChangeValue={setTarget}
        currency={currency}
        placeholder="0,00"
        error={targetError}
      />
      <Select label="Currency" options={currencyOptions} value={currency} onChange={setCurrency} />
      <DatePicker label="Deadline (optional)" value={deadline} onChange={setDeadline} clearable />
      <View className="gap-1.5">
        <Text variant="small" tone="muted" weight="medium">
          Accounts that hold this money
        </Text>
        {usable.length === 0 ? (
          <Text variant="small" tone="muted">
            No account in {currency} yet.
          </Text>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            {usable.map((a) => (
              <ToggleChip
                key={a.id}
                label={a.name}
                color={displayColor(a.color, a.id, scheme)}
                selected={accountIds.includes(a.id)}
                onPress={() =>
                  setAccountIds(
                    accountIds.includes(a.id)
                      ? accountIds.filter((x) => x !== a.id)
                      : [...accountIds, a.id],
                  )
                }
              />
            ))}
          </View>
        )}
        <Text variant="small" tone="muted">
          Progress is the combined balance of these accounts.
        </Text>
      </View>
      <ColorPicker value={colorHex} onChange={setColorHex} />
      <Button label={goal ? "Save changes" : "Add goal"} loading={busy} onPress={save} />
      {goal ? <Button label="Delete goal" variant="ghost" onPress={del} /> : null}
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
