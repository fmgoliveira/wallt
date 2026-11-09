import type {
  AmountLocale,
  ColumnChoice,
  ColumnRole,
  DateFormat,
  ImportMapping,
} from "@wallt/ingest";
import { Select, type SelectOption, Switch, Tabs, Text } from "@wallt/ui";
import { View } from "react-native";

const NONE = "none";

const dateFormats = [
  { value: "dmy", label: "Day first · 31-12-2024" },
  { value: "mdy", label: "Month first · 12-31-2024" },
  { value: "ymd", label: "Year first · 2024-12-31" },
  { value: "serial", label: "Excel serial number" },
] as const;
type DateChoice = (typeof dateFormats)[number]["value"];

const localeChoices = [
  { value: "pt", label: "1.234,56 · comma decimals" },
  { value: "en", label: "1,234.56 · point decimals" },
  { value: "auto", label: "Detect per value" },
] as const;

const dateChoiceOf = (f: DateFormat): DateChoice => (f.kind === "serial" ? "serial" : f.order);
const dateFormatOf = (c: DateChoice): DateFormat =>
  c === "serial" ? { kind: "serial" } : { kind: "pattern", order: c };

const amountModes = [
  { value: "single", label: "One amount column" },
  { value: "split", label: "Debit and credit" },
] as const;

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
  const options: SelectOption<string>[] = [
    { value: NONE, label: "None" },
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
      label={hint ? `${label} (${hint})` : label}
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
    { value: NONE, label: "No header row" },
    ...Array.from({ length: headerCandidates }, (_, i) => ({
      value: String(i),
      label: `Row ${i + 1}`,
    })),
  ];

  return (
    <View className="gap-4">
      <Select
        label="Header row"
        options={headerOptions}
        value={mapping.headerRow === null ? NONE : String(mapping.headerRow)}
        onChange={(v) => onChange({ ...mapping, headerRow: v === NONE ? null : Number(v) })}
      />
      {pick("date", "Date")}
      {pick("valueDate", "Value date", "optional")}
      {pick("description", "Description")}
      {pick("payee", "Payee", "optional")}
      <View className="gap-2">
        <Text variant="small" tone="muted" weight="medium">
          Amounts
        </Text>
        <Tabs items={amountModes} value={split ? "split" : "single"} onChange={(v) => setMode(v)} />
      </View>
      {split ? (
        <>
          {pick("debit", "Debit", "money out")}
          {pick("credit", "Credit", "money in")}
        </>
      ) : (
        <>
          {pick("amount", "Amount")}
          <Switch
            label="Flip the sign"
            description="Use when expenses are listed as positive numbers"
            value={mapping.invertSign}
            onValueChange={(v) => onChange({ ...mapping, invertSign: v })}
          />
        </>
      )}
      {pick("balance", "Balance", "optional, checks the signs")}
      <Select
        label="Date format"
        options={dateFormats}
        value={dateChoiceOf(mapping.dateFormat)}
        onChange={(v) => onChange({ ...mapping, dateFormat: dateFormatOf(v) })}
      />
      <Select
        label="Number format"
        options={localeChoices}
        value={mapping.amountLocale}
        onChange={(v) => onChange({ ...mapping, amountLocale: v as AmountLocale })}
      />
    </View>
  );
}
