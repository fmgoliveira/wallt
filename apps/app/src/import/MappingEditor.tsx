import type {
  AmountLocale,
  ColumnChoice,
  ColumnRole,
  DateFormat,
  ImportMapping,
} from "@wallt/ingest";
import { Select, type SelectOption, Switch, Tabs, Text } from "@wallt/ui";
import { View } from "react-native";
import { useTranslation } from "../i18n";

const NONE = "none";

const DATE_FORMATS = ["dmy", "mdy", "ymd", "serial"] as const;
type DateChoice = (typeof DATE_FORMATS)[number];

const LOCALE_CHOICES = ["pt", "en", "auto"] as const;

const dateChoiceOf = (f: DateFormat): DateChoice => (f.kind === "serial" ? "serial" : f.order);
const dateFormatOf = (c: DateChoice): DateFormat =>
  c === "serial" ? { kind: "serial" } : { kind: "pattern", order: c };

const AMOUNT_MODES = ["single", "split"] as const;

export interface MappingEditorProps {
  mapping: ImportMapping;
  onChange: (next: ImportMapping) => void;
  columns: readonly ColumnChoice[];
  /** How many leading rows can be the header (for the header-row picker). */
  headerCandidates: number;
}

/**
 * Lets the user correct what auto-detection inferred: header row, which column is what, date and number format,
 * sign. Every change goes straight back to the live preview.
 */
export function MappingEditor({
  mapping,
  onChange,
  columns,
  headerCandidates,
}: MappingEditorProps) {
  const { t } = useTranslation();
  const dateFormats = DATE_FORMATS.map((value) => ({
    value,
    label: t(`importing.mapping.${value}`),
  }));
  const localeChoices = LOCALE_CHOICES.map((value) => ({
    value,
    label: t(`importing.mapping.${value}`),
  }));
  const amountModes = AMOUNT_MODES.map((value) => ({
    value,
    label: t(`importing.mapping.${value}`),
  }));
  const options: SelectOption<string>[] = [
    { value: NONE, label: t("importing.mapping.none") },
    ...columns.map((c) => ({ value: String(c.index), label: c.label })),
  ];
  const split = mapping.columns.debit !== undefined || mapping.columns.credit !== undefined;

  const setColumn = (role: ColumnRole, value: string) => {
    const next = { ...mapping.columns };
    if (value === NONE) delete next[role];
    else next[role] = Number(value);
    onChange({ ...mapping, columns: next });
  };
  const pick = (role: ColumnRole, label: string, hint?: string) => (
    <Select
      key={role}
      label={hint ? t("importing.mapping.withHint", { label, hint }) : label}
      options={options}
      value={mapping.columns[role] === undefined ? NONE : String(mapping.columns[role])}
      onChange={(v) => setColumn(role, v)}
    />
  );
  const setMode = (mode: "single" | "split") => {
    const next = { ...mapping.columns };
    if (mode === "single") {
      delete next.debit;
      delete next.credit;
    } else {
      delete next.amount;
      // seed the pair from the amount column's neighbours so the pickers are not empty
      next.debit = mapping.columns.amount ?? 0;
    }
    onChange({
      ...mapping,
      columns: next,
      invertSign: mode === "split" ? false : mapping.invertSign,
    });
  };
  const headerOptions: SelectOption<string>[] = [
    { value: NONE, label: t("importing.mapping.noHeader") },
    ...Array.from({ length: headerCandidates }, (_, i) => ({
      value: String(i),
      label: t("importing.mapping.row", { n: i + 1 }),
    })),
  ];

  return (
    <View className="gap-4">
      <Select
        label={t("importing.mapping.headerRow")}
        options={headerOptions}
        value={mapping.headerRow === null ? NONE : String(mapping.headerRow)}
        onChange={(v) => onChange({ ...mapping, headerRow: v === NONE ? null : Number(v) })}
      />
      {pick("date", t("importing.mapping.date"))}
      {pick("valueDate", t("importing.mapping.valueDate"), t("importing.mapping.optional"))}
      {pick("description", t("importing.mapping.description"))}
      {pick("payee", t("importing.mapping.payee"), t("importing.mapping.optional"))}
      <View className="gap-2">
        <Text variant="small" tone="muted" weight="medium">
          {t("importing.mapping.amounts")}
        </Text>
        <Tabs items={amountModes} value={split ? "split" : "single"} onChange={(v) => setMode(v)} />
      </View>
      {split ? (
        <>
          {pick("debit", t("importing.mapping.debit"), t("importing.mapping.moneyOut"))}
          {pick("credit", t("importing.mapping.credit"), t("importing.mapping.moneyIn"))}
        </>
      ) : (
        <>
          {pick("amount", t("importing.mapping.amount"))}
          <Switch
            label={t("importing.mapping.flipSign")}
            description={t("importing.mapping.flipSignHint")}
            value={mapping.invertSign}
            onValueChange={(v) => onChange({ ...mapping, invertSign: v })}
          />
        </>
      )}
      {pick("balance", t("importing.mapping.balance"), t("importing.mapping.balanceHint"))}
      <Select
        label={t("importing.mapping.dateFormat")}
        options={dateFormats}
        value={dateChoiceOf(mapping.dateFormat)}
        onChange={(v) => onChange({ ...mapping, dateFormat: dateFormatOf(v) })}
      />
      <Select
        label={t("importing.mapping.numberFormat")}
        options={localeChoices}
        value={mapping.amountLocale}
        onChange={(v) => onChange({ ...mapping, amountLocale: v as AmountLocale })}
      />
    </View>
  );
}
