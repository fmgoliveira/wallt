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
import { placeholderIcon } from "../shell/placeholder";
import { useAddSuggestedRules, useApplyRules } from "./data";
import { type RuleDraft, RuleForm } from "./RuleForm";

/** One line describing a condition, e.g. `Payee contains “lidl”`. */
function describeCondition(
  c: RuleCondition,
  accountName: (id: string) => string | undefined,
): string {
  switch (c.field) {
    case "payee":
    case "description": {
      const what = c.field === "payee" ? "Payee" : "Description";
      const how = c.op === "equals" ? "is" : c.op === "regex" ? "matches" : "contains";
      return `${what} ${how} “${c.value}”`;
    }
    case "amount": {
      const how = c.op === "gte" ? "at least" : c.op === "lte" ? "at most" : "exactly";
      return `Amount ${how} ${(Number(c.value) / 100).toFixed(2)}`;
    }
    case "account":
      return `Account is ${accountName(String(c.value)) ?? "unknown"}`;
    case "sign":
      return c.value === "income" ? "Money in" : "Money out";
  }
}

/**
 * Settings -> Rules (PLAN §6, P6.1): ordered list (the first matching rule wins), add / edit with a live match
 * count, reorder, cold-start merchant rules, and "apply to history". `fromTransaction` opens the form prefilled
 * from a transaction ("always categorise Lidl as Groceries").
 */
export function RulesManager({ fromTransaction }: { fromTransaction?: string | undefined }) {
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
        name: tx.payee || tx.descriptionClean || "New rule",
        conditions: conditionsFromTransaction({
          payee: tx.payee,
          description: tx.descriptionClean || tx.descriptionRaw,
          amount: tx.amount,
        }),
        categoryId: tx.categoryId,
      },
    });
  }, [fromTransaction, source.data, opened]);

  if (rules.isPending) return <Skeleton className="h-40 w-full" />;
  const list = rules.data ?? [];
  const cats = categories.data ?? [];
  const categoryName = (id: string | undefined) => cats.find((c) => c.id === id)?.name;
  const accountName = (id: string) => accounts.data?.find((a) => a.id === id)?.name;

  const run = async (action: () => Promise<number>, done: (n: number) => string) => {
    try {
      toast.success(done(await action()));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  };

  return (
    <View className="gap-6">
      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={placeholderIcon(ListFilter)}
            title="No rules yet"
            description="A rule says “when a transaction looks like this, put it in that category”. Rules run first on every import, before anything is guessed."
            actionLabel="Add rule"
            onAction={() => setForm({})}
          />
        </Card>
      ) : (
        <View className="gap-2">
          <ListHeader
            title="Rules, first match wins"
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
                  subtitle={`${rule.conditions.map((c) => describeCondition(c, accountName)).join(" · ")}${
                    rule.action.payeeRename ? ` · rename to ${rule.action.payeeRename}` : ""
                  }`}
                  leading={
                    <IconTile>
                      <ListFilter size={18} color={colors.muted} strokeWidth={1.6} />
                    </IconTile>
                  }
                  trailing={
                    handle ?? (
                      <View className="flex-row items-center gap-2">
                        {rule.action.categoryId ? (
                          <Chip label={categoryName(rule.action.categoryId) ?? "Category"} />
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
          label="Add rule"
          leading={<Plus size={18} color={colors.accentFg} strokeWidth={2} />}
          onPress={() => setForm({})}
        />
        <Button
          label="Add common Portuguese merchants"
          variant="ghost"
          leading={<Sparkles size={16} color={colors.muted} strokeWidth={1.8} />}
          loading={suggested.isPending}
          onPress={() =>
            run(
              () => suggested.mutateAsync(undefined),
              (n) =>
                n === 0
                  ? "Those rules are already there"
                  : `Added ${n} rule${n === 1 ? "" : "s"}. Edit or delete any of them.`,
            )
          }
        />
        {list.length > 0 ? (
          <Button
            label="Apply rules to existing transactions"
            variant="ghost"
            loading={apply.isPending}
            onPress={() =>
              run(
                () => apply.mutateAsync(undefined),
                (n) => `Updated ${n} transaction${n === 1 ? "" : "s"}`,
              )
            }
          />
        ) : null}
      </View>
      <Text variant="small" tone="muted">
        Rules never change a category you chose yourself. Applying them to existing transactions
        only sets categories; renames happen on new imports.
      </Text>
      {form ? <RuleForm rule={form.rule} draft={form.draft} onClose={() => setForm(null)} /> : null}
    </View>
  );
}
