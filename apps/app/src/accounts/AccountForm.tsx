import type { AccountWithBalance } from "@wallt/db";
import {
  AmountInput,
  Button,
  categoryPalette,
  Input,
  Select,
  Sheet,
  Tabs,
  Text,
  toast,
  useTheme,
} from "@wallt/ui";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useCreateAccount, useUpdateAccount } from "../data/hooks";
import {
  type AccountType,
  accountColorHex,
  accountColorName,
  accountColorNames,
  accountTypes,
  currencyOptions,
} from "./meta";

const include = [
  { value: "yes", label: "Included" },
  { value: "no", label: "Excluded" },
] as const;

/** Create or edit an account (sheet on phone, dialog on desktop). Mount it only while open: it owns its field state. */
export function AccountForm({
  account,
  onClose,
}: {
  account?: AccountWithBalance | undefined;
  onClose: () => void;
}) {
  const { scheme, colors } = useTheme();
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

  const nameError = submitted && name.trim() === "" ? "Name is required" : undefined;
  const openingError = submitted && opening === null ? "Enter an opening balance" : undefined;
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
        toast.success("Account updated");
      } else {
        await create.mutateAsync(values);
        toast.success("Account added");
      }
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the account");
    }
  }

  const ring = (selected: boolean) =>
    selected
      ? `0 0 0 2px ${colors.bg}, 0 0 0 3.5px ${colors.text}`
      : `0 0 0 1px ${colors.borderStrong}`;

  return (
    <Sheet visible onClose={onClose} title={editing ? "Edit account" : "New account"}>
      <Input
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="e.g. Main checking"
        error={nameError}
        autoFocus
      />
      <Select
        label="Type"
        options={accountTypes}
        value={type}
        onChange={(v) => setType(v as AccountType)}
      />
      {currencyLocked ? (
        <View className="gap-1.5">
          <Text variant="small" tone="muted" weight="medium">
            Currency
          </Text>
          <Text>{currency}</Text>
          <Text variant="small" tone="muted">
            Locked: this account has transactions.
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
      <AmountInput
        label="Opening balance"
        value={opening}
        onChangeValue={setOpening}
        currency={currency}
        allowNegative
        placeholder="0,00"
        error={openingError}
      />
      <View className="gap-1.5">
        <Text variant="small" tone="muted" weight="medium">
          Colour
        </Text>
        <View className="flex-row flex-wrap" accessibilityRole="radiogroup">
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel="No colour"
            accessibilityState={{ checked: colorHex === null }}
            onPress={() => setColorHex(null)}
            className="h-11 w-11 items-center justify-center web:cursor-pointer web:outline-none"
          >
            <View className="h-6 w-6 rounded-sm" style={{ boxShadow: ring(colorHex === null) }} />
          </Pressable>
          {accountColorNames.map((n) => {
            const selected = accountColorName(colorHex) === n;
            return (
              <Pressable
                key={n}
                accessibilityRole="radio"
                accessibilityLabel={n}
                accessibilityState={{ checked: selected }}
                onPress={() => setColorHex(accountColorHex(n))}
                className="h-11 w-11 items-center justify-center web:cursor-pointer web:outline-none"
              >
                <View
                  className="h-6 w-6 rounded-sm"
                  style={{
                    backgroundColor: categoryPalette[n][scheme],
                    boxShadow: selected ? ring(true) : undefined,
                  }}
                />
              </Pressable>
            );
          })}
        </View>
      </View>
      <View className="gap-1.5">
        <Text variant="small" tone="muted" weight="medium">
          Net worth
        </Text>
        <Tabs items={include} value={counts} onChange={setCounts} />
      </View>
      <Button label={editing ? "Save changes" : "Add account"} loading={busy} onPress={save} />
      <Button label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}
