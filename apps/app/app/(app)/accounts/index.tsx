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
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, Plus, Wallet } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { AccountForm } from "../../../src/accounts/AccountForm";
import { accountTypeIcon, accountTypeLabel } from "../../../src/accounts/meta";
import { displayColor } from "../../../src/components/colors";
import { ListHeader } from "../../../src/components/ReorderToggle";
import { DataGate } from "../../../src/data/DataGate";
import { useAccountsWithBalances, useReorderAccounts } from "../../../src/data/hooks";
import { useTranslation } from "../../../src/i18n";
import { Page } from "../../../src/shell/Page";
import { placeholderIcon } from "../../../src/shell/placeholder";

function AccountsContent({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
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
            title={t("accounts.list.emptyTitle")}
            description={t("accounts.list.emptyDesc")}
            actionLabel={t("accounts.list.add")}
            onAction={onAdd}
          />
        </Card>
      ) : (
        <>
          <HeroCard>
            <Text variant="label" tone="onHero">
              {t("accounts.list.netWorth")}
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
              title={t("accounts.list.yourAccounts")}
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
            {t("accounts.archived")}
          </Text>
          <Card className="p-0 tablet:p-0">
            {archived.map((a, i) => (
              <ListItem
                key={a.id}
                divider={i > 0}
                title={a.name}
                subtitle={`${accountTypeLabel(a.type)} · ${a.currency}`}
                trailing={<Chip label={t("accounts.archived")} />}
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
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ add?: string }>();
  // `?add=1` comes from onboarding: open the new-account form straight away
  const [adding, setAdding] = useState(params.add === "1");
  return (
    <Page
      title={t("accounts.list.title")}
      subtitle={t("accounts.list.subtitle")}
      actions={
        <Button
          label={t("accounts.list.add")}
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
