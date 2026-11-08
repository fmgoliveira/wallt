import { netWorthByCurrency } from "@wallt/core";
import {
  Amount,
  Button,
  Card,
  Chip,
  EmptyState,
  HeroCard,
  IconTile,
  ListItem,
  Text,
  useTheme,
} from "@wallt/ui";
import { useRouter } from "expo-router";
import { ArrowDown, ArrowUp, ChevronRight, Plus, Wallet } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { AccountForm } from "../../../src/accounts/AccountForm";
import { accountTypeIcon, accountTypeLabel } from "../../../src/accounts/meta";
import { DataGate } from "../../../src/data/DataGate";
import { useAccountsWithBalances, useReorderAccounts } from "../../../src/data/hooks";
import { Page } from "../../../src/shell/Page";
import { placeholderIcon } from "../../../src/shell/placeholder";

function AccountsContent({ onAdd }: { onAdd: () => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const active = useAccountsWithBalances();
  const all = useAccountsWithBalances({ includeArchived: true });
  const reorder = useReorderAccounts();
  const [sorting, setSorting] = useState(false);

  const accounts = active.data ?? [];
  const archived = (all.data ?? []).filter((a) => a.archived);
  const totals = netWorthByCurrency(accounts);

  function move(index: number, delta: -1 | 1) {
    const ids = accounts.map((a) => a.id);
    const target = index + delta;
    const a = ids[index];
    const b = ids[target];
    if (a === undefined || b === undefined) return;
    ids[index] = b;
    ids[target] = a;
    reorder.mutate(ids);
  }

  const open = (id: string) => router.push({ pathname: "/accounts/[id]", params: { id } });

  return (
    <>
      {accounts.length === 0 && active.isSuccess ? (
        <Card>
          <EmptyState
            icon={placeholderIcon(Wallet)}
            title="No accounts yet"
            description="Add your first account to start tracking balances."
            actionLabel="Add account"
            onAction={onAdd}
          />
        </Card>
      ) : (
        <>
          <HeroCard>
            <Text variant="label" tone="onHero">
              Net worth
            </Text>
            <View className="mt-2 gap-1">
              {totals.length === 0 ? (
                <Amount value={0} size="display" tone="onHero" />
              ) : (
                totals.map((m) => (
                  <Amount
                    key={m.currency}
                    value={m.amount}
                    currency={m.currency}
                    size="display"
                    tone="onHero"
                  />
                ))
              )}
            </View>
          </HeroCard>

          <Card className="p-0 tablet:p-0">
            {accounts.map((a, i) => {
              const Icon = accountTypeIcon[a.type];
              return (
                <ListItem
                  key={a.id}
                  divider={i > 0}
                  title={a.name}
                  subtitle={`${accountTypeLabel(a.type)} · ${a.currency}`}
                  leading={
                    <IconTile>
                      <Icon size={18} color={colors.muted} strokeWidth={1.6} />
                    </IconTile>
                  }
                  trailing={
                    sorting ? (
                      <View className="flex-row">
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Move ${a.name} up`}
                          disabled={i === 0}
                          onPress={() => move(i, -1)}
                          className="h-11 w-11 items-center justify-center"
                        >
                          <ArrowUp
                            size={18}
                            color={i === 0 ? colors.subtle : colors.text}
                            strokeWidth={1.6}
                          />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Move ${a.name} down`}
                          disabled={i === accounts.length - 1}
                          onPress={() => move(i, 1)}
                          className="h-11 w-11 items-center justify-center"
                        >
                          <ArrowDown
                            size={18}
                            color={i === accounts.length - 1 ? colors.subtle : colors.text}
                            strokeWidth={1.6}
                          />
                        </Pressable>
                      </View>
                    ) : (
                      <View className="flex-row items-center gap-2">
                        <Amount value={a.balance} currency={a.currency} tone="text" />
                        <ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />
                      </View>
                    )
                  }
                  onPress={sorting ? undefined : () => open(a.id)}
                />
              );
            })}
          </Card>

          {accounts.length > 1 ? (
            <View className="flex-row">
              <Button
                label={sorting ? "Done" : "Reorder"}
                variant="ghost"
                onPress={() => setSorting((s) => !s)}
              />
            </View>
          ) : null}
        </>
      )}

      {archived.length > 0 ? (
        <View className="gap-2">
          <Text variant="label" tone="muted">
            Archived
          </Text>
          <Card className="p-0 tablet:p-0">
            {archived.map((a, i) => (
              <ListItem
                key={a.id}
                divider={i > 0}
                title={a.name}
                subtitle={`${accountTypeLabel(a.type)} · ${a.currency}`}
                trailing={<Chip label="Archived" />}
                onPress={() => open(a.id)}
              />
            ))}
          </Card>
        </View>
      ) : null}
    </>
  );
}

export default function Accounts() {
  const [adding, setAdding] = useState(false);
  return (
    <Page
      title="Accounts"
      subtitle="Balances across all your accounts"
      actions={
        <Button
          label="Add account"
          leading={<PlusIcon />}
          onPress={() => setAdding(true)}
          className="self-end"
        />
      }
    >
      <DataGate>
        <AccountsContent onAdd={() => setAdding(true)} />
      </DataGate>
      {adding ? <AccountForm onClose={() => setAdding(false)} /> : null}
    </Page>
  );
}

function PlusIcon() {
  const { colors } = useTheme();
  return <Plus size={18} color={colors.accentFg} strokeWidth={2} />;
}
