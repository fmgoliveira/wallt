import type { AccountWithBalance } from "@wallt/db";
import { AmountInput, Button, Input, Select, Sheet, Tabs, Text, toast } from "@wallt/ui";
import { useState } from "react";
import { View } from "react-native";
import { ColorPicker } from "../components/ColorPicker";
import { useCreateAccount, useUpdateAccount } from "../data/hooks";
import { useTranslation } from "../i18n";
import { type AccountType, accountTypes, currencyOptions } from "./meta";

/** Create or edit an account (sheet on phone, dialog on desktop). Mount it only while open: it owns its field state. */
export function AccountForm({
  account,
  onClose,
}: {
  account?: AccountWithBalance | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const editing = !!account;

  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "checking");
  const [currency, setCurrency] = useState<string>(account?.currency ?? "EUR");
  const [opening, setOpening] = useState<number | null>(account?.openingBalance ?? 0);
  const [colorHex, setColorHex] = useState<string | null>(account?.color ?? null);
  const [counts, setCounts] = useState<"yes" | "no">(
    account?.includeInNetWorth === false ? "no" : "yes",
  );
  const [submitted, setSubmitted] = useState(false);

  const include = [
    { value: "yes", label: t("accounts.form.included") },
    { value: "no", label: t("accounts.form.excluded") },
  ] as const;
  const nameError = submitted && name.trim() === "" ? t("accounts.form.nameRequired") : undefined;
  const openingError =
    submitted && opening === null ? t("accounts.form.openingRequired") : undefined;
  const currencyLocked = !!account && account.transactionCount > 0;
  const busy = create.isPending || update.isPending;

  async function save() {
    setSubmitted(true);
    if (name.trim() === "" || opening === null) return;
    const values = {
      name: name.trim(),
      type,
      currency,
      openingBalance: opening,
      color: colorHex,
      includeInNetWorth: counts === "yes",
    };
    try {
      if (account) {
        await update.mutateAsync({ id: account.id, patch: values });
        toast.success(t("accounts.form.updated"));
      } else {
        await create.mutateAsync(values);
        toast.success(t("accounts.form.added"));
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("accounts.form.saveFailed"));
    }
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      title={editing ? t("accounts.form.titleEdit") : t("accounts.form.titleNew")}
    >
      <Input
        label={t("accounts.form.name")}
        value={name}
        onChangeText={setName}
        placeholder={t("accounts.form.namePlaceholder")}
        error={nameError}
        autoFocus
      />
      <Select
        label={t("accounts.form.type")}
        options={accountTypes}
        value={type}
        onChange={(v) => setType(v as AccountType)}
      />
      {currencyLocked ? (
        <View className="gap-1.5">
          <Text variant="small" tone="muted" weight="medium">
            {t("accounts.form.currency")}
          </Text>
          <Text>{currency}</Text>
          <Text variant="small" tone="muted">
            {t("accounts.form.currencyLocked")}
          </Text>
        </View>
      ) : (
        <Select
          label={t("accounts.form.currency")}
          options={currencyOptions}
          value={currency}
          onChange={setCurrency}
        />
      )}
      <AmountInput
        label={t("accounts.form.openingBalance")}
        value={opening}
        onChangeValue={setOpening}
        currency={currency}
        allowNegative
        placeholder="0,00"
        error={openingError}
      />
      <ColorPicker value={colorHex} onChange={setColorHex} />
      <View className="gap-1.5">
        <Text variant="small" tone="muted" weight="medium">
          {t("accounts.form.netWorth")}
        </Text>
        <Tabs items={include} value={counts} onChange={setCounts} />
      </View>
      <Button
        label={editing ? t("accounts.form.saveChanges") : t("accounts.form.add")}
        loading={busy}
        onPress={save}
      />
      <Button label={t("accounts.cancel")} variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
