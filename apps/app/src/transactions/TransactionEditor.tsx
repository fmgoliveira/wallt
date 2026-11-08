import {
  type Account,
  addDays,
  type Category,
  fromLocalDate,
  isValidDate,
  splitsRemaining,
  type Tag,
} from "@wallt/core";
import type { TransactionDetail } from "@wallt/db";
import {
  Amount,
  AmountInput,
  Button,
  Input,
  Select,
  Sheet,
  Skeleton,
  Tabs,
  Text,
  toast,
  useTheme,
} from "@wallt/ui";
import { useRouter } from "expo-router";
import { Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { categoryOptions } from "../categories/options";
import {
  useAccounts,
  useCategories,
  useCreateTag,
  useCreateTransaction,
  useCreateTransfer,
  useDeleteTransaction,
  useTags,
  useTransaction,
  useUpdateTransaction,
  useUpdateTransfer,
} from "../data/hooks";
import { useEditorStore } from "./editorStore";

type Kind = "expense" | "income" | "transfer";

const allKinds = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
] as const;
const moneyKinds = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const;
const statuses = [
  { value: "booked", label: "Booked" },
  { value: "pending", label: "Pending" },
] as const;
const reports = [
  { value: "in", label: "Counted" },
  { value: "out", label: "Excluded" },
] as const;

interface SplitRow {
  key: number;
  categoryId: string | null;
  amount: number | null;
}

/** Global add/edit sheet. Mounted once in the shell; opened through `useEditorStore`. */
export function TransactionEditorHost() {
  const open = useEditorStore((s) => s.open);
  if (!open) return null;
  return <EditorLoader />;
}

function EditorLoader() {
  const router = useRouter();
  const { txId, presetAccountId, lastAccountId, close } = useEditorStore();
  const accounts = useAccounts();
  const categories = useCategories({ includeArchived: true });
  const tags = useTags();
  const tx = useTransaction(txId ?? undefined);
  const peerId = tx.data?.transferPeerId ?? undefined;
  const peer = useTransaction(peerId);

  const loading =
    !accounts.data ||
    !categories.data ||
    !tags.data ||
    (!!txId && tx.data === undefined) ||
    (!!peerId && peer.data === undefined);

  if (loading) {
    return (
      <Sheet visible onClose={close} title="Transaction">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
      </Sheet>
    );
  }
  if (txId && !tx.data) {
    return (
      <Sheet visible onClose={close} title="Transaction not found">
        <Text tone="muted">It may have been deleted.</Text>
        <Button label="Close" variant="secondary" onPress={close} />
      </Sheet>
    );
  }
  if (accounts.data.length === 0) {
    return (
      <Sheet visible onClose={close} title="Add an account first">
        <Text tone="muted">Transactions belong to an account.</Text>
        <Button
          label="Go to accounts"
          onPress={() => {
            close();
            router.push("/accounts");
          }}
        />
      </Sheet>
    );
  }
  const defaultAccount =
    [presetAccountId, lastAccountId].find((id) => id && accounts.data.some((a) => a.id === id)) ??
    accounts.data[0]?.id ??
    "";
  return (
    <EditorForm
      key={txId ?? "new"}
      existing={tx.data ?? null}
      peer={peer.data ?? null}
      accounts={accounts.data}
      categories={categories.data}
      tags={tags.data}
      defaultAccountId={defaultAccount}
      onClose={close}
    />
  );
}

function TagChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="min-h-[36px] justify-center rounded-md px-3 web:cursor-pointer web:outline-none"
      style={{
        backgroundColor: selected ? colors.elevated : undefined,
        boxShadow: selected ? `0 0 0 1.5px ${colors.text}` : `0 0 0 1px ${colors.borderStrong}`,
      }}
    >
      <Text
        variant="small"
        weight={selected ? "medium" : "regular"}
        tone={selected ? "default" : "muted"}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function EditorForm({
  existing,
  peer,
  accounts,
  categories,
  tags,
  defaultAccountId,
  onClose,
}: {
  existing: TransactionDetail | null;
  peer: TransactionDetail | null;
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  defaultAccountId: string;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const remember = useEditorStore((s) => s.remember);
  const createTx = useCreateTransaction();
  const updateTx = useUpdateTransaction();
  const createTransfer = useCreateTransfer();
  const updateTransfer = useUpdateTransfer();
  const remove = useDeleteTransaction();
  const createTag = useCreateTag();
  const editing = !!existing;
  const wasTransfer = existing?.kind === "transfer";

  // For a transfer, the source leg is the negative one.
  const legs =
    wasTransfer && existing && peer ? [existing, peer].sort((a, b) => a.amount - b.amount) : null;
  const first = legs?.[0] ?? existing;
  const today = fromLocalDate(new Date());

  const [kind, setKind] = useState<Kind>(existing?.kind ?? "expense");
  const [amount, setAmount] = useState<number | null>(existing ? Math.abs(existing.amount) : null);
  const [accountId, setAccountId] = useState<string>(first?.accountId ?? defaultAccountId);
  const [toAccountId, setToAccountId] = useState<string | null>(legs?.[1]?.accountId ?? null);
  const [date, setDate] = useState(existing?.bookingDate ?? today);
  const [payee, setPayee] = useState(existing?.payee ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(existing?.categoryId ?? null);
  const [splitMode, setSplitMode] = useState((existing?.splits.length ?? 0) > 0);
  const [splits, setSplits] = useState<SplitRow[]>(
    (existing?.splits ?? []).map((s, i) => ({
      key: i,
      categoryId: s.categoryId,
      amount: Math.abs(s.amount),
    })),
  );
  const [tagIds, setTagIds] = useState<string[]>(existing?.tagIds ?? []);
  const [counted, setCounted] = useState<"in" | "out">(
    existing?.excludedFromReports ? "out" : "in",
  );
  const [status, setStatus] = useState<"booked" | "pending">(existing?.status ?? "booked");
  const [more, setMore] = useState(
    !!existing &&
      (existing.notes !== "" ||
        existing.tagIds.length > 0 ||
        existing.splits.length > 0 ||
        existing.excludedFromReports ||
        existing.status === "pending"),
  );
  const [newTag, setNewTag] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? "EUR";
  const transfer = kind === "transfer";
  const sign = kind === "expense" ? -1 : 1;
  const total = amount ?? 0;
  const remaining = splitsRemaining(
    total,
    splits.map((s) => ({ amount: s.amount ?? 0 })),
  );
  const toOptions = accounts.filter((a) => a.id !== accountId && a.currency === currency);

  const errors = {
    amount: amount === null || amount <= 0 ? "Enter an amount above zero" : undefined,
    date: isValidDate(date) ? undefined : "Use the format YYYY-MM-DD",
    to: transfer && !toAccountId ? "Choose the destination account" : undefined,
    splits:
      !transfer && splitMode
        ? splits.length < 2
          ? "Add at least two splits"
          : splits.some((s) => s.amount === null || s.amount <= 0)
            ? "Every split needs an amount"
            : remaining !== 0
              ? "Splits must add up to the total"
              : undefined
        : undefined,
  };
  const invalid = Object.values(errors).some(Boolean);
  const busy =
    createTx.isPending ||
    updateTx.isPending ||
    createTransfer.isPending ||
    updateTransfer.isPending;

  function changeKind(next: Kind) {
    setKind(next);
    // Categories belong to one type: drop picks that no longer fit.
    const fits = (id: string | null) => !id || categories.find((c) => c.id === id)?.type === next;
    if (!fits(categoryId)) setCategoryId(null);
    setSplits((rows) => rows.map((r) => (fits(r.categoryId) ? r : { ...r, categoryId: null })));
    if (next === "transfer") setToAccountId((cur) => cur ?? null);
  }

  function changeAccount(id: string) {
    setAccountId(id);
    const next = accounts.find((a) => a.id === id);
    const to = accounts.find((a) => a.id === toAccountId);
    if (to && next && (to.id === id || to.currency !== next.currency)) setToAccountId(null);
  }

  function startSplit() {
    setSplitMode(true);
    setSplits([
      { key: 0, categoryId, amount: amount },
      { key: 1, categoryId: null, amount: null },
    ]);
  }

  async function addTag() {
    const name = newTag.trim();
    if (!name) return;
    const existingTag = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    try {
      const tag = existingTag ?? (await createTag.mutateAsync({ name }));
      setTagIds((ids) => (ids.includes(tag.id) ? ids : [...ids, tag.id]));
      setNewTag("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the tag");
    }
  }

  async function save() {
    setSubmitted(true);
    if (invalid || amount === null || !account) return;
    const shared = {
      bookingDate: date,
      notes: notes.trim(),
      status,
      excludedFromReports: counted === "out",
    };
    try {
      if (transfer) {
        if (!toAccountId) return;
        const input = { fromAccountId: accountId, toAccountId, amount, ...shared };
        if (existing) await updateTransfer.mutateAsync({ id: existing.id, patch: input });
        else await createTransfer.mutateAsync(input);
      } else {
        const fields = {
          accountId,
          currency: account.currency,
          amount: amount * sign,
          kind,
          payee: payee.trim(),
          categoryId: splitMode ? null : categoryId,
          splits: splitMode
            ? splits.map((s) => ({ amount: (s.amount ?? 0) * sign, categoryId: s.categoryId }))
            : [],
          tagIds,
          ...shared,
        };
        if (existing) await updateTx.mutateAsync({ id: existing.id, patch: fields });
        else await createTx.mutateAsync(fields);
      }
      remember(accountId);
      toast.success(editing ? "Transaction updated" : "Transaction added");
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the transaction");
    }
  }

  async function doDelete() {
    if (!existing) return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success(wasTransfer ? "Transfer deleted" : "Transaction deleted");
      setConfirmDelete(false);
      onClose();
    } catch (error) {
      setConfirmDelete(false);
      toast.error(error instanceof Error ? error.message : "Could not delete the transaction");
    }
  }

  const catType = kind === "income" ? "income" : "expense";
  const pickList = (keep: string | null) => [
    { value: "none", label: "No category" },
    ...categoryOptions(categories, catType, keep),
  ];
  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: a.name,
    description: a.currency,
  }));

  return (
    <Sheet
      visible
      onClose={onClose}
      title={editing ? (wasTransfer ? "Edit transfer" : "Edit transaction") : "New transaction"}
    >
      {wasTransfer ? null : (
        <Tabs
          items={editing ? moneyKinds : allKinds}
          value={kind}
          onChange={(v) => changeKind(v)}
        />
      )}

      <AmountInput
        label="Amount"
        value={amount}
        onChangeValue={setAmount}
        currency={currency}
        placeholder="0,00"
        autoFocus={!editing}
        error={submitted ? errors.amount : undefined}
      />

      <Select
        label={transfer ? "From" : "Account"}
        options={accountOptions}
        value={accountId}
        onChange={changeAccount}
      />
      {transfer ? (
        <View className="gap-1.5">
          <Select
            label="To"
            placeholder="Choose account"
            options={toOptions.map((a) => ({
              value: a.id,
              label: a.name,
              description: a.currency,
            }))}
            value={toAccountId}
            onChange={setToAccountId}
            error={submitted ? errors.to : undefined}
          />
          {toOptions.length === 0 ? (
            <Text variant="small" tone="muted">
              You need another {currency} account to transfer to.
            </Text>
          ) : null}
        </View>
      ) : null}

      {transfer || splitMode ? null : (
        <Select
          label="Category"
          options={pickList(categoryId)}
          value={categoryId ?? "none"}
          onChange={(v) => setCategoryId(v === "none" ? null : v)}
        />
      )}

      <View className="gap-1.5">
        <Input
          label="Date"
          value={date}
          onChangeText={setDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
          autoCorrect={false}
          error={submitted ? errors.date : undefined}
        />
        <View className="flex-row gap-2">
          <TagChip label="Today" selected={date === today} onPress={() => setDate(today)} />
          <TagChip
            label="Yesterday"
            selected={date === addDays(today, -1)}
            onPress={() => setDate(addDays(today, -1))}
          />
        </View>
      </View>

      {transfer ? null : (
        <Input label="Payee" value={payee} onChangeText={setPayee} placeholder="Who was it with?" />
      )}

      {more ? (
        <>
          <Input
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional"
            multiline
          />

          {transfer ? null : (
            <View className="gap-2">
              <Text variant="small" tone="muted" weight="medium">
                Tags
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {tags.map((t) => (
                  <TagChip
                    key={t.id}
                    label={t.name}
                    selected={tagIds.includes(t.id)}
                    onPress={() =>
                      setTagIds((ids) =>
                        ids.includes(t.id) ? ids.filter((x) => x !== t.id) : [...ids, t.id],
                      )
                    }
                  />
                ))}
              </View>
              <Input
                value={newTag}
                onChangeText={setNewTag}
                placeholder="New tag, then press enter"
                onSubmitEditing={addTag}
                returnKeyType="done"
                accessibilityLabel="New tag"
              />
            </View>
          )}

          {transfer ? null : (
            <View className="gap-2">
              <View className="flex-row items-center justify-between">
                <Text variant="small" tone="muted" weight="medium">
                  Split across categories
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => (splitMode ? setSplitMode(false) : startSplit())}
                  hitSlop={8}
                  className="px-1 py-2 web:cursor-pointer web:outline-none web:hover:opacity-70"
                >
                  <Text variant="small" weight="medium" tone="muted">
                    {splitMode ? "Remove split" : "Split"}
                  </Text>
                </Pressable>
              </View>
              {splitMode ? (
                <View className="gap-3">
                  {splits.map((row, i) => (
                    <View key={row.key} className="gap-2">
                      <View className="flex-row items-end gap-2">
                        <View className="flex-1">
                          <Select
                            label={`Split ${i + 1}`}
                            options={pickList(row.categoryId)}
                            value={row.categoryId ?? "none"}
                            onChange={(v) =>
                              setSplits((rs) =>
                                rs.map((r) =>
                                  r.key === row.key
                                    ? { ...r, categoryId: v === "none" ? null : v }
                                    : r,
                                ),
                              )
                            }
                          />
                        </View>
                        <View className="w-[120px]">
                          <AmountInput
                            label="Amount"
                            value={row.amount}
                            onChangeValue={(v) =>
                              setSplits((rs) =>
                                rs.map((r) => (r.key === row.key ? { ...r, amount: v } : r)),
                              )
                            }
                            currency={currency}
                            placeholder="0,00"
                          />
                        </View>
                        {splits.length > 2 ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Remove split ${i + 1}`}
                            onPress={() => setSplits((rs) => rs.filter((r) => r.key !== row.key))}
                            className="h-11 w-11 items-center justify-center"
                          >
                            <X size={16} color={colors.muted} strokeWidth={1.8} />
                          </Pressable>
                        ) : null}
                      </View>
                    </View>
                  ))}
                  <View className="flex-row items-center justify-between">
                    <Pressable
                      accessibilityRole="button"
                      onPress={() =>
                        setSplits((rs) => [
                          ...rs,
                          {
                            key: Math.max(...rs.map((r) => r.key)) + 1,
                            categoryId: null,
                            amount: null,
                          },
                        ])
                      }
                      className="flex-row items-center gap-1.5 py-2 web:cursor-pointer web:outline-none web:hover:opacity-70"
                    >
                      <Plus size={14} color={colors.muted} strokeWidth={1.8} />
                      <Text variant="small" weight="medium" tone="muted">
                        Add split
                      </Text>
                    </Pressable>
                    <View className="flex-row items-center gap-1.5">
                      <Text variant="small" tone="muted">
                        Left to allocate
                      </Text>
                      <Amount value={remaining} currency={currency} size="small" tone="muted" />
                    </View>
                  </View>
                  {submitted && errors.splits ? (
                    <Text variant="small" tone="negative">
                      {errors.splits}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}

          <View className="gap-1.5">
            <Text variant="small" tone="muted" weight="medium">
              Status
            </Text>
            <Tabs items={statuses} value={status} onChange={setStatus} />
          </View>
          <View className="gap-1.5">
            <Text variant="small" tone="muted" weight="medium">
              In reports
            </Text>
            <Tabs items={reports} value={counted} onChange={setCounted} />
          </View>
        </>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => setMore(true)}
          className="self-start py-2 web:cursor-pointer web:outline-none web:hover:opacity-70"
        >
          <Text variant="small" weight="medium" tone="muted">
            More options
          </Text>
        </Pressable>
      )}

      <Button label={editing ? "Save changes" : "Add transaction"} loading={busy} onPress={save} />
      {editing ? (
        <Button label="Delete" variant="ghost" onPress={() => setConfirmDelete(true)} />
      ) : null}
      <Button label="Cancel" variant="ghost" onPress={onClose} />

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={wasTransfer ? "Delete transfer?" : "Delete transaction?"}
      >
        <Text tone="muted">
          {wasTransfer
            ? "Both sides of the transfer are removed and the balances of both accounts update."
            : "It is removed and the account balance updates."}
        </Text>
        <Button
          label="Delete"
          variant="destructive"
          loading={remove.isPending}
          onPress={doDelete}
        />
        <Button label="Cancel" variant="ghost" onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </Sheet>
  );
}
