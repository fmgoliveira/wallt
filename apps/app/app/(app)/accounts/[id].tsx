import {
  Amount,
  Button,
  Card,
  Chip,
  EmptyState,
  HeroCard,
  IconTile,
  ListItem,
  Sheet,
  Skeleton,
  Text,
  toast,
  useTheme,
} from "@wallt/ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft, Receipt } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { AccountForm } from "../../../src/accounts/AccountForm";
import { accountTypeIcon, accountTypeLabel } from "../../../src/accounts/meta";
import { DataGate } from "../../../src/data/DataGate";
import {
  useAccountWithBalance,
  useDeleteAccount,
  useTransactions,
  useUpdateAccount,
} from "../../../src/data/hooks";
import { Page } from "../../../src/shell/Page";
import { placeholderIcon } from "../../../src/shell/placeholder";

function AccountDetail({ id }: { id: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const query = useAccountWithBalance(id);
  const recent = useTransactions({ accountIds: [id], limit: 10 });
  const update = useUpdateAccount();
  const remove = useDeleteAccount();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const account = query.data;

  const back = () => router.replace("/accounts");

  if (query.isPending) {
    return (
      <Card className="gap-3">
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-8 w-1/2" />
      </Card>
    );
  }
  if (!account) {
    return (
      <Card>
        <EmptyState
          title="Account not found"
          description="It may have been deleted."
          actionLabel="Back to accounts"
          onAction={back}
        />
      </Card>
    );
  }

  const Icon = accountTypeIcon[account.type];

  async function toggleArchive() {
    if (!account) return;
    try {
      await update.mutateAsync({ id, patch: { archived: !account.archived } });
      toast.success(account.archived ? "Account restored" : "Account archived");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the account");
    }
  }

  async function doDelete() {
    try {
      await remove.mutateAsync(id);
      toast.success("Account deleted");
      setConfirmDelete(false);
      back();
    } catch (error) {
      setConfirmDelete(false);
      toast.error(error instanceof Error ? error.message : "Could not delete the account");
    }
  }

  return (
    <>
      <View className="flex-row">
        <Button
          label="Accounts"
          variant="ghost"
          leading={<ArrowLeft size={18} color={colors.muted} strokeWidth={1.6} />}
          onPress={back}
        />
      </View>

      <HeroCard>
        <View className="flex-row items-center gap-3">
          <IconTile>
            <Icon size={18} color={colors.muted} strokeWidth={1.6} />
          </IconTile>
          <View className="flex-1">
            <Text tone="onHero" weight="medium">
              {account.name}
            </Text>
            <Text variant="small" tone="onHero">
              {`${accountTypeLabel(account.type)} · ${account.currency}`}
            </Text>
          </View>
          {account.archived ? <Chip label="Archived" /> : null}
        </View>
        <View className="mt-3">
          <Amount
            value={account.balance}
            currency={account.currency}
            size="display"
            tone="onHero"
          />
        </View>
      </HeroCard>

      <Card className="gap-3">
        <Text variant="title">Balance over time</Text>
        <Skeleton className="h-32 w-full" />
        <Text variant="small" tone="muted">
          The balance chart arrives with the reports work (P4.4).
        </Text>
      </Card>

      <View className="gap-2">
        <Text variant="label" tone="muted">
          Recent transactions
        </Text>
        <Card className="p-0 tablet:p-0">
          {recent.data && recent.data.length > 0 ? (
            recent.data.map((t, i) => (
              <ListItem
                key={t.id}
                divider={i > 0}
                title={t.payee || t.descriptionClean || "Transaction"}
                subtitle={t.bookingDate}
                trailing={<Amount value={t.amount} currency={t.currency} />}
              />
            ))
          ) : (
            <EmptyState
              icon={placeholderIcon(Receipt)}
              title="No transactions yet"
              description="Transactions you add to this account show up here."
            />
          )}
        </Card>
      </View>

      <View className="flex-row flex-wrap gap-2">
        <Button label="Edit" variant="secondary" onPress={() => setEditing(true)} />
        <Button
          label={account.archived ? "Restore" : "Archive"}
          variant="secondary"
          loading={update.isPending}
          onPress={toggleArchive}
        />
        <Button label="Delete" variant="destructive" onPress={() => setConfirmDelete(true)} />
      </View>

      {editing ? <AccountForm account={account} onClose={() => setEditing(false)} /> : null}
      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete account?"
      >
        <Text tone="muted">
          {`"${account.name}" will be removed. Accounts with transactions cannot be deleted: archive them instead.`}
        </Text>
        <Button
          label="Delete"
          variant="destructive"
          loading={remove.isPending}
          onPress={doDelete}
        />
        <Button label="Cancel" variant="ghost" onPress={() => setConfirmDelete(false)} />
      </Sheet>
    </>
  );
}

export default function AccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Page title="Account">
      <DataGate>{id ? <AccountDetail id={id} /> : null}</DataGate>
    </Page>
  );
}
