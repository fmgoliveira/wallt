import {
  endOfMonth,
  formatAmount,
  fromLocalDate,
  netWorthByCurrency,
  startOfMonth,
} from "@wallt/core";
import {
  Amount,
  Button,
  Card,
  Chip,
  EmptyState,
  HeroCard,
  IconTile,
  ListItem,
  Skeleton,
  Text,
  useBreakpoint,
  usePrivacyStore,
  useTheme,
} from "@wallt/ui";
import { useRouter } from "expo-router";
import { ArrowLeftRight, CircleCheck, PiggyBank, Receipt } from "lucide-react-native";
import { type ReactNode, useMemo } from "react";
import { Pressable, View } from "react-native";
import { BudgetCard } from "../budgets/BudgetCard";
import { categoryTint } from "../categories/color";
import { categoryIcon } from "../categories/icons";
import {
  useAccountsWithBalances,
  useBudgetStatuses,
  useCashflow,
  useCategories,
  useSpendingByCategory,
  useTransactionCount,
  useTransactions,
} from "../data/hooks";
import { placeholderIcon } from "../shell/placeholder";
import { useEditorStore } from "../transactions/editorStore";
import { type TxRow, useTxRows } from "../transactions/rows";
import { ConvertedTotal } from "./ConvertedTotal";

const monthName = (date: string) => {
  const [y = 0, m = 1] = date.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long" });
};

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text variant="title">{title}</Text>
        {action}
      </View>
      {children}
    </Card>
  );
}

function NetWorth({ range }: { range: { from: string; to: string } }) {
  const router = useRouter();
  const accounts = useAccountsWithBalances();
  const flow = useCashflow(range);
  const hidden = usePrivacyStore((s) => s.hidden);

  if (accounts.isPending) {
    return (
      <HeroCard>
        <Skeleton className="h-4 w-24" />
        <Skeleton className="my-2 h-10 w-48" />
      </HeroCard>
    );
  }
  const totals = netWorthByCurrency(accounts.data ?? []);
  if ((accounts.data ?? []).length === 0) {
    return (
      <HeroCard>
        <Text variant="small" tone="onHero" weight="medium" className="opacity-60">
          Net worth
        </Text>
        <View className="my-1.5">
          <Amount value={0} size="display" tone="onHero" />
        </View>
        <View className="flex-row">
          <Button label="Add an account" onPress={() => router.push("/accounts")} />
        </View>
      </HeroCard>
    );
  }
  return (
    <HeroCard>
      <Text variant="small" tone="onHero" weight="medium" className="opacity-60">
        Net worth
      </Text>
      <View className="my-1.5 gap-1">
        {totals.map((m) => (
          <Amount
            key={m.currency}
            value={m.amount}
            currency={m.currency}
            size="display"
            tone="onHero"
            ticker
          />
        ))}
      </View>
      <ConvertedTotal balances={totals} />
      <View className="flex-row flex-wrap gap-2">
        {(flow.data ?? []).map((f) => {
          const net = f.income + f.expense;
          return (
            <Chip
              key={f.currency}
              onHero={net >= 0}
              tone={net >= 0 ? "positive" : "negative"}
              label={`${hidden ? "Hidden" : `${net >= 0 ? "+" : ""}${formatAmount({ amount: net, currency: f.currency })} this month`}`}
            />
          );
        })}
      </View>
    </HeroCard>
  );
}

function Cashflow({ range, month }: { range: { from: string; to: string }; month: string }) {
  const flow = useCashflow(range);
  return (
    <SectionCard title={`${month} cashflow`}>
      {flow.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : (flow.data ?? []).length === 0 ? (
        <Text tone="muted">Nothing recorded this month yet.</Text>
      ) : (
        flow.data?.map((f) => {
          const spent = -f.expense;
          const top = Math.max(f.income, spent, 1);
          return (
            <View key={f.currency} className="gap-3">
              <View className="flex-row justify-between">
                <View>
                  <Text variant="small" tone="muted">
                    Income
                  </Text>
                  <Amount value={f.income} currency={f.currency} size="heading" />
                </View>
                <View className="items-end">
                  <Text variant="small" tone="muted">
                    Spending
                  </Text>
                  <Amount value={f.expense} currency={f.currency} size="heading" tone="text" />
                </View>
              </View>
              <FlowBar income={f.income / top} spent={spent / top} />
              <View className="flex-row items-center justify-between">
                <Text variant="small" tone="muted">
                  Net
                </Text>
                <Amount value={f.income + f.expense} currency={f.currency} />
              </View>
            </View>
          );
        })
      )}
    </SectionCard>
  );
}

function FlowBar({ income, spent }: { income: number; spent: number }) {
  const { colors } = useTheme();
  const bar = (share: number, color: string, label: string) => (
    <View
      accessibilityLabel={`${label} ${Math.round(share * 100)}% of the larger side`}
      style={{ height: 8, borderRadius: 4, backgroundColor: colors.border }}
    >
      <View
        style={{
          width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%`,
          height: 8,
          borderRadius: 4,
          backgroundColor: color,
        }}
      />
    </View>
  );
  return (
    <View className="gap-1.5">
      {bar(income, colors.positive, "Income")}
      {bar(spent, colors.text, "Spending")}
    </View>
  );
}

function TopSpending({ range }: { range: { from: string; to: string } }) {
  const { scheme, colors } = useTheme();
  const spending = useSpendingByCategory(range);
  const categories = useCategories({ includeArchived: true }).data ?? [];
  const rows = useMemo(() => {
    const byCat = new Map(categories.map((c) => [c.id, c]));
    // Subcategories roll up into their parent so the top list reads at one level.
    const merged = new Map<string, { id: string | null; currency: string; total: number }>();
    for (const s of spending.data ?? []) {
      const own = s.categoryId ? byCat.get(s.categoryId) : undefined;
      const id = own?.parentId ?? s.categoryId;
      const key = `${id ?? ""}|${s.currency}`;
      const cur = merged.get(key);
      if (cur) cur.total += s.total;
      else merged.set(key, { id, currency: s.currency, total: s.total });
    }
    return [...merged.values()].sort((a, b) => a.total - b.total).slice(0, 5);
  }, [spending.data, categories]);
  const biggest = Math.max(1, ...rows.map((r) => -r.total));

  return (
    <SectionCard title="Top spending">
      {spending.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : rows.length === 0 ? (
        <Text tone="muted">No spending this month.</Text>
      ) : (
        rows.map((r) => {
          const cat = categories.find((c) => c.id === r.id);
          const Icon = categoryIcon(cat?.icon ?? null);
          const tint = cat ? categoryTint(cat, categories, scheme) : colors.subtle;
          return (
            <View key={`${r.id}|${r.currency}`} className="gap-1.5">
              <View className="flex-row items-center gap-2">
                <Icon size={16} color={tint} strokeWidth={1.6} />
                <Text className="flex-1" numberOfLines={1}>
                  {cat?.name ?? "Uncategorised"}
                </Text>
                <Amount value={r.total} currency={r.currency} tone="text" />
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.border }}>
                <View
                  style={{
                    width: `${Math.max((-r.total / biggest) * 100, 3)}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: tint,
                  }}
                />
              </View>
            </View>
          );
        })
      )}
    </SectionCard>
  );
}

function Recent() {
  const router = useRouter();
  const { colors } = useTheme();
  const recent = useTransactions({ limit: 8 });
  const rows = useTxRows(recent.data ?? []);
  const open = (row: TxRow) => useEditorStore.getState().openEdit(row.id);

  return (
    <Card className="gap-1 p-0">
      <View className="flex-row items-center justify-between px-4 pt-4 pb-2 tablet:px-5">
        <Text variant="title">Recent</Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/transactions")}
          hitSlop={8}
          className="py-1 web:cursor-pointer web:outline-none web:hover:opacity-70 active:opacity-60"
        >
          <Text variant="small" weight="medium" tone="muted">
            See all
          </Text>
        </Pressable>
      </View>
      {recent.isPending ? (
        <View className="gap-3 px-4 pb-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={placeholderIcon(Receipt)}
          title="No transactions yet"
          description="Add your first one to see it here."
          actionLabel="Add transaction"
          onAction={() => useEditorStore.getState().openNew()}
        />
      ) : (
        rows.map((row, i) => {
          const Icon = row.transfer ? ArrowLeftRight : categoryIcon(row.categoryIcon);
          return (
            <ListItem
              key={row.id}
              divider={i > 0}
              title={row.title}
              subtitle={`${row.tx.bookingDate} · ${row.accountName}`}
              leading={
                <IconTile>
                  <Icon
                    size={18}
                    color={row.transfer ? colors.muted : row.categoryTint}
                    strokeWidth={1.6}
                  />
                </IconTile>
              }
              trailing={
                <Amount
                  value={row.tx.amount}
                  currency={row.tx.currency}
                  tone={row.transfer ? "text" : "auto"}
                />
              }
              onPress={() => open(row)}
            />
          );
        })
      )}
    </Card>
  );
}

/** Slot for the categorisation review queue (P5): shows how many need review, or that all is clear. */
function ReviewSlot({ className }: { className?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const count = useTransactionCount({ needsReview: true });
  const n = count.data ?? 0;
  return (
    <Card className={`flex-row items-center gap-3 ${className ?? ""}`}>
      <IconTile>
        <CircleCheck size={18} color={n > 0 ? colors.warning : colors.positive} strokeWidth={1.6} />
      </IconTile>
      <View className="flex-1">
        <Text weight="medium">{n > 0 ? `${n} to review` : "Nothing to review"}</Text>
        <Text variant="small" tone="muted">
          {n > 0
            ? "Check the categories we suggested."
            : "New transactions that need a look appear here."}
        </Text>
      </View>
      {n > 0 ? (
        <Button label="Review" variant="secondary" onPress={() => router.push("/transactions")} />
      ) : null}
    </Card>
  );
}

/** Budgets snapshot: the three budgets closest to (or over) their limit. */
function BudgetsSlot({ className }: { className?: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const budgets = useBudgetStatuses(fromLocalDate(new Date()));
  const items = (budgets.data ?? [])
    .filter((b) => b.status?.state === "active")
    .sort((x, y) => (y.status?.percent ?? 0) - (x.status?.percent ?? 0))
    .slice(0, 3);
  if (budgets.isPending) return <Skeleton className="h-24 w-full" />;
  if (items.length === 0) {
    return (
      <Card className={`flex-row items-center gap-3 ${className ?? ""}`}>
        <IconTile>
          <PiggyBank size={18} color={colors.muted} strokeWidth={1.6} />
        </IconTile>
        <View className="flex-1">
          <Text weight="medium">Budgets</Text>
          <Text variant="small" tone="muted">
            Set a spending limit to follow your progress here.
          </Text>
        </View>
        <Button label="Add" variant="secondary" onPress={() => router.push("/budgets")} />
      </Card>
    );
  }
  return (
    <SectionCard
      title="Budgets"
      action={
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/budgets")}
          hitSlop={8}
          className="py-1 web:cursor-pointer web:outline-none web:hover:opacity-70 active:opacity-60"
        >
          <Text variant="small" weight="medium" tone="muted">
            See all
          </Text>
        </Pressable>
      }
    >
      {items.map((item) => (
        <BudgetCard key={item.budget.id} item={item} compact />
      ))}
    </SectionCard>
  );
}

/** Dashboard v1. Phone: stacked. Tablet: two columns under the hero. Desktop: a 12-column grid (7 + 5). */
export function Dashboard() {
  const bp = useBreakpoint();
  const today = fromLocalDate(new Date());
  const range = useMemo(() => ({ from: startOfMonth(today), to: endOfMonth(today) }), [today]);
  const month = monthName(today);

  const net = <NetWorth range={range} />;
  const flow = <Cashflow range={range} month={month} />;
  const top = <TopSpending range={range} />;
  const recent = <Recent />;

  if (bp === "desktop") {
    return (
      <View className="gap-4">
        <View className="flex-row gap-4">
          <View className="flex-[7]">{net}</View>
          <View className="flex-[5]">{flow}</View>
        </View>
        <View className="flex-row items-start gap-4">
          <View className="flex-[7]">{recent}</View>
          <View className="flex-[5] gap-4">
            {top}
            <ReviewSlot />
            <BudgetsSlot />
          </View>
        </View>
      </View>
    );
  }
  if (bp === "tablet") {
    return (
      <View className="gap-4">
        {net}
        <View className="flex-row items-start gap-4">
          <View className="flex-1">{flow}</View>
          <View className="flex-1">{top}</View>
        </View>
        {recent}
        <View className="flex-row gap-4">
          <View className="flex-1">
            <ReviewSlot className="flex-1" />
          </View>
          <View className="flex-1">
            <BudgetsSlot className="flex-1" />
          </View>
        </View>
      </View>
    );
  }
  return (
    <View className="gap-4">
      {net}
      {flow}
      {top}
      {recent}
      <ReviewSlot />
      <BudgetsSlot />
    </View>
  );
}
