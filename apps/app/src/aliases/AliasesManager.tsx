import type { PayeeAlias } from "@wallt/core";
import {
  Button,
  Card,
  EmptyState,
  IconTile,
  ListItem,
  Skeleton,
  Text,
  toast,
  useTheme,
} from "@wallt/ui";
import { ChevronRight, Plus, UserRound } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { usePayeeAliases } from "../data/hooks";
import { useTranslation } from "../i18n";
import { placeholderIcon } from "../shell/placeholder";
import { AliasForm } from "./AliasForm";
import { useApplyAliases } from "./data";

/**
 * Settings -> Payee names (PLAN §5/§6, P6.2): a pattern in the bank's text -> the clean payee name. Applied on
 * every import (first match wins, oldest first) and, on request, to existing transactions.
 */
export function AliasesManager() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const aliases = usePayeeAliases();
  const apply = useApplyAliases();
  const [form, setForm] = useState<{ alias?: PayeeAlias } | null>(null);

  if (aliases.isPending) return <Skeleton className="h-40 w-full" />;
  const list = aliases.data ?? [];

  return (
    <View className="gap-6">
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={placeholderIcon(UserRound)}
            title={t("aliases.manager.emptyTitle")}
            description={t("aliases.manager.emptyDescription")}
            actionLabel={t("aliases.manager.addPayeeName")}
            onAction={() => setForm({})}
          />
        </Card>
      ) : (
        <View className="gap-2">
          <Text variant="label" tone="muted">
            {t("aliases.manager.listHeader")}
          </Text>
          <Card className="p-0 tablet:p-0">
            {list.map((a, i) => (
              <ListItem
                key={a.id}
                divider={i > 0}
                title={a.payee}
                subtitle={a.pattern}
                leading={
                  <IconTile>
                    <UserRound size={18} color={colors.muted} strokeWidth={1.6} />
                  </IconTile>
                }
                trailing={<ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />}
                onPress={() => setForm({ alias: a })}
              />
            ))}
          </Card>
        </View>
      )}
      <View className="gap-3">
        <Button
          label={t("aliases.manager.addPayeeName")}
          leading={<Plus size={18} color={colors.accentFg} strokeWidth={2} />}
          onPress={() => setForm({})}
        />
        {list.length > 0 ? (
          <Button
            label={t("aliases.manager.applyExisting")}
            variant="ghost"
            loading={apply.isPending}
            onPress={async () => {
              try {
                const n = await apply.mutateAsync(undefined);
                toast.success(t("aliases.manager.renamed", { count: n }));
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : t("aliases.manager.wentWrong"),
                );
              }
            }}
          />
        ) : null}
      </View>
      <Text variant="small" tone="muted">
        {t("aliases.manager.note")}
      </Text>
      {form ? <AliasForm alias={form.alias} onClose={() => setForm(null)} /> : null}
    </View>
  );
}
