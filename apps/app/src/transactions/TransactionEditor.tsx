import {
  type Account,
  addDays,
  type Category,
  currencyExponent,
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
  DatePicker,
  IconTile,
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
import { ArrowLeftRight, Check, Plus, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { accountTypeIcon, accountTypeLabel } from "../accounts/meta";
import { categoryTint } from "../categories/color";
import { categoryIcon } from "../categories/icons";
import { categoryOptions } from "../categories/options";
import { displayColor } from "../components/colors";
import { ToggleChip } from "../components/ToggleChip";
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
import { AmountKeypad, backspace, pressDigits } from "./AmountKeypad";
import { useEditorStore } from "./editorStore";

type Kind = "expense" | "income" | "transfer";
type StepId = "amount" | "account" | "category" | "details";

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

const stepTitle: Record<StepId, string> = {
  amount: "Amount",
  account: "Account",
  category: "Category",
  details: "Details",
};

interface SplitRow {
  key: number;
  categoryId: string | null;
  amount: number | null;
}

/** Global add/edit flow. Mounted once in the shell; opened through `useEditorStore`. */
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
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-44 w-full" />
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

function StepPills({
  steps,
  current,
  reachable,
  onGo,
}: {
  steps: StepId[];
  current: StepId;
  reachable: boolean;
  onGo: (s: StepId) => void;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row gap-1.5" accessibilityRole="tablist">
      {steps.map((s, i) => {
        const active = s === current;
        const enabled = i === 0 || reachable;
        return (
          <Pressable
            key={s}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: !enabled }}
            accessibilityLabel={`Step ${i + 1}: ${stepTitle[s]}`}
            disabled={!enabled}
            onPress={() => onGo(s)}
            className="flex-1 web:cursor-pointer web:outline-none"
          >
            <View
              style={{
                height: 4,
                borderRadius: 2,
                backgroundColor: active
                  ? colors.text
                  : enabled
                    ? colors.borderStrong
                    : colors.border,
              }}
            />
            <Text
              variant="small"
              tone={active ? "default" : "muted"}
              weight={active ? "medium" : "regular"}
              className="pt-1.5"
            >
              {stepTitle[s]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function AccountCard({
  account,
  selected,
  onPress,
}: {
  account: Account;
  selected: boolean;
  onPress: () => void;
}) {
  const { scheme, colors } = useTheme();
  const Icon = accountTypeIcon[account.type];
  const tint = displayColor(account.color, account.id, scheme);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      className="min-h-[60px] flex-row items-center gap-3 rounded-lg px-3 py-2 web:cursor-pointer web:outline-none web:transition-shadow web:duration-150 web:hover:bg-text/5"
      style={{
        backgroundColor: selected ? colors.elevated : undefined,
        boxShadow: selected ? `0 0 0 1.5px ${tint}` : `0 0 0 1px ${colors.border}`,
      }}
    >
      <IconTile>
        <Icon size={18} color={tint} strokeWidth={1.6} />
      </IconTile>
      <View className="flex-1">
        <Text weight="medium" numberOfLines={1}>
          {account.name}
        </Text>
        <Text variant="small" tone="muted">
          {`${accountTypeLabel(account.type)} · ${account.currency}`}
        </Text>
      </View>
      {selected ? <Check size={18} color={tint} strokeWidth={2} /> : null}
    </Pressable>
  );
}

function CategoryTile({
  label,
  icon: Icon,
  tint,
  selected,
  onPress,
}: {
  label: string;
  icon: ReturnType<typeof categoryIcon>;
  tint: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      onPress={onPress}
      className="w-[31.5%] items-center gap-1.5 rounded-lg px-1 py-3 web:cursor-pointer web:outline-none web:transition-shadow web:duration-150 web:hover:bg-text/5"
      style={{
        backgroundColor: selected ? colors.elevated : undefined,
        boxShadow: selected ? `0 0 0 1.5px ${tint}` : `0 0 0 1px ${colors.border}`,
      }}
    >
      <IconTile>
        <Icon size={18} color={tint} strokeWidth={1.6} />
      </IconTile>
      <Text
        variant="small"
        weight={selected ? "medium" : "regular"}
        numberOfLines={2}
        className="text-center"
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
  const { scheme, colors } = useTheme();
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

  const [step, setStep] = useState<StepId>("amount");
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "expense");
  const [amount, setAmount] = useState<number>(existing ? Math.abs(existing.amount) : 0);
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
  const [newTag, setNewTag] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const account = accounts.find((a) => a.id === accountId);
  const currency = account?.currency ?? "EUR";
  const transfer = kind === "transfer";
  const sign = kind === "expense" ? -1 : 1;
  const steps: StepId[] = transfer
    ? ["amount", "account", "details"]
    : ["amount", "account", "category", "details"];
  const index = Math.max(0, steps.indexOf(step));
  const last = index === steps.length - 1;
  const remaining = splitsRemaining(
    amount,
    splits.map((s) => ({ amount: s.amount ?? 0 })),
  );
  const toOptions = accounts.filter((a) => a.id !== accountId && a.currency === currency);

  const errors = {
    amount: amount <= 0 ? "Enter an amount above zero" : undefined,
    date: isValidDate(date) ? undefined : "Pick a date",
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
  const exponent = currencyExponent(currency);

  // Physical keyboard on the amount step (web): digits, backspace, enter.
  useEffect(() => {
    if (step !== "amount" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) setAmount((v) => pressDigits(v, e.key));
      else if (e.key === "Backspace") setAmount((v) => backspace(v));
      else if (e.key === "Enter" && amount > 0) setStep(steps[1] ?? "account");
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, amount, steps]);

  function changeKind(next: Kind) {
    setKind(next);
    // Categories belong to one type: drop picks that no longer fit.
    const fits = (id: string | null) => !id || categories.find((c) => c.id === id)?.type === next;
    if (!fits(categoryId)) setCategoryId(null);
    setSplits((rows) => rows.map((r) => (fits(r.categoryId) ? r : { ...r, categoryId: null })));
  }

  function changeAccount(id: string) {
    setAccountId(id);
    const next = accounts.find((a) => a.id === id);
    const to = accounts.find((a) => a.id === toAccountId);
    if (to && next && (to.id === id || to.currency !== next.currency)) setToAccountId(null);
  }

  function go(delta: 1 | -1) {
    const next = steps[index + delta];
    if (next) setStep(next);
  }

  function startSplit() {
    setSplitMode(true);
    setSplits([
      { key: 0, categoryId, amount },
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
    if (invalid || !account) {
      // Jump to the step that has the problem.
      if (errors.amount) setStep("amount");
      else if (errors.to) setStep("account");
      else if (errors.splits) setStep("category");
      return;
    }
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
  const roots = categories.filter(
    (c) => c.type === catType && c.parentId === null && (!c.archived || c.id === categoryId),
  );
  const selected = categories.find((c) => c.id === categoryId);
  const activeRoot = selected?.parentId ? selected.parentId : selected?.id;
  const children = categories.filter(
    (c) => c.parentId === activeRoot && (!c.archived || c.id === categoryId),
  );
  const toAccount = accounts.find((a) => a.id === toAccountId);
  const canJump = amount > 0;

  const title = editing ? (wasTransfer ? "Edit transfer" : "Edit transaction") : "New transaction";

  return (
    <Sheet visible onClose={onClose} title={title}>
      <StepPills steps={steps} current={step} reachable={canJump} onGo={setStep} />

      {step === "amount" ? (
        <View className="gap-3">
          {wasTransfer ? null : (
            <Tabs
              items={editing ? moneyKinds : allKinds}
              value={kind}
              onChange={(v) => changeKind(v)}
            />
          )}
          <View className="items-center py-4">
            <Amount
              value={amount * (transfer ? 1 : sign)}
              currency={currency}
              size="display"
              tone={transfer ? "text" : "auto"}
              className="text-[48px] leading-[56px]"
            />
            <Text variant="small" tone="muted" className="pt-1">
              {account ? `${account.name} · ${currency}` : currency}
            </Text>
            {submitted && errors.amount ? (
              <Text variant="small" tone="negative" className="pt-1">
                {errors.amount}
              </Text>
            ) : null}
          </View>
          <AmountKeypad value={amount} onChange={setAmount} hundreds={exponent > 0} />
        </View>
      ) : null}

      {step === "account" ? (
        <View className="gap-3" accessibilityRole="radiogroup">
          <Text variant="small" tone="muted" weight="medium">
            {transfer ? "From" : "Which account?"}
          </Text>
          {accounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              selected={a.id === accountId}
              onPress={() => {
                changeAccount(a.id);
                if (!transfer) go(1);
              }}
            />
          ))}
          {transfer ? (
            <>
              <Text variant="small" tone="muted" weight="medium" className="pt-2">
                To
              </Text>
              {toOptions.length === 0 ? (
                <Text variant="small" tone="muted">
                  You need another {currency} account to transfer to.
                </Text>
              ) : (
                toOptions.map((a) => (
                  <AccountCard
                    key={a.id}
                    account={a}
                    selected={a.id === toAccountId}
                    onPress={() => {
                      setToAccountId(a.id);
                      go(1);
                    }}
                  />
                ))
              )}
              {submitted && errors.to ? (
                <Text variant="small" tone="negative">
                  {errors.to}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {step === "category" ? (
        <View className="gap-3">
          {splitMode ? (
            <View className="gap-3">
              {splits.map((row, i) => (
                <View key={row.key} className="flex-row items-end gap-2">
                  <View className="flex-1">
                    <Select
                      label={`Split ${i + 1}`}
                      options={pickList(row.categoryId)}
                      value={row.categoryId ?? "none"}
                      onChange={(v) =>
                        setSplits((rs) =>
                          rs.map((r) =>
                            r.key === row.key ? { ...r, categoryId: v === "none" ? null : v } : r,
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
              <Pressable
                accessibilityRole="button"
                onPress={() => setSplitMode(false)}
                className="self-start py-2 web:cursor-pointer web:outline-none web:hover:opacity-70"
              >
                <Text variant="small" weight="medium" tone="muted">
                  Remove split
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View className="flex-row flex-wrap gap-[2.5%]" accessibilityRole="radiogroup">
                <CategoryTile
                  label="None"
                  icon={categoryIcon(null)}
                  tint={colors.subtle}
                  selected={categoryId === null}
                  onPress={() => {
                    setCategoryId(null);
                    go(1);
                  }}
                />
                {roots.map((c) => (
                  <CategoryTile
                    key={c.id}
                    label={c.name}
                    icon={categoryIcon(c.icon)}
                    tint={categoryTint(c, categories, scheme)}
                    selected={activeRoot === c.id}
                    onPress={() => {
                      setCategoryId(c.id);
                      if (!categories.some((x) => x.parentId === c.id && !x.archived)) go(1);
                    }}
                  />
                ))}
              </View>
              {children.length > 0 ? (
                <View className="gap-2">
                  <Text variant="small" tone="muted" weight="medium">
                    Subcategory
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {children.map((c) => (
                      <ToggleChip
                        key={c.id}
                        label={c.name}
                        color={categoryTint(c, categories, scheme)}
                        selected={categoryId === c.id}
                        onPress={() => {
                          setCategoryId(c.id);
                          go(1);
                        }}
                      />
                    ))}
                    <ToggleChip
                      label={`Just ${selected?.parentId ? categories.find((x) => x.id === selected.parentId)?.name : selected?.name}`}
                      selected={categoryId === activeRoot}
                      onPress={() => {
                        if (activeRoot) setCategoryId(activeRoot);
                        go(1);
                      }}
                    />
                  </View>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                onPress={startSplit}
                className="self-start py-2 web:cursor-pointer web:outline-none web:hover:opacity-70"
              >
                <Text variant="small" weight="medium" tone="muted">
                  Split across categories
                </Text>
              </Pressable>
            </>
          )}
        </View>
      ) : null}

      {step === "details" ? (
        <View className="gap-4">
          <View
            className="flex-row items-center gap-3 rounded-lg p-3"
            style={{ boxShadow: `0 0 0 1px ${colors.border}` }}
          >
            <IconTile>
              {transfer ? (
                <ArrowLeftRight size={18} color={colors.muted} strokeWidth={1.6} />
              ) : (
                (() => {
                  const Icon = categoryIcon(selected?.icon ?? null);
                  return (
                    <Icon
                      size={18}
                      color={selected ? categoryTint(selected, categories, scheme) : colors.muted}
                      strokeWidth={1.6}
                    />
                  );
                })()
              )}
            </IconTile>
            <View className="flex-1">
              <Text weight="medium" numberOfLines={1}>
                {transfer
                  ? `${account?.name ?? ""} → ${toAccount?.name ?? "…"}`
                  : splitMode
                    ? "Split"
                    : (selected?.name ?? "No category")}
              </Text>
              <Text variant="small" tone="muted" numberOfLines={1}>
                {transfer ? "Transfer" : (account?.name ?? "")}
              </Text>
            </View>
            <Amount
              value={amount * (transfer ? 1 : sign)}
              currency={currency}
              tone={transfer ? "text" : "auto"}
            />
          </View>

          <View className="gap-2">
            <DatePicker
              label="Date"
              value={date}
              onChange={setDate}
              error={submitted ? errors.date : undefined}
            />
            <View className="flex-row gap-2">
              <ToggleChip label="Today" selected={date === today} onPress={() => setDate(today)} />
              <ToggleChip
                label="Yesterday"
                selected={date === addDays(today, -1)}
                onPress={() => setDate(addDays(today, -1))}
              />
            </View>
          </View>

          {transfer ? null : (
            <Input
              label="Payee"
              value={payee}
              onChangeText={setPayee}
              placeholder="Who was it with?"
            />
          )}
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
                  <ToggleChip
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
        </View>
      ) : null}

      <View className="gap-2 pt-1">
        {last ? (
          <Button
            label={editing ? "Save changes" : "Add transaction"}
            loading={busy}
            onPress={save}
          />
        ) : (
          <Button label="Next" disabled={amount <= 0} onPress={() => go(1)} />
        )}
        <View className="flex-row items-center justify-between">
          {index === 0 ? (
            <Button label="Cancel" variant="ghost" onPress={onClose} />
          ) : (
            <Button label="Back" variant="ghost" onPress={() => go(-1)} />
          )}
          {!last && canJump && !invalid ? (
            <Button label="Save now" variant="ghost" loading={busy} onPress={save} />
          ) : null}
          {last && editing ? (
            <Button label="Delete" variant="ghost" onPress={() => setConfirmDelete(true)} />
          ) : null}
        </View>
      </View>

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
