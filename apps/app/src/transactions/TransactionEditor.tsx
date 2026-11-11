import {
  type Account,
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
  AnimatedView,
  Button,
  DatePicker,
  IconTile,
  Input,
  MotionView,
  Select,
  Sheet,
  Skeleton,
  Switch,
  Tabs,
  Text,
  toast,
  usePressScale,
  useTheme,
} from "@wallt/ui";
import { useRouter } from "expo-router";
import { ArrowLeftRight, Check, Plus, X } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Easing, FadeInLeft, FadeInRight } from "react-native-reanimated";
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
import { useTranslation } from "../i18n";
import { AmountKeypad, backspace, pressDigits } from "./AmountKeypad";
import { useEditorStore } from "./editorStore";

type Kind = "expense" | "income" | "transfer";
type StepId = "amount" | "account" | "category" | "details";

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
  const { t } = useTranslation();
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
      <Sheet visible onClose={close} title={t("transactions.editor.loadingTitle")}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-44 w-full" />
      </Sheet>
    );
  }
  if (txId && !tx.data) {
    return (
      <Sheet visible onClose={close} title={t("transactions.editor.notFoundTitle")}>
        <Text tone="muted">{t("transactions.editor.notFoundBody")}</Text>
        <Button label={t("transactions.editor.close")} variant="secondary" onPress={close} />
      </Sheet>
    );
  }
  if (accounts.data.length === 0) {
    return (
      <Sheet visible onClose={close} title={t("transactions.editor.noAccountTitle")}>
        <Text tone="muted">{t("transactions.editor.noAccountBody")}</Text>
        <Button
          label={t("transactions.editor.goToAccounts")}
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
  const { t } = useTranslation();
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
            accessibilityLabel={t("transactions.editor.stepLabel", {
              n: i + 1,
              title: t(`transactions.editor.steps.${s}`),
            })}
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
              {t(`transactions.editor.steps.${s}`)}
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
  const press = usePressScale();
  return (
    <MotionView style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
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
    </MotionView>
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
  const press = usePressScale();
  return (
    <MotionView style={[{ width: "31.5%" }, press.style]}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: selected }}
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        className="items-center gap-1.5 rounded-lg px-1 py-3 web:cursor-pointer web:outline-none web:transition-shadow web:duration-150 web:hover:bg-text/5"
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
    </MotionView>
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
  const { t } = useTranslation();
  const router = useRouter();
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
  // Steps slide in from the side you are heading to (forward from the right, back from the left).
  const previous = useRef(index);
  const forward = index >= previous.current;
  useEffect(() => {
    previous.current = index;
  }, [index]);
  const stepEnter = (forward ? FadeInRight : FadeInLeft)
    .duration(240)
    .easing(Easing.out(Easing.cubic));
  const remaining = splitsRemaining(
    amount,
    splits.map((s) => ({ amount: s.amount ?? 0 })),
  );
  const toOptions = accounts.filter((a) => a.id !== accountId && a.currency === currency);

  const errors = {
    amount: amount <= 0 ? t("transactions.editor.errAmount") : undefined,
    date: isValidDate(date) ? undefined : t("transactions.editor.errDate"),
    to: transfer && !toAccountId ? t("transactions.editor.errTo") : undefined,
    splits:
      !transfer && splitMode
        ? splits.length < 2
          ? t("transactions.editor.errSplitsMin")
          : splits.some((s) => s.amount === null || s.amount <= 0)
            ? t("transactions.editor.errSplitsAmount")
            : remaining !== 0
              ? t("transactions.editor.errSplitsTotal")
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
  const allKinds = [
    { value: "expense", label: t("transactions.editor.kinds.expense") },
    { value: "income", label: t("transactions.editor.kinds.income") },
    { value: "transfer", label: t("transactions.editor.kinds.transfer") },
  ] as const;
  const moneyKinds = allKinds.slice(0, 2);

  // Physical keyboard on the amount step (web): digits, backspace, enter.
  useEffect(() => {
    if (step !== "amount" || typeof document === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) setAmount((v) => pressDigits(v, e.key));
      else if (e.key === "Backspace") setAmount((v) => backspace(v));
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step]);

  // Enter = the primary button: Next on every step but the last, Save on the last (web).
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onEnter = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.isComposing)
        return;
      if (confirmDelete || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      // Focused buttons/links/selects activate themselves; textareas need Enter for newlines.
      if (el && ["BUTTON", "A", "SELECT", "TEXTAREA"].includes(el.tagName)) return;
      if (el?.getAttribute("role") === "button" || el?.getAttribute("role") === "radio") return;
      if (last) {
        // Single-line inputs on the last step (e.g. new tag) handle Enter themselves.
        if (el?.tagName === "INPUT" || busy || invalid) return;
        e.preventDefault();
        void save();
      } else if (amount > 0) {
        e.preventDefault();
        go(1);
      }
    };
    document.addEventListener("keydown", onEnter);
    return () => document.removeEventListener("keydown", onEnter);
  });

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
    const existingTag = tags.find((x) => x.name.toLowerCase() === name.toLowerCase());
    try {
      const tag = existingTag ?? (await createTag.mutateAsync({ name }));
      setTagIds((ids) => (ids.includes(tag.id) ? ids : [...ids, tag.id]));
      setNewTag("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("transactions.editor.tagFailed"));
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
      toast.success(t(editing ? "transactions.editor.updated" : "transactions.editor.added"));
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("transactions.editor.saveFailed"));
    }
  }

  async function doDelete() {
    if (!existing) return;
    try {
      await remove.mutateAsync(existing.id);
      toast.success(
        t(
          wasTransfer
            ? "transactions.editor.transferDeleted"
            : "transactions.editor.transactionDeleted",
        ),
      );
      setConfirmDelete(false);
      onClose();
    } catch (error) {
      setConfirmDelete(false);
      toast.error(error instanceof Error ? error.message : t("transactions.editor.deleteFailed"));
    }
  }

  const catType = kind === "income" ? "income" : "expense";
  const pickList = (keep: string | null) => [
    { value: "none", label: t("transactions.editor.noCategory") },
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

  const title = editing
    ? wasTransfer
      ? t("transactions.editor.editTransfer")
      : t("transactions.editor.editTransaction")
    : t("transactions.editor.newTransaction");

  return (
    <Sheet visible onClose={onClose} title={title}>
      <StepPills steps={steps} current={step} reachable={canJump} onGo={setStep} />

      {step === "amount" ? (
        <AnimatedView key="amount" entering={stepEnter} className="gap-3">
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
              ticker
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
        </AnimatedView>
      ) : null}

      {step === "account" ? (
        <AnimatedView
          key="account"
          entering={stepEnter}
          className="gap-3"
          accessibilityRole="radiogroup"
        >
          <Text variant="small" tone="muted" weight="medium">
            {transfer ? t("transactions.editor.from") : t("transactions.editor.whichAccount")}
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
                {t("transactions.editor.to")}
              </Text>
              {toOptions.length === 0 ? (
                <Text variant="small" tone="muted">
                  {t("transactions.editor.needAnotherAccount", { currency })}
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
        </AnimatedView>
      ) : null}

      {step === "category" ? (
        <AnimatedView key="category" entering={stepEnter} className="gap-3">
          {splitMode ? (
            <View className="gap-3">
              {splits.map((row, i) => (
                <View key={row.key} className="flex-row items-end gap-2">
                  <View className="flex-1">
                    <Select
                      label={t("transactions.editor.splitN", { n: i + 1 })}
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
                      label={t("transactions.editor.amount")}
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
                      accessibilityLabel={t("transactions.editor.removeSplitN", { n: i + 1 })}
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
                    {t("transactions.editor.addSplit")}
                  </Text>
                </Pressable>
                <View className="flex-row items-center gap-1.5">
                  <Text variant="small" tone="muted">
                    {t("transactions.editor.leftToAllocate")}
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
                  {t("transactions.editor.removeSplit")}
                </Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View
                className="flex-row flex-wrap"
                style={{ columnGap: "2.5%", rowGap: 10 }}
                accessibilityRole="radiogroup"
              >
                <CategoryTile
                  label={t("transactions.editor.none")}
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
                    {t("transactions.editor.subcategory")}
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
                      label={t("transactions.editor.just", {
                        name: selected?.parentId
                          ? (categories.find((x) => x.id === selected.parentId)?.name ?? "")
                          : (selected?.name ?? ""),
                      })}
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
                  {t("transactions.editor.splitAcross")}
                </Text>
              </Pressable>
            </>
          )}
        </AnimatedView>
      ) : null}

      {step === "details" ? (
        <AnimatedView key="details" entering={stepEnter} className="gap-4">
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
                    ? t("transactions.editor.split")
                    : (selected?.name ?? t("transactions.editor.noCategory"))}
              </Text>
              <Text variant="small" tone="muted" numberOfLines={1}>
                {transfer ? t("transactions.editor.transfer") : (account?.name ?? "")}
              </Text>
            </View>
            <Amount
              value={amount * (transfer ? 1 : sign)}
              currency={currency}
              tone={transfer ? "text" : "auto"}
            />
          </View>

          <DatePicker
            label={t("transactions.editor.date")}
            value={date}
            onChange={setDate}
            error={submitted ? errors.date : undefined}
          />

          {transfer ? null : (
            <Input
              label={t("transactions.editor.payee")}
              value={payee}
              onChangeText={setPayee}
              placeholder={t("transactions.editor.payeePlaceholder")}
            />
          )}
          <Input
            label={t("transactions.editor.notes")}
            value={notes}
            onChangeText={setNotes}
            placeholder={t("transactions.editor.notesPlaceholder")}
            multiline
          />

          {transfer ? null : (
            <View className="gap-2">
              <Text variant="small" tone="muted" weight="medium">
                {t("transactions.editor.tags")}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {tags.map((tag) => (
                  <ToggleChip
                    key={tag.id}
                    label={tag.name}
                    selected={tagIds.includes(tag.id)}
                    onPress={() =>
                      setTagIds((ids) =>
                        ids.includes(tag.id) ? ids.filter((x) => x !== tag.id) : [...ids, tag.id],
                      )
                    }
                  />
                ))}
              </View>
              <Input
                value={newTag}
                onChangeText={setNewTag}
                placeholder={t("transactions.editor.newTagPlaceholder")}
                onSubmitEditing={addTag}
                returnKeyType="done"
                accessibilityLabel={t("transactions.editor.newTagLabel")}
              />
            </View>
          )}

          <View className="gap-1">
            <Switch
              label={t("transactions.editor.pending")}
              description={t("transactions.editor.pendingHint")}
              value={status === "pending"}
              onValueChange={(on) => setStatus(on ? "pending" : "booked")}
            />
            <Switch
              label={t("transactions.editor.includeInReports")}
              value={counted === "in"}
              onValueChange={(on) => setCounted(on ? "in" : "out")}
            />
          </View>
        </AnimatedView>
      ) : null}

      <View className="gap-2 pt-1">
        {last ? (
          <Button
            label={t(
              editing ? "transactions.editor.saveChanges" : "transactions.editor.addTransaction",
            )}
            loading={busy}
            onPress={save}
          />
        ) : (
          <Button
            label={t("transactions.editor.next")}
            disabled={amount <= 0}
            onPress={() => go(1)}
          />
        )}
        <View className="flex-row items-center justify-between">
          {index === 0 ? (
            <Button label={t("transactions.editor.cancel")} variant="ghost" onPress={onClose} />
          ) : (
            <Button label={t("transactions.editor.back")} variant="ghost" onPress={() => go(-1)} />
          )}
          {!last && canJump && !invalid ? (
            <Button
              label={t("transactions.editor.saveNow")}
              variant="ghost"
              loading={busy}
              onPress={save}
            />
          ) : null}
          {last && editing && !wasTransfer && existing ? (
            <Button
              label={t("transactions.editor.createRule")}
              variant="ghost"
              onPress={() => {
                onClose();
                router.push({ pathname: "/rules", params: { tx: existing.id } });
              }}
            />
          ) : null}
          {last && editing ? (
            <Button
              label={t("transactions.editor.delete")}
              variant="ghost"
              onPress={() => setConfirmDelete(true)}
            />
          ) : null}
        </View>
      </View>

      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={
          wasTransfer
            ? t("transactions.editor.deleteTransferTitle")
            : t("transactions.editor.deleteTransactionTitle")
        }
      >
        <Text tone="muted">
          {wasTransfer
            ? t("transactions.editor.deleteTransferBody")
            : t("transactions.editor.deleteTransactionBody")}
        </Text>
        <Button
          label={t("transactions.editor.delete")}
          variant="destructive"
          loading={remove.isPending}
          onPress={doDelete}
        />
        <Button
          label={t("transactions.editor.cancel")}
          variant="ghost"
          onPress={() => setConfirmDelete(false)}
        />
      </Sheet>
    </Sheet>
  );
}
