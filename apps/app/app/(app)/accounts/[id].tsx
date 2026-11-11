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
import { Archive, ArchiveRestore, ArrowLeft, Pencil, Receipt, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { AccountForm } from "../../../src/accounts/AccountForm";
import { accountTypeIcon, accountTypeLabel } from "../../../src/accounts/meta";
import { ActionRow } from "../../../src/components/ActionRow";
import { displayColor } from "../../../src/components/colors";
import { DataGate } from "../../../src/data/DataGate";
import {
  useAccountWithBalance,
  useDeleteAccount,
  useTransactions,
  useUpdateAccount,
} from "../../../src/data/hooks";
import { useTranslation } from "../../../src/i18n";
import { Page } from "../../../src/shell/Page";
import { placeholderIcon } from "../../../src/shell/placeholder";
import { useEditorStore } from "../../../src/transactions/editorStore";

function AccountDetail({ id }: { id: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { scheme, colors } = useTheme();
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
          title={t("accounts.detail.notFoundTitle")}
          description={t("accounts.detail.notFoundDesc")}
          actionLabel={t("accounts.detail.backToAccounts")}
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
      toast.success(
        account.archived ? t("accounts.detail.restored") : t("accounts.detail.archivedToast"),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("accounts.detail.updateFailed"));
    }
  }

  async function doDelete() {
    try {
      await remove.mutateAsync(id);
      toast.success(t("accounts.detail.deleted"));
      setConfirmDelete(false);
      back();
    } catch (error) {
      setConfirmDelete(false);
      toast.error(error instanceof Error ? error.message : t("accounts.detail.deleteFailed"));
    }
  }

  return (
    <View className="gap-6">
      <View className="flex-row">
        <Button
          label={t("accounts.detail.back")}
          variant="ghost"
          leading={<ArrowLeft size={18} color={colors.muted} strokeWidth={1.6} />}
          onPress={back}
        />
      </View>

      <HeroCard>
        <View className="flex-row items-center gap-3">
          <IconTile>
            <Icon
              size={18}
              color={displayColor(account.color, account.id, scheme)}
              strokeWidth={1.6}
            />
          </IconTile>
          <View className="flex-1">
            <Text tone="onHero" weight="medium">
              {account.name}
            </Text>
            <Text variant="small" tone="onHero">
              {`${accountTypeLabel(account.type)} · ${account.currency}`}
            </Text>
          </View>
          {account.archived ? <Chip label={t("accounts.archived")} /> : null}
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
        <Text variant="title">{t("accounts.detail.chartTitle")}</Text>
        <Skeleton className="h-32 w-full" />
        <Text variant="small" tone="muted">
          {t("accounts.detail.chartNote")}
        </Text>
      </Card>

      <View className="gap-2">
        <Text variant="label" tone="muted">
          {t("accounts.detail.recent")}
        </Text>
        <Card className="p-0 tablet:p-0">
          {recent.data && recent.data.length > 0 ? (
            recent.data.map((tx, i) => (
              <ListItem
                key={tx.id}
                divider={i > 0}
                title={
                  tx.kind === "transfer"
                    ? t("accounts.detail.transfer")
                    : tx.payee || tx.descriptionClean || t("accounts.detail.transaction")
                }
                subtitle={tx.bookingDate}
                trailing={<Amount value={tx.amount} currency={tx.currency} />}
                onPress={() => useEditorStore.getState().openEdit(tx.id)}
              />
            ))
          ) : (
            <EmptyState
              icon={placeholderIcon(Receipt)}
              title={t("accounts.detail.noTxTitle")}
              description={t("accounts.detail.noTxDesc")}
              actionLabel={t("accounts.detail.addTx")}
              onAction={() => useEditorStore.getState().openNew(id)}
            />
          )}
        </Card>
      </View>

      <Card className="p-0 tablet:p-0">
        <ActionRow
          icon={Pencil}
          label={t("accounts.detail.edit")}
          onPress={() => setEditing(true)}
        />
        <ActionRow
          divider
          icon={account.archived ? ArchiveRestore : Archive}
          label={account.archived ? t("accounts.detail.restore") : t("accounts.detail.archive")}
          hint={
            account.archived ? t("accounts.detail.restoreHint") : t("accounts.detail.archiveHint")
          }
          disabled={update.isPending}
          onPress={toggleArchive}
        />
        <ActionRow
          divider
          icon={Trash2}
          label={t("accounts.detail.deleteAction")}
          tone="negative"
          onPress={() => setConfirmDelete(true)}
        />
      </Card>

      {editing ? <AccountForm account={account} onClose={() => setEditing(false)} /> : null}
      <Sheet
        visible={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t("accounts.detail.deleteTitle")}
      >
        <Text tone="muted">{t("accounts.detail.deleteBody", { name: account.name })}</Text>
        <Button
          label={t("accounts.delete")}
          variant="destructive"
          loading={remove.isPending}
          onPress={doDelete}
        />
        <Button
          label={t("accounts.cancel")}
          variant="ghost"
          onPress={() => setConfirmDelete(false)}
        />
      </Sheet>
    </View>
  );
}

export default function AccountScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Page title={t("accounts.detail.pageTitle")}>
      <DataGate>{id ? <AccountDetail id={id} /> : null}</DataGate>
    </Page>
  );
}
