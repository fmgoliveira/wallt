import { AmountInput, Button, DatePicker, Input, Select, Sheet, Text, useTheme } from "@wallt/ui";
import { SlidersHorizontal } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { categoryTint } from "../categories/color";
import { categoryOptions } from "../categories/options";
import { displayColor } from "../components/colors";
import { ToggleChip } from "../components/ToggleChip";
import { useAccounts, useCategories, useTags } from "../data/hooks";
import { activeFilterCount, type PeriodKey, periodOptions, type TxQuery } from "./filters";

type SetQuery = (patch: Partial<TxQuery>) => void;

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function FilterSheet({
  query,
  set,
  clear,
  onClose,
}: {
  query: TxQuery;
  set: SetQuery;
  clear: () => void;
  onClose: () => void;
}) {
  const { scheme } = useTheme();
  const accounts = useAccounts({ includeArchived: true }).data ?? [];
  const categories = useCategories({ includeArchived: true }).data ?? [];
  const tags = useTags().data ?? [];
  const currency =
    accounts.find((a) => query.accounts.includes(a.id))?.currency ?? accounts[0]?.currency ?? "EUR";
  const cats = [
    ...categoryOptions(categories, "expense"),
    ...categoryOptions(categories, "income"),
  ];

  return (
    <Sheet visible onClose={onClose} title="Filters">
      <Select
        label="Period"
        options={periodOptions}
        value={query.period}
        onChange={(v) => set({ period: v as PeriodKey })}
      />
      {query.period === "custom" ? (
        <View className="flex-row gap-3">
          <DatePicker
            className="flex-1"
            label="From"
            value={query.from}
            onChange={(v) => set({ from: v })}
            placeholder="Any date"
            clearable
          />
          <DatePicker
            className="flex-1"
            label="To"
            value={query.to}
            onChange={(v) => set({ to: v })}
            placeholder="Any date"
            clearable
          />
        </View>
      ) : null}

      <View className="gap-2">
        <Text variant="small" tone="muted" weight="medium">
          Accounts
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {accounts.map((a) => (
            <ToggleChip
              key={a.id}
              label={a.name}
              color={displayColor(a.color, a.id, scheme)}
              selected={query.accounts.includes(a.id)}
              onPress={() => set({ accounts: toggle(query.accounts, a.id) })}
            />
          ))}
        </View>
      </View>

      <View className="gap-2">
        <Text variant="small" tone="muted" weight="medium">
          Categories
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {cats.map((c) => (
            <ToggleChip
              key={c.value}
              label={c.label}
              color={categoryTint(
                categories.find((x) => x.id === c.value),
                categories,
                scheme,
              )}
              selected={query.categories.includes(c.value)}
              onPress={() => set({ categories: toggle(query.categories, c.value) })}
            />
          ))}
        </View>
      </View>

      {tags.length > 0 ? (
        <View className="gap-2">
          <Text variant="small" tone="muted" weight="medium">
            Tags
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {tags.map((t) => (
              <ToggleChip
                key={t.id}
                label={t.name}
                selected={query.tags.includes(t.id)}
                onPress={() => set({ tags: toggle(query.tags, t.id) })}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View className="gap-1.5">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <AmountInput
              label="Amount from"
              value={query.min}
              onChangeValue={(v) => set({ min: v })}
              currency={currency}
              allowNegative
              placeholder="No minimum"
            />
          </View>
          <View className="flex-1">
            <AmountInput
              label="Amount to"
              value={query.max}
              onChangeValue={(v) => set({ max: v })}
              currency={currency}
              allowNegative
              placeholder="No maximum"
            />
          </View>
        </View>
        <Text variant="small" tone="muted">
          Expenses are negative: -50 to -10 finds spending between 10 and 50.
        </Text>
      </View>

      <Button label="Done" onPress={onClose} />
      <Button label="Clear filters" variant="ghost" onPress={clear} />
    </Sheet>
  );
}

/** Search box + Filters button. The query itself lives in the URL (see `useTxQuery`). */
export function FilterBar({
  query,
  set,
  clear,
}: {
  query: TxQuery;
  set: SetQuery;
  clear: () => void;
}) {
  const { colors } = useTheme();
  const [text, setText] = useState(query.q);
  const [open, setOpen] = useState(false);
  const count = activeFilterCount(query);

  // Keep the box in step with the URL (back/forward, clear) ...
  useEffect(() => setText(query.q), [query.q]);
  // ... and push typing to the URL after a short pause, so each keystroke does not refetch.
  useEffect(() => {
    if (text === query.q) return;
    const id = setTimeout(() => set({ q: text }), 250);
    return () => clearTimeout(id);
  }, [text, query.q, set]);

  return (
    <View className="flex-row items-end gap-2">
      <Input
        className="flex-1"
        accessibilityLabel="Search transactions"
        value={text}
        onChangeText={setText}
        placeholder="Search payee, notes…  ( / )"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
      />
      <Button
        label={count > 0 ? `Filters · ${count}` : "Filters"}
        variant="secondary"
        leading={<SlidersHorizontal size={16} color={colors.text} strokeWidth={1.8} />}
        onPress={() => setOpen(true)}
      />
      {open ? (
        <FilterSheet query={query} set={set} clear={clear} onClose={() => setOpen(false)} />
      ) : null}
    </View>
  );
}
