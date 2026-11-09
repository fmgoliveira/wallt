import { fromLocalDate } from "@wallt/core";
import type { DebtWithProgress } from "@wallt/db";
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
import { currencyOptions } from "../accounts/meta";
import { useCreateDebt, useDeleteDebt, useRecordRepayment, useUpdateDebt } from "../data/goals";
import { useAccounts } from "../data/hooks";

const directions = [
  { value: "lent", label: "I lent" },
  { value: "borrowed", label: "I borrowed" },
] as const;

/** Create or edit a debt. Mount it only while open. */
export function DebtForm({
  debt,
  onClose,
}: {
  debt?: DebtWithProgress | undefined;
  onClose: () => void;
}) {
  const create = useCreateDebt();
  const update = useUpdateDebt();
  const remove = useDeleteDebt();
  const accounts = useAccounts().data ?? [];

  const [person, setPerson] = useState(debt?.person ?? "");
  const [direction, setDirection] = useState<"lent" | "borrowed">(debt?.direction ?? "lent");
  const [amount, setAmount] = useState<number | null>(debt?.amount ?? null);
  const [currency, setCurrency] = useState(debt?.currency ?? accounts[0]?.currency ?? "EUR");
  const [submitted, setSubmitted] = useState(false);

  const personError = submitted && person.trim() === "" ? "Who is it with?" : undefined;
  const amountError = submitted && !amount ? "Enter an amount" : undefined;
  const busy = create.isPending || update.isPending || remove.isPending;
  const locked = !!debt && debt.repaymentCount > 0;

  async function save() {
    setSubmitted(true);
    if (person.trim() === "" || !amount) return;
    const values = { person: person.trim(), direction, amount, currency };
    try {
      if (debt) {
        await update.mutateAsync({ id: debt.id, patch: values });
        toast.success("Debt updated");
      } else {
        await create.mutateAsync(values);
        toast.success("Debt added");
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the debt");
    }
  }

  async function del() {
    if (!debt) return;
    try {
      await remove.mutateAsync(debt.id);
      toast.success("Debt deleted");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the debt");
    }
  }

  return (
    <Sheet visible onClose={onClose} title={debt ? "Edit debt" : "New debt"}>
      <Input
        label="Person"
        value={person}
        onChangeText={setPerson}
        placeholder="e.g. Ana"
        error={personError}
        autoFocus={!debt}
      />
      <Tabs items={directions} value={direction} onChange={setDirection} />
      <AmountInput
        label="Amount"
        value={amount}
        onChangeValue={setAmount}
        currency={currency}
        placeholder="0,00"
        error={amountError}
      />
      {locked ? (
        <View className="gap-1.5">
          <Text variant="small" tone="muted" weight="medium">
            Currency
          </Text>
          <Text>{currency}</Text>
          <Text variant="small" tone="muted">
            Locked: repayments are linked.
          </Text>
        </View>
      ) : (
        <Select
          label="Currency"
          options={currencyOptions}
          value={currency}
          onChange={setCurrency}
        />
      )}
      <Button label={debt ? "Save changes" : "Add debt"} loading={busy} onPress={save} />
      {debt ? <Button label="Delete debt" variant="ghost" onPress={del} /> : null}
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

/** Record a repayment: creates a transaction linked to the debt, in an account of the debt's currency. */
export function RepaymentForm({
  debt,
  outstanding,
  onClose,
}: {
  debt: DebtWithProgress;
  outstanding: number;
  onClose: () => void;
}) {
  const record = useRecordRepayment();
  const accounts = (useAccounts().data ?? []).filter((a) => a.currency === debt.currency);
  const [amount, setAmount] = useState<number | null>(outstanding > 0 ? outstanding : null);
  const [accountId, setAccountId] = useState<string | null>(accounts[0]?.id ?? null);
  const [date, setDate] = useState(fromLocalDate(new Date()));
  const [submitted, setSubmitted] = useState(false);

  async function save() {
    setSubmitted(true);
    if (!amount || !accountId) return;
    try {
      await record.mutateAsync({ debt, accountId, amount, bookingDate: date });
      toast.success("Repayment recorded");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the repayment");
    }
  }

  return (
    <Sheet visible onClose={onClose} title={`Repayment · ${debt.person}`}>
      <Text tone="muted">
        {debt.direction === "lent"
          ? "Money you received back. It is added to the account as income."
          : "Money you paid back. It is taken from the account as an expense."}
      </Text>
      <AmountInput
        label="Amount"
        value={amount}
        onChangeValue={setAmount}
        currency={debt.currency}
        placeholder="0,00"
        error={submitted && !amount ? "Enter an amount" : undefined}
      />
      {accounts.length === 0 ? (
        <Text tone="negative">No account in {debt.currency}: add one first.</Text>
      ) : (
        <Select
          label="Account"
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          value={accountId}
          onChange={setAccountId}
          error={submitted && !accountId ? "Pick an account" : undefined}
        />
      )}
      <DatePicker label="Date" value={date} onChange={setDate} />
      <Button label="Record repayment" loading={record.isPending} onPress={save} />
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
