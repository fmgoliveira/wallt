import {
  Amount,
  AmountInput,
  actionGradient,
  areaGradient,
  Button,
  Card,
  type CategoryColorName,
  CategoryDot,
  Chip,
  categoryPalette,
  colorsByScheme,
  type DataColorName,
  dataPalette,
  EmptyState,
  Gradient,
  HeroCard,
  IconTile,
  Input,
  ListItem,
  Progress,
  type SchemePreference,
  Select,
  Sheet,
  Skeleton,
  semanticColorNames,
  surfaceGradient,
  Table,
  Tabs,
  Text,
  type TextVariant,
  toast,
  useBreakpoint,
  usePrivacyStore,
  useTheme,
} from "@wallt/ui";
import { Redirect } from "expo-router";
import { Banknote, Bus, Plus, ShoppingBasket, Wallet } from "lucide-react-native";
import { type ReactNode, useState } from "react";
import { Image, Pressable, ScrollView, View } from "react-native";

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

const rows: {
  id: string;
  date: string;
  payee: string;
  category: string;
  color: CategoryColorName;
  amount: number;
}[] = [
  {
    id: "1",
    date: "2026-11-04",
    payee: "Corner Market",
    category: "Groceries",
    color: "green",
    amount: -4230,
  },
  {
    id: "2",
    date: "2026-11-03",
    payee: "Acme Payroll",
    category: "Salary",
    color: "sky",
    amount: 245000,
  },
  {
    id: "3",
    date: "2026-11-01",
    payee: "City Transit",
    category: "Transport",
    color: "amber",
    amount: -3000,
  },
];

const typeSamples: { variant: TextVariant; text: string }[] = [
  { variant: "display", text: "12 480,00 €" },
  { variant: "heading", text: "Screen title" },
  { variant: "title", text: "Card title" },
  { variant: "body", text: "Body text: the quick brown fox jumps over the lazy dog." },
  { variant: "small", text: "Secondary line, table cells and labels" },
  { variant: "label", text: "Section label" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <Text variant="label">{title}</Text>
      {children}
    </View>
  );
}

/** Visual-review gallery (guidelines §12). Development builds only. */
export default function UiGallery() {
  const { scheme, colors, preference, setPreference, dataColor, setDataColor } = useTheme();
  const bp = useBreakpoint();
  const privacy = usePrivacyStore();
  const [tab, setTab] = useState<"all" | "income" | "expense">("all");
  const [account, setAccount] = useState<string | null>("checking");
  const [amount, setAmount] = useState<number | null>(123456);
  const [sheet, setSheet] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | undefined>("2");

  if (!__DEV__) return <Redirect href="/" />;

  const swatchTextOn = (hex: string) => (hex === colors.text ? colors.bg : colors.text);

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="mx-auto w-full max-w-[1180px] gap-10 px-4 pt-14 pb-24 tablet:px-6 desktop:px-8"
    >
      <View className="gap-3">
        <View className="flex-row items-center gap-3">
          <IconTile>
            <Image
              source={require("../../assets/icon.png")}
              style={{ width: 28, height: 28 }}
              resizeMode="contain"
              accessibilityLabel="Wallt"
            />
          </IconTile>
          <Text variant="heading">UI gallery</Text>
        </View>
        <Text tone="muted">
          Breakpoint {bp} · {scheme} · guidelines rev. 2 · dev only
        </Text>
        <View className="flex-row flex-wrap items-center gap-3">
          <Tabs items={preferences} value={preference} onChange={setPreference} />
          <View className="flex-row gap-1" accessibilityRole="radiogroup">
            {(Object.keys(dataPalette) as DataColorName[]).map((name) => (
              <Pressable
                key={name}
                accessibilityRole="radio"
                accessibilityLabel={`Data colour ${name}`}
                accessibilityState={{ checked: dataColor === name }}
                onPress={() => setDataColor(name)}
                className="h-11 w-11 items-center justify-center web:cursor-pointer web:outline-none"
              >
                <View
                  className="h-6 w-6 rounded-md"
                  style={{
                    backgroundColor: dataPalette[name][scheme],
                    boxShadow:
                      dataColor === name
                        ? `0 0 0 2px ${colors.bg}, 0 0 0 3.5px ${colors.text}`
                        : `0 0 0 1px ${colors.borderStrong}`,
                  }}
                />
              </Pressable>
            ))}
          </View>
          <Button
            label={privacy.hidden ? "Privacy: on" : "Privacy: off"}
            variant="secondary"
            onPress={privacy.toggle}
          />
        </View>
      </View>

      <HeroCard>
        <Text variant="small" tone="onHero" weight="medium" className="opacity-60">
          Net worth
        </Text>
        <View className="my-1.5">
          <Amount value={1248000} size="display" tone="onHero" ticker />
        </View>
        <Chip tone="positive" onHero label="+3,2 % this month" />
      </HeroCard>

      <Section title="Palette">
        <View className="flex-row flex-wrap gap-3">
          {semanticColorNames.map((name) => {
            const hex = name === "data" ? colors.data : colorsByScheme[scheme][name];
            return (
              <View key={name} className="w-[104px] gap-1.5">
                <View
                  className="h-14 justify-end rounded-md p-1.5"
                  style={{
                    backgroundColor: hex,
                    boxShadow: `inset 0 0 0 1px ${colors.border}`,
                  }}
                >
                  <Text variant="label" style={{ color: swatchTextOn(hex) }} className="text-[9px]">
                    {hex}
                  </Text>
                </View>
                <Text variant="small" tone="muted">
                  {name}
                </Text>
              </View>
            );
          })}
        </View>
        <Text variant="label">Category dots</Text>
        <View className="flex-row flex-wrap gap-3">
          {(Object.keys(categoryPalette) as CategoryColorName[]).map((name) => (
            <View key={name} className="flex-row items-center gap-1.5">
              <CategoryDot color={name} />
              <Text variant="small" tone="muted">
                {name}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Gradients and depth">
        <View className="gap-3 tablet:flex-row">
          <View
            className="h-20 flex-1 overflow-hidden rounded-md"
            style={{ boxShadow: `0 0 0 1px ${colors.borderStrong}` }}
          >
            <Gradient fill spec={actionGradient(scheme)} />
            <View className="flex-1 items-center justify-center">
              <Text variant="small" tone="onAccent" weight="medium">
                action
              </Text>
            </View>
          </View>
          <View
            className="h-20 flex-1 overflow-hidden rounded-md"
            style={{ boxShadow: `0 0 0 1px ${colors.border}` }}
          >
            <Gradient fill spec={surfaceGradient(scheme)} />
            <View className="flex-1 items-center justify-center">
              <Text variant="small" tone="muted">
                surface
              </Text>
            </View>
          </View>
          <View
            className="h-20 flex-1 overflow-hidden rounded-md"
            style={{ boxShadow: `0 0 0 1px ${colors.border}` }}
          >
            <Gradient fill spec={areaGradient(colors.data)} />
            <View className="flex-1 items-center justify-center">
              <Text variant="small" tone="muted">
                area (data)
              </Text>
            </View>
          </View>
        </View>
        <Card className="gap-4">
          <Progress value={0.62} caption="62 % of €2 070" />
          <Progress value={1.06} caption="€12 over" />
        </Card>
      </Section>

      <Section title="Typography">
        <Card className="gap-2">
          {typeSamples.map((t) => (
            <Text key={t.variant} variant={t.variant} tabular>
              {t.text}
            </Text>
          ))}
        </Card>
      </Section>

      <Section title="Buttons">
        <View className="flex-row flex-wrap items-center gap-3">
          <Button label="Primary" kbd="N" onPress={() => toast.success("Saved")} />
          <Button label="Secondary" variant="secondary" onPress={() => toast.show("Heads up")} />
          <Button label="Ghost" variant="ghost" />
          <Button
            label="Delete"
            variant="destructive"
            onPress={() => toast.error("Could not delete")}
          />
          <Button label="Disabled" disabled />
          <Button
            label={loading ? "Saving…" : "Loading demo"}
            loading={loading}
            onPress={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          />
          <Button
            label="With icon"
            variant="secondary"
            leading={<Plus size={18} color={colors.text} strokeWidth={1.8} />}
          />
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

      <Section title="Cards, lists and amounts">
        <View className="gap-4 desktop:flex-row">
          <Card className="overflow-hidden p-0 desktop:flex-1 tablet:p-0">
            <Text variant="label" className="px-3.5 pt-3 pb-1">
              November
            </Text>
            {rows.map((r, i) => (
              <ListItem
                key={r.id}
                title={r.payee}
                subtitle={`${r.category} · ${r.date}`}
                subtitleLeading={<CategoryDot color={r.color} />}
                divider={i > 0}
                onPress={() => toast.show(`Open ${r.payee}`)}
                leading={
                  <IconTile>
                    {i === 0 ? (
                      <ShoppingBasket size={18} color={colors.muted} strokeWidth={1.6} />
                    ) : i === 1 ? (
                      <Banknote size={18} color={colors.muted} strokeWidth={1.6} />
                    ) : (
                      <Bus size={18} color={colors.muted} strokeWidth={1.6} />
                    )}
                  </IconTile>
                }
                trailing={<Amount value={r.amount} />}
              />
            ))}
          </Card>
          <Card className="gap-1.5 desktop:flex-1">
            <Text variant="small" tone="muted" weight="medium">
              This month
            </Text>
            <Amount value={-184230} size="heading" tone="text" />
            <Text variant="small" tone="muted">
              Income <Amount value={245000} size="small" /> · Expenses{" "}
              <Amount value={-184230} size="small" />
            </Text>
          </Card>
        </View>
      </Section>

      <Section title="Table (web / desktop)">
        <Card className="overflow-hidden p-0 tablet:p-0">
          <Table
            rows={rows}
            rowKey={(r) => r.id}
            selectedKey={selected}
            onRowPress={(r) => setSelected(r.id)}
            columns={[
              {
                key: "date",
                header: "Date",
                width: 140,
                render: (r) => (
                  <Text tone="muted" tabular>
                    {r.date}
                  </Text>
                ),
              },
              {
                key: "payee",
                header: "Payee",
                render: (r) => <Text weight="medium">{r.payee}</Text>,
              },
              {
                key: "category",
                header: "Category",
                render: (r) => (
                  <View className="flex-row items-center gap-1.5">
                    <CategoryDot color={r.color} />
                    <Text tone="muted">{r.category}</Text>
                  </View>
                ),
              },
              {
                key: "amount",
                header: "Amount",
                width: 140,
                align: "right",
                render: (r) => <Amount value={r.amount} />,
              },
            ]}
          />
        </Card>
      </Section>

      <Section title="Chips, sheet and toast">
        <View className="flex-row flex-wrap items-center gap-3">
          <Chip label="Neutral" />
          <Chip tone="positive" label="Under budget" />
          <Chip tone="warning" label="Near limit" />
          <Chip tone="negative" label="Over budget" />
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
              icon={<Wallet size={20} color={colors.muted} strokeWidth={1.6} />}
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
              <Skeleton className="h-9 w-9 rounded-md" />
              <View className="flex-1 gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </View>
            </View>
          </Card>
        </View>
      </Section>
    </ScrollView>
  );
}
