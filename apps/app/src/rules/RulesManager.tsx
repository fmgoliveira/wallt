import { conditionsFromTransaction } from "@wallt/categorize";
import type { Rule, RuleCondition } from "@wallt/core";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  IconTile,
  ListItem,
  Skeleton,
  SortableList,
  Text,
  toast,
  useTheme,
} from "@wallt/ui";
import type { TFunction } from "i18next";
import { ChevronRight, ListFilter, Plus, Sparkles } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { ListHeader } from "../components/ReorderToggle";
import {
  useAccounts,
  useCategories,
  useReorderRules,
  useRules,
  useTransaction,
} from "../data/hooks";
import { useTranslation } from "../i18n";
import { placeholderIcon } from "../shell/placeholder";
import { useAddSuggestedRules, useApplyRules } from "./data";
import { type RuleDraft, RuleForm } from "./RuleForm";

/** One line describing a condition, e.g. `Payee contains “lidl”`. */
function describeCondition(
  c: RuleCondition,
  accountName: (id: string) => string | undefined,
  t: TFunction,
): string {
  switch (c.field) {
    case "payee": {
      const value = String(c.value);
      return c.op === "equals"
        ? t("rules.cond.payeeEquals", { value })
        : c.op === "regex"
          ? t("rules.cond.payeeRegex", { value })
          : t("rules.cond.payeeContains", { value });
    }
    case "description": {
      const value = String(c.value);
      return c.op === "equals"
        ? t("rules.cond.descriptionEquals", { value })
        : c.op === "regex"
          ? t("rules.cond.descriptionRegex", { value })
          : t("rules.cond.descriptionContains", { value });
    }
    case "amount": {
      const value = (Number(c.value) / 100).toFixed(2);
      return c.op === "gte"
        ? t("rules.cond.amountGte", { value })
        : c.op === "lte"
          ? t("rules.cond.amountLte", { value })
          : t("rules.cond.amountEquals", { value });
    }
    case "account":
      return t("rules.cond.accountIs", {
        name: accountName(String(c.value)) ?? t("rules.cond.unknown"),
      });
    case "sign":
      return c.value === "income" ? t("rules.cond.moneyIn") : t("rules.cond.moneyOut");
  }
}

/**
 * Settings -> Rules (PLAN §6, P6.1): ordered list (the first matching rule wins), add / edit with a live match
 * count, reorder, cold-start merchant rules, and "apply to history". `fromTransaction` opens the form prefilled
 * from a transaction ("always categorise Lidl as Groceries").
 */
export function RulesManager({ fromTransaction }: { fromTransaction?: string | undefined }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const rules = useRules();
  const categories = useCategories({ includeArchived: true });
  const accounts = useAccounts({ includeArchived: true });
  const reorder = useReorderRules();
  const suggested = useAddSuggestedRules();
  const apply = useApplyRules();
  const source = useTransaction(fromTransaction);

  const [form, setForm] = useState<{ rule?: Rule; draft?: RuleDraft } | null>(null);
  const [sorting, setSorting] = useState(false);
  const [opened, setOpened] = useState<string | null>(null);

  // Opened from a transaction: prefill once the transaction has loaded.
  useEffect(() => {
    const tx = source.data;
    if (!fromTransaction || !tx || opened === fromTransaction) return;
    setOpened(fromTransaction);
    setForm({
      draft: {
        name: tx.payee || tx.descriptionClean || t("rules.manager.defaultName"),
        conditions: conditionsFromTransaction({
          payee: tx.payee,
          description: tx.descriptionClean || tx.descriptionRaw,
          amount: tx.amount,
        }),
        categoryId: tx.categoryId,
      },
    });
  }, [fromTransaction, source.data, opened, t]);

  if (rules.isPending) return <Skeleton className="h-40 w-full" />;
  const list = rules.data ?? [];
  const cats = categories.data ?? [];
  const categoryName = (id: string | undefined) => cats.find((c) => c.id === id)?.name;
  const accountName = (id: string) => accounts.data?.find((a) => a.id === id)?.name;

  const run = async (action: () => Promise<number>, done: (n: number) => string) => {
    try {
      toast.success(done(await action()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("rules.manager.wentWrong"));
    }
  };

  return (
    <View className="gap-6">
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={placeholderIcon(ListFilter)}
            title={t("rules.manager.emptyTitle")}
            description={t("rules.manager.emptyDescription")}
            actionLabel={t("rules.manager.addRule")}
            onAction={() => setForm({})}
          />
        </Card>
      ) : (
        <View className="gap-2">
          <ListHeader
            title={t("rules.manager.listHeader")}
            sorting={sorting}
            canReorder={list.length > 1}
            onToggle={() => setSorting((v) => !v)}
          />
          <Card className="p-0 tablet:p-0">
            <SortableList
              items={list}
              getId={(r) => r.id}
              enabled={sorting}
              onReorder={(ids) => reorder.mutate(ids)}
              renderItem={(rule, { handle, index }) => (
                <ListItem
                  divider={index > 0}
                  title={rule.name}
                  subtitle={[
                    rule.conditions.map((c) => describeCondition(c, accountName, t)).join(" · "),
                    ...(rule.action.payeeRename
                      ? [t("rules.manager.renameTo", { name: rule.action.payeeRename })]
                      : []),
                  ].join(" · ")}
                  leading={
                    <IconTile>
                      <ListFilter size={18} color={colors.muted} strokeWidth={1.6} />
                    </IconTile>
                  }
                  trailing={
                    handle ?? (
                      <View className="flex-row items-center gap-2">
                        {rule.action.categoryId ? (
                          <Chip
                            label={
                              categoryName(rule.action.categoryId) ?? t("rules.manager.category")
                            }
                          />
                        ) : null}
                        <ChevronRight size={16} color={colors.subtle} strokeWidth={1.6} />
                      </View>
                    )
                  }
                  onPress={handle ? undefined : () => setForm({ rule })}
                />
              )}
            />
          </Card>
        </View>
      )}

      <View className="gap-3">
        <Button
          label={t("rules.manager.addRule")}
          leading={<Plus size={18} color={colors.accentFg} strokeWidth={2} />}
          onPress={() => setForm({})}
        />
        <Button
          label={t("rules.manager.addMerchants")}
          variant="ghost"
          leading={<Sparkles size={16} color={colors.muted} strokeWidth={1.8} />}
          loading={suggested.isPending}
          onPress={() =>
            run(
              () => suggested.mutateAsync(undefined),
              (n) =>
                n === 0 ? t("rules.manager.alreadyThere") : t("rules.manager.added", { count: n }),
            )
          }
        />
        {list.length > 0 ? (
          <Button
            label={t("rules.manager.applyExisting")}
            variant="ghost"
            loading={apply.isPending}
            onPress={() =>
              run(
                () => apply.mutateAsync(undefined),
                (n) => t("rules.manager.updated", { count: n }),
              )
            }
          />
        ) : null}
      </View>
      <Text variant="small" tone="muted">
        {t("rules.manager.note")}
      </Text>
      {form ? <RuleForm rule={form.rule} draft={form.draft} onClose={() => setForm(null)} /> : null}
    </View>
  );
}
