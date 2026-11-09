import { Amount, Button, Card, ListItem, Text } from "@wallt/ui";
import { Redirect } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  useAccounts,
  useCategories,
  useCreateAccount,
  useCreateTransaction,
  useDeleteAccount,
  useTransactions,
} from "../../src/data/hooks";
import { useDataState } from "../../src/data/RepositoryProvider";

/** Dev-only smoke screen for the data layer (P2.3): proves migrations, seed, repository and Query hooks on device. */
export default function DataSmoke() {
  const data = useDataState();
  const accounts = useAccounts();
  const categories = useCategories();
  const transactions = useTransactions({ limit: 5 });
  const createAccount = useCreateAccount();
  const deleteAccount = useDeleteAccount();
  const createTransaction = useCreateTransaction();
  const [seeding, setSeeding] = useState<string | null>(null);

  /** Bulk-creates demo transactions in one atomic batch (for testing list performance with thousands of rows). */
  async function seed(count: number) {
    if (data.status !== "ready") return;
    const repo = data.repository;
    const account = (await repo.accounts.list())[0];
    if (!account) return;
    const categories = (await repo.categories.list()).filter((c) => c.type === "expense");
    const started = Date.now();
    setSeeding("seeding…");
    await repo.transaction(async (tx) => {
      for (let i = 0; i < count; i++) {
        const day = new Date(Date.UTC(2026, 10, 8) - (i % 900) * 86_400_000);
        await tx.transactions.create({
          accountId: account.id,
          amount: -(((i * 7919) % 20_000) + 100),
          currency: account.currency,
          bookingDate: day.toISOString().slice(0, 10),
          payee: `Demo payee ${i % 400}`,
          categoryId: categories[i % Math.max(categories.length, 1)]?.id ?? null,
        });
      }
    });
    setSeeding(`seeded ${count} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
    void transactions.refetch();
  }

  if (!__DEV__) return <Redirect href="/" />;

  const first = accounts.data?.[0];

  return (
    <View className="flex-1 gap-4 px-4 pt-14">
      <Text variant="heading">Data layer</Text>
      <Text tone="muted">
        {data.status === "error"
          ? `error: ${data.error.message}`
          : data.status === "loading"
            ? "opening database…"
            : `ready · ${categories.data?.length ?? "…"} categories · ${accounts.data?.length ?? "…"} accounts · ${transactions.data?.length ?? "…"} recent transactions`}
      </Text>
      <View className="flex-row flex-wrap gap-3">
        <Button
          label="Add account"
          disabled={data.status !== "ready"}
          onPress={() =>
            createAccount.mutate({
              name: `Account ${(accounts.data?.length ?? 0) + 1}`,
              type: "checking",
              currency: "EUR",
              openingBalance: 100_000,
            })
          }
        />
        <Button
          label="Add -12,34 €"
          variant="secondary"
          disabled={!first}
          onPress={() =>
            first &&
            createTransaction.mutate({
              accountId: first.id,
              amount: -1234,
              currency: "EUR",
              bookingDate: new Date().toISOString().slice(0, 10),
              payee: "Smoke test",
            })
          }
        />
        <Button
          label="Seed 2,000"
          variant="secondary"
          disabled={!first}
          onPress={() => seed(2000)}
        />
        <Button
          label="Seed 20,000"
          variant="secondary"
          disabled={!first}
          onPress={() => seed(20000)}
        />
      </View>
      {seeding ? (
        <Text variant="small" tone="muted">
          {seeding}
        </Text>
      ) : null}
      <Card className="overflow-hidden p-0 tablet:p-0">
        {(accounts.data ?? []).map((a, i) => (
          <ListItem
            key={a.id}
            title={a.name}
            subtitle={`${a.type} · ${a.currency}`}
            divider={i > 0}
            onPress={() => deleteAccount.mutate(a.id)}
            trailing={<Amount value={a.openingBalance} tone="text" />}
          />
        ))}
      </Card>
      <Text variant="small" tone="muted">
        Tap an account to soft-delete it. Transactions:{" "}
        {(transactions.data ?? []).map((t) => t.payee).join(", ") || "none"}
      </Text>
    </View>
  );
}
