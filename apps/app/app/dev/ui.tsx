import {
  type AccentName,
  AmountInput,
  accentPalette,
  Button,
  Card,
  categoryPalette,
  EmptyState,
  HeroCard,
  Input,
  ListItem,
  LogoMark,
  type SchemePreference,
  Select,
  Sheet,
  Skeleton,
  Table,
  Tabs,
  Text,
  toast,
  useBreakpoint,
  useTheme,
} from "@wallt/ui";
import { Redirect } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

interface DemoRow {
  id: string;
  date: string;
  payee: string;
  category: string;
  amount: string;
  negative: boolean;
}

const rows: DemoRow[] = [
  {
    id: "1",
    date: "2026-11-04",
    payee: "Corner Market",
    category: "Groceries",
    amount: "-42,30 €",
    negative: true,
  },
  {
    id: "2",
    date: "2026-11-03",
    payee: "Acme Payroll",
    category: "Salary",
    amount: "2 450,00 €",
    negative: false,
  },
  {
    id: "3",
    date: "2026-11-01",
    payee: "City Transit",
    category: "Transport",
    amount: "-30,00 €",
    negative: true,
  },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="title">{title}</Text>
      {children}
    </View>
  );
}

const preferences: { value: SchemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const accountOptions = [
  { value: "checking", label: "Checking", description: "Everyday account" },
  { value: "savings", label: "Savings", description: "Emergency fund" },
  { value: "cash", label: "Cash" },
] as const;

/** Visual-review gallery (plan §9.3). Development builds only. */
export default function UiGallery() {
  const { scheme, preference, setPreference, accent, setAccent, colors } = useTheme();
  const bp = useBreakpoint();
  const [tab, setTab] = useState<"all" | "income" | "expense">("all");
  const [account, setAccount] = useState<string | null>("checking");
  const [amount, setAmount] = useState<number | null>(123456);
  const [sheet, setSheet] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!__DEV__) return <Redirect href="/" />;

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="mx-auto w-full max-w-[960px] gap-8 p-4 pb-16 tablet:p-8"
    >
      <View className="gap-2">
        <View className="flex-row items-center gap-3">
          <LogoMark />
          <Text variant="display">UI gallery</Text>
        </View>
        <Text tone="muted">
          Breakpoint: {bp} · scheme: {scheme} · dev only
        </Text>
        <View className="flex-row flex-wrap items-center gap-3">
          <Tabs items={preferences} value={preference} onChange={setPreference} />
          <View className="flex-row gap-2" accessibilityRole="radiogroup">
            {(Object.keys(accentPalette) as AccentName[]).map((name) => (
              <Pressable
                key={name}
                accessibilityRole="radio"
                accessibilityLabel={`Accent ${name}`}
                accessibilityState={{ checked: accent === name }}
                onPress={() => setAccent(name)}
                className="h-11 w-11 items-center justify-center web:cursor-pointer"
              >
                <View
                  style={{ backgroundColor: accentPalette[name][scheme] }}
                  className={
                    accent === name
                      ? "h-7 w-7 rounded-full border-2 border-text"
                      : "h-7 w-7 rounded-full"
                  }
                />
              </Pressable>
            ))}
          </View>
        </View>
      </View>

      <HeroCard>
        <Text variant="caption" tone="onHero" className="opacity-80">
          NET WORTH (hero gradient)
        </Text>
        <Text variant="display" tone="onHero" tabular>
          12 480,00 €
        </Text>
        <Text variant="small" tone="onHero" tabular className="opacity-90">
          +3,2 % this month
        </Text>
      </HeroCard>
      <Section title="Typography">
        <Card className="gap-1">
          <Text variant="display" tabular>
            1 234,56 €
          </Text>
          <Text variant="heading">Heading</Text>
          <Text variant="title">Title</Text>
          <Text>Body text — the quick brown fox jumps over the lazy dog.</Text>
          <Text variant="small" tone="muted">
            Small muted text
          </Text>
          <Text variant="caption" tone="muted">
            CAPTION
          </Text>
          <View className="mt-2 flex-row flex-wrap gap-4">
            <Text tone="accent">Accent</Text>
            <Text tone="positive" tabular>
              +120,00 €
            </Text>
            <Text tone="negative" tabular>
              -45,10 €
            </Text>
            <Text tone="warning">Warning</Text>
          </View>
        </Card>
      </Section>

      <Section title="Buttons">
        <View className="flex-row flex-wrap gap-3">
          <Button label="Primary" onPress={() => toast.success("Saved")} />
          <Button label="Secondary" variant="secondary" onPress={() => toast.show("Heads up")} />
          <Button label="Ghost" variant="ghost" />
          <Button label="Delete" variant="danger" onPress={() => toast.error("Could not delete")} />
          <Button label="Disabled" disabled />
          <Button
            label={loading ? "Saving…" : "Loading demo"}
            loading={loading}
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          />
          <Button label="Large" size="lg" />
        </View>
      </Section>

      <Section title="Inputs">
        <View className="gap-4 tablet:flex-row">
          <Input className="tablet:flex-1" label="Payee" placeholder="Who did you pay?" />
          <Input
            className="tablet:flex-1"
            label="With helper"
            helper="Optional note"
            placeholder="Note"
          />
          <Input className="tablet:flex-1" label="With error" error="This field is required" />
        </View>
        <View className="gap-4 tablet:flex-row">
          <AmountInput
            className="tablet:flex-1"
            label={`Amount (minor units: ${amount ?? "empty"})`}
            value={amount}
            onChangeValue={setAmount}
            currency="EUR"
            placeholder="0,00"
          />
          <Select
            className="tablet:flex-1"
            label="Account"
            options={accountOptions}
            value={account as (typeof accountOptions)[number]["value"] | null}
            onChange={setAccount}
          />
        </View>
      </Section>

      <Section title="Tabs">
        <Tabs
          items={[
            { value: "all", label: "All" },
            { value: "income", label: "Income" },
            { value: "expense", label: "Expenses" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </Section>

      <Section title="Cards and list items">
        <View className="gap-4 desktop:flex-row">
          <Card className="desktop:flex-1 p-0 overflow-hidden">
            {rows.map((r, i) => (
              <ListItem
                key={r.id}
                title={r.payee}
                subtitle={`${r.category} · ${r.date}`}
                divider={i < rows.length - 1}
                onPress={() => toast.show(`Open ${r.payee}`)}
                leading={
                  <View
                    style={{ backgroundColor: colors.accent }}
                    className="h-9 w-9 items-center justify-center rounded-full"
                  >
                    <Text variant="small" tone="onAccent">
                      {r.payee.slice(0, 1)}
                    </Text>
                  </View>
                }
                trailing={
                  <Text tabular tone={r.negative ? "default" : "positive"}>
                    {r.amount}
                  </Text>
                }
              />
            ))}
          </Card>
          <Card variant="glass" className="gap-2 desktop:flex-1">
            <Text variant="caption" tone="muted">
              NET WORTH (glass card)
            </Text>
            <Text variant="display" tabular>
              12 480,00 €
            </Text>
            <Text tone="positive" variant="small" tabular>
              +3,2 % this month
            </Text>
          </Card>
        </View>
      </Section>

      <Section title="Table">
        <Card className="p-0 overflow-hidden">
          <Table
            rows={rows}
            rowKey={(r) => r.id}
            onRowPress={(r) => toast.show(`Row ${r.id}`)}
            columns={[
              {
                key: "date",
                header: "Date",
                width: 140,
                render: (r) => <Text tabular>{r.date}</Text>,
              },
              { key: "payee", header: "Payee", render: (r) => <Text>{r.payee}</Text> },
              {
                key: "category",
                header: "Category",
                render: (r) => <Text tone="muted">{r.category}</Text>,
              },
              {
                key: "amount",
                header: "Amount",
                width: 140,
                align: "right",
                render: (r) => (
                  <Text tabular tone={r.negative ? "default" : "positive"}>
                    {r.amount}
                  </Text>
                ),
              },
            ]}
          />
        </Card>
      </Section>

      <Section title="Sheet / modal and toast">
        <View className="flex-row flex-wrap gap-3">
          <Button label="Open sheet" variant="secondary" onPress={() => setSheet(true)} />
          <Button
            label="Info toast"
            variant="secondary"
            onPress={() => toast.show("Synced just now")}
          />
          <Button
            label="Success toast"
            variant="secondary"
            onPress={() => toast.success("Transaction added")}
          />
          <Button
            label="Error toast"
            variant="secondary"
            onPress={() => toast.error("Something went wrong")}
          />
        </View>
        <Sheet visible={sheet} onClose={() => setSheet(false)} title="Add transaction">
          <Input label="Payee" placeholder="Who did you pay?" />
          <Button label="Save" onPress={() => setSheet(false)} />
          <Button label="Cancel" variant="ghost" onPress={() => setSheet(false)} />
        </Sheet>
      </Section>

      <Section title="Empty state and skeleton">
        <View className="gap-4 tablet:flex-row">
          <Card className="tablet:flex-1">
            <EmptyState
              icon={<Text variant="heading">◎</Text>}
              title="No transactions yet"
              description="Add your first transaction or import a statement from your bank."
              actionLabel="Add transaction"
              onAction={() => toast.show("Add transaction")}
            />
          </Card>
          <Card className="gap-3 tablet:flex-1">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <View className="flex-row items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <View className="flex-1 gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </View>
            </View>
          </Card>
        </View>
      </Section>

      <Section title="Category colours">
        <View className="flex-row flex-wrap gap-3">
          {Object.entries(categoryPalette).map(([name, c]) => (
            <View key={name} className="items-center gap-1">
              <View style={{ backgroundColor: c[scheme] }} className="h-10 w-10 rounded-full" />
              <Text variant="caption" tone="muted">
                {name}
              </Text>
            </View>
          ))}
        </View>
      </Section>
    </ScrollView>
  );
}
