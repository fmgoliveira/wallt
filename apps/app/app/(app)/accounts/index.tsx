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
  SortableList,
  Text,
  useTheme,
} from "@wallt/ui";
import { useRouter } from "expo-router";
import { ChevronRight, Plus, Wallet } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { AccountForm } from "../../../src/accounts/AccountForm";
import { accountTypeIcon, accountTypeLabel } from "../../../src/accounts/meta";
import { displayColor } from "../../../src/components/colors";
import { ListHeader } from "../../../src/components/ReorderToggle";
import { DataGate } from "../../../src/data/DataGate";
import { useAccountsWithBalances, useReorderAccounts } from "../../../src/data/hooks";
import { Page } from "../../../src/shell/Page";
import { placeholderIcon } from "../../../src/shell/placeholder";

function AccountsContent({ onAdd }: { onAdd: () => void }) {
  const router = useRouter();
  const { scheme, colors } = useTheme();
  const active = useAccountsWithBalances();
  const all = useAccountsWithBalances({ includeArchived: true });
  const reorder = useReorderAccounts();
  const [sorting, setSorting] = useState(false);

  const accounts = active.data ?? [];
  const archived = (all.data ?? []).filter((a) => a.archived);
  const totals = netWorthByCurrency(accounts);

  const open = (id: string) => router.push({ pathname: "/accounts/[id]", params: { id } });

  return (
    <View className="gap-6">
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

          <View className="gap-2">
            <ListHeader
              title="Your accounts"
              sorting={sorting}
              canReorder={accounts.length > 1}
              onToggle={() => setSorting((s) => !s)}
            />
            <Card className="p-0 tablet:p-0">
              <SortableList
                items={accounts}
                getId={(a) => a.id}
                enabled={sorting}
                onReorder={(ids) => reorder.mutate(ids)}
                renderItem={(a, { handle, index }) => {
                  const Icon = accountTypeIcon[a.type];
                  return (
                    <ListItem
                      divider={index > 0}
                      title={a.name}
                      subtitle={`${accountTypeLabel(a.type)} · ${a.currency}`}
                      leading={
                        <IconTile>
                          <Icon
                            size={18}
                            color={displayColor(a.color, a.id, scheme)}
                            strokeWidth={1.6}
                          />
                        </IconTile>
                      }
                      trailing={
                        sorting ? (
                          handle
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
                }}
              />
            </Card>
          </View>
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
    </View>
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
