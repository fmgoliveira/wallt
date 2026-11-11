import { REPORT_PERIODS, type ReportPeriod } from "@wallt/core";
import { Button, Select, Sheet, Text, useBreakpoint, useTheme } from "@wallt/ui";
import { SlidersHorizontal } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { categoryTint } from "../categories/color";
import { categoryOptions } from "../categories/options";
import { displayColor } from "../components/colors";
import { ToggleChip } from "../components/ToggleChip";
import { useAccounts, useCategories, useTags } from "../data/hooks";
import { useTranslation } from "../i18n";

const periodKeys = {
  month: "reports.periodMonth",
  "last-month": "reports.periodLastMonth",
  "3m": "reports.period3m",
  "6m": "reports.period6m",
  "12m": "reports.period12m",
  ytd: "reports.periodYtd",
} as const satisfies Record<ReportPeriod, string>;

export interface ReportQuery {
  period: ReportPeriod;
  accounts: string[];
  categories: string[];
  tags: string[];
}

export const defaultReportQuery: ReportQuery = {
  period: "6m",
  accounts: [],
  categories: [],
  tags: [],
};

const toggle = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

const activeCount = (q: ReportQuery) =>
  (q.accounts.length ? 1 : 0) + (q.categories.length ? 1 : 0) + (q.tags.length ? 1 : 0);

/** Shared filter bar of the Reports screen: period always visible, accounts/categories/tags in a sheet. */
export function ReportFilters({
  query,
  onChange,
}: {
  query: ReportQuery;
  onChange: (q: ReportQuery) => void;
}) {
  const { t } = useTranslation();
  const { scheme, colors } = useTheme();
  const bp = useBreakpoint();
  const [open, setOpen] = useState(false);
  const accounts = useAccounts().data ?? [];
  const categories = useCategories().data ?? [];
  const tags = useTags().data ?? [];
  const n = activeCount(query);
  const cats = categoryOptions(categories, "expense");

  return (
    <View className="flex-row items-end gap-3">
      <View className={bp === "phone" ? "flex-1" : "w-64"}>
        <Select
          label={t("reports.period")}
          options={REPORT_PERIODS.map((p) => ({ value: p.value, label: t(periodKeys[p.value]) }))}
          value={query.period}
          onChange={(period) => onChange({ ...query, period })}
        />
      </View>
      <Button
        label={n > 0 ? t("reports.filtersCount", { n }) : t("reports.filters")}
        variant="secondary"
        leading={<SlidersHorizontal size={16} color={colors.text} strokeWidth={1.8} />}
        onPress={() => setOpen(true)}
      />
      {n > 0 ? (
        <Button
          label={t("reports.clear")}
          variant="ghost"
          onPress={() => onChange({ ...query, accounts: [], categories: [], tags: [] })}
        />
      ) : null}
      {open ? (
        <Sheet visible onClose={() => setOpen(false)} title={t("reports.filterReports")}>
          <View className="gap-1.5">
            <Text variant="small" tone="muted" weight="medium">
              {t("reports.accounts")}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {accounts.map((a) => (
                <ToggleChip
                  key={a.id}
                  label={a.name}
                  color={displayColor(a.color, a.id, scheme)}
                  selected={query.accounts.includes(a.id)}
                  onPress={() => onChange({ ...query, accounts: toggle(query.accounts, a.id) })}
                />
              ))}
            </View>
          </View>
          <View className="gap-1.5">
            <Text variant="small" tone="muted" weight="medium">
              {t("reports.categories")}
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
                  onPress={() =>
                    onChange({ ...query, categories: toggle(query.categories, c.value) })
                  }
                />
              ))}
            </View>
          </View>
          {tags.length > 0 ? (
            <View className="gap-1.5">
              <Text variant="small" tone="muted" weight="medium">
                {t("reports.tags")}
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {tags.map((tag) => (
                  <ToggleChip
                    key={tag.id}
                    label={tag.name}
                    selected={query.tags.includes(tag.id)}
                    onPress={() => onChange({ ...query, tags: toggle(query.tags, tag.id) })}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <Button label={t("reports.done")} onPress={() => setOpen(false)} />
        </Sheet>
      ) : null}
    </View>
  );
}
