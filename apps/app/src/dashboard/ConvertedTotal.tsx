import { fromLocalDate, type Money } from "@wallt/core";
import { Amount, Text } from "@wallt/ui";
import { View } from "react-native";
import { convertedTotal, REPORT_CURRENCY, useRateTable } from "../data/fx";

/**
 * "≈ €X in total" under a multi-currency net worth, converted at today's ECB rate. Shows nothing for a single
 * currency, and says so when some currency has no rate yet (so the sum is not silently short).
 */
export function ConvertedTotal({ balances }: { balances: readonly Money[] }) {
  const { table } = useRateTable();
  if (balances.length < 2) return null;
  const { total, unconverted } = convertedTotal(table, balances, fromLocalDate(new Date()));
  if (table.latestDate() === null) return null;
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <Text variant="small" tone="onHero" className="opacity-60">
        ≈ in {REPORT_CURRENCY}
      </Text>
      <Amount value={total} currency={REPORT_CURRENCY} tone="onHero" size="body" />
      {unconverted > 0 ? (
        <Text variant="small" tone="onHero" className="opacity-60">
          ({unconverted} without a rate)
        </Text>
      ) : null}
    </View>
  );
}
