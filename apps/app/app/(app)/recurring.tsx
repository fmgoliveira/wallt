import { describeRRule, formatAmount, type RecurringRule, upcomingItems } from "@wallt/core";
import {
  Amount,
  Button,
  Card,
  Chip,
  EmptyState,
  IconTile,
  ListItem,
  Skeleton,
  Text,
  toast,
  useTheme,
} from "@wallt/ui";
import { Plus, Repeat } from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { DataGate } from "../../src/data/DataGate";
import { useAccounts } from "../../src/data/hooks";
import {
  todayDate,
  usePostOccurrence,
  useRecurringRules,
  useRecurringSuggestions,
  useSkipOccurrence,
} from "../../src/data/recurring";
import { useDismissedSuggestions } from "../../src/recurring/dismissed";
import { type RuleDraft, RuleForm } from "../../src/recurring/RuleForm";
import { Page } from "../../src/shell/Page";
import { placeholderIcon } from "../../src/shell/placeholder";

const HORIZON_DAYS = 30;

function dueLabel(inDays: number): { text: string; tone: "negative" | "warning" | "neutral" } {
  if (inDays < 0) return { text: `${-inDays}d overdue`, tone: "negative" };
  if (inDays === 0) return { text: "Due today", tone: "warning" };
  if (inDays === 1) return { text: "Tomorrow", tone: "neutral" };
  return { text: `In ${inDays} days`, tone: "neutral" };
}

function Upcoming({
  rules,
  onEdit,
}: {
  rules: RecurringRule[];
  onEdit: (r: RecurringRule) => void;
}) {
  const today = todayDate();
  const post = usePostOccurrence();
  const skip = useSkipOccurrence();
  const items = useMemo(() => upcomingItems(rules, today, HORIZON_DAYS), [rules, today]);
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  };

  if (items.length === 0) {
    return <Text tone="muted">Nothing due in the next {HORIZON_DAYS} days.</Text>;
  }
  return (
    <Card className="p-0 tablet:p-0">
      {items.map((item, i) => {
        const due = dueLabel(item.inDays);
        const first = item.date === item.rule.nextDate;
        const t = item.rule.template;
        return (
          <ListItem
            key={`${item.rule.id}:${item.date}`}
            divider={i > 0}
            title={t.payee}
            subtitle={`${item.date} · ${describeRRule(item.rule.rrule) ?? ""}`}
            leading={<Chip tone={due.tone} label={due.text} />}
            trailing={
              <View className="items-end gap-2">
                <Amount value={t.amount} currency={t.currency} />
                {first ? (
                  <View className="flex-row gap-2">
                    <Button
                      label="Skip"
                      variant="ghost"
                      loading={skip.isPending}
                      onPress={() => run(() => skip.mutateAsync(item.rule), "Skipped")}
                    />
                    <Button
                      label="Post"
                      loading={post.isPending}
                      onPress={() => run(() => post.mutateAsync(item.rule), "Posted")}
                    />
                  </View>
                ) : null}
              </View>
            }
            onPress={() => onEdit(item.rule)}
          />
        );
      })}
    </Card>
  );
}

function Suggestions({ onAccept }: { onAccept: (draft: RuleDraft) => void }) {
  const today = todayDate();
  const suggestions = useRecurringSuggestions(today);
  const { keys, load, dismiss } = useDismissedSuggestions();
  const accounts = useAccounts().data ?? [];
  useEffect(() => {
    void load();
  }, [load]);

  const shown = (suggestions.data ?? []).filter((s) => !keys.includes(s.key)).slice(0, 5);
  if (shown.length === 0) return null;
  return (
    <View className="gap-2">
      <Text variant="label" tone="muted">
        Looks recurring
      </Text>
      <Card className="p-0 tablet:p-0">
        {shown.map((s, i) => (
          <ListItem
            key={s.key}
            divider={i > 0}
            title={s.payee}
            subtitle={`${describeRRule(s.rrule) ?? ""} · seen ${s.occurrences} times · ${accounts.find((a) => a.id === s.accountId)?.name ?? ""}`}
            trailing={
              <View className="items-end gap-2">
                <Text tabular>{formatAmount({ amount: s.amount, currency: s.currency })}</Text>
                <View className="flex-row gap-2">
                  <Button label="Dismiss" variant="ghost" onPress={() => dismiss(s.key)} />
                  <Button
                    label="Review"
                    onPress={() =>
                      onAccept({
                        payee: s.payee,
                        amount: s.amount,
                        currency: s.currency,
                        accountId: s.accountId,
                        categoryId: s.categoryId,
                        rrule: s.rrule,
                        nextDate: s.nextDate,
                        autoDetected: true,
                      })
                    }
                  />
                </View>
              </View>
            }
          />
        ))}
      </Card>
    </View>
  );
}

function RecurringContent({
  onAdd,
  onEdit,
  onAccept,
}: {
  onAdd: () => void;
  onEdit: (r: RecurringRule) => void;
  onAccept: (d: RuleDraft) => void;
}) {
  const rules = useRecurringRules({ includeInactive: true });
  if (rules.isPending) return <Skeleton className="h-40 w-full" />;
  const all = rules.data ?? [];
  const active = all.filter((r) => r.active);
  const paused = all.filter((r) => !r.active);

  return (
    <View className="gap-6">
      <Suggestions onAccept={onAccept} />
      {all.length === 0 ? (
        <Card>
          <EmptyState
            icon={placeholderIcon(Repeat)}
            title="No recurring items yet"
            description="Add rent, subscriptions or salary to see what is due next. Nothing is posted until you confirm it."
            actionLabel="Add recurring item"
            onAction={onAdd}
          />
        </Card>
      ) : (
        <>
          <View className="gap-2">
            <Text variant="label" tone="muted">
              Upcoming
            </Text>
            <Upcoming rules={active} onEdit={onEdit} />
          </View>
          <View className="gap-2">
            <Text variant="label" tone="muted">
              All recurring items
            </Text>
            <Card className="p-0 tablet:p-0">
              {[...active, ...paused].map((r, i) => (
                <ListItem
                  key={r.id}
                  divider={i > 0}
                  title={r.template.payee}
                  subtitle={`${describeRRule(r.rrule) ?? ""} · next ${r.nextDate}`}
                  leading={
                    <IconTile>
                      <RepeatIcon />
                    </IconTile>
                  }
                  trailing={
                    r.active ? (
                      <Amount value={r.template.amount} currency={r.template.currency} />
                    ) : (
                      <Chip label="Paused" />
                    )
                  }
                  onPress={() => onEdit(r)}
                />
              ))}
            </Card>
          </View>
        </>
      )}
    </View>
  );
}

function RepeatIcon() {
  const { colors } = useTheme();
  return <Repeat size={18} color={colors.muted} strokeWidth={1.6} />;
}

export default function Recurring() {
  const { colors } = useTheme();
  const [form, setForm] = useState<{
    rule?: RecurringRule | undefined;
    draft?: RuleDraft | undefined;
  } | null>(null);
  return (
    <Page
      title="Recurring"
      subtitle="Bills, subscriptions and income that repeat"
      actions={
        <Button
          label="Add"
          leading={<Plus size={18} color={colors.accentFg} strokeWidth={2} />}
          onPress={() => setForm({})}
          className="self-end"
        />
      }
    >
      <DataGate>
        <RecurringContent
          onAdd={() => setForm({})}
          onEdit={(rule) => setForm({ rule })}
          onAccept={(draft) => setForm({ draft })}
        />
      </DataGate>
      {form ? <RuleForm rule={form.rule} draft={form.draft} onClose={() => setForm(null)} /> : null}
    </Page>
  );
}
