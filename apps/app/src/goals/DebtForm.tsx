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
import { useTranslation } from "../i18n";

/** Create or edit a debt. Mount it only while open. */
export function DebtForm({
  debt,
  onClose,
}: {
  debt?: DebtWithProgress | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateDebt();
  const update = useUpdateDebt();
  const remove = useDeleteDebt();
  const accounts = useAccounts().data ?? [];

  const [person, setPerson] = useState(debt?.person ?? "");
  const [direction, setDirection] = useState<"lent" | "borrowed">(debt?.direction ?? "lent");
  const [amount, setAmount] = useState<number | null>(debt?.amount ?? null);
  const [currency, setCurrency] = useState(debt?.currency ?? accounts[0]?.currency ?? "EUR");
  const [submitted, setSubmitted] = useState(false);

  const directions = [
    { value: "lent", label: t("goals.debtForm.lent") },
    { value: "borrowed", label: t("goals.debtForm.borrowed") },
  ] as const;
  const personError =
    submitted && person.trim() === "" ? t("goals.debtForm.personRequired") : undefined;
  const amountError = submitted && !amount ? t("goals.enterAmount") : undefined;
  const busy = create.isPending || update.isPending || remove.isPending;
  const locked = !!debt && debt.repaymentCount > 0;

  async function save() {
    setSubmitted(true);
    if (person.trim() === "" || !amount) return;
    const values = { person: person.trim(), direction, amount, currency };
    try {
      if (debt) {
        await update.mutateAsync({ id: debt.id, patch: values });
        toast.success(t("goals.debtForm.updated"));
      } else {
        await create.mutateAsync(values);
        toast.success(t("goals.debtForm.added"));
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("goals.debtForm.saveFailed"));
    }
  }

  async function del() {
    if (!debt) return;
    try {
      await remove.mutateAsync(debt.id);
      toast.success(t("goals.debtForm.deleted"));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("goals.debtForm.deleteFailed"));
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={debt ? t("goals.debtForm.titleEdit") : t("goals.debtForm.titleNew")}
    >
      <Input
        label={t("goals.debtForm.person")}
        value={person}
        onChangeText={setPerson}
        placeholder={t("goals.debtForm.personPlaceholder")}
        error={personError}
        autoFocus={!debt}
      />
      <Tabs items={directions} value={direction} onChange={setDirection} />
      <AmountInput
        label={t("goals.amount")}
        value={amount}
        onChangeValue={setAmount}
        currency={currency}
        placeholder="0,00"
        error={amountError}
      />
      {locked ? (
        <View className="gap-1.5">
          <Text variant="small" tone="muted" weight="medium">
            {t("goals.currency")}
          </Text>
          <Text>{currency}</Text>
          <Text variant="small" tone="muted">
            {t("goals.debtForm.currencyLocked")}
          </Text>
        </View>
      ) : (
        <Select
          label={t("goals.currency")}
          options={currencyOptions}
          value={currency}
          onChange={setCurrency}
        />
      )}
      <Button
        label={debt ? t("goals.saveChanges") : t("goals.debtForm.add")}
        loading={busy}
        onPress={save}
      />
      {debt ? <Button label={t("goals.debtForm.delete")} variant="ghost" onPress={del} /> : null}
      <Button label={t("goals.cancel")} variant="ghost" onPress={onClose} />
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
  const { t } = useTranslation();
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
      toast.success(t("goals.repayment.recorded"));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("goals.repayment.recordFailed"));
    }
  }

  return (
    <Sheet visible onClose={onClose} title={t("goals.repayment.title", { person: debt.person })}>
      <Text tone="muted">
        {debt.direction === "lent"
          ? t("goals.repayment.lentHint")
          : t("goals.repayment.borrowedHint")}
      </Text>
      <AmountInput
        label={t("goals.amount")}
        value={amount}
        onChangeValue={setAmount}
        currency={debt.currency}
        placeholder="0,00"
        error={submitted && !amount ? t("goals.enterAmount") : undefined}
      />
      {accounts.length === 0 ? (
        <Text tone="negative">{t("goals.repayment.noAccount", { currency: debt.currency })}</Text>
      ) : (
        <Select
          label={t("goals.repayment.account")}
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          value={accountId}
          onChange={setAccountId}
          error={submitted && !accountId ? t("goals.repayment.pickAccount") : undefined}
        />
      )}
      <DatePicker label={t("goals.repayment.date")} value={date} onChange={setDate} />
      <Button label={t("goals.repayment.record")} loading={record.isPending} onPress={save} />
      <Button label={t("goals.cancel")} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
