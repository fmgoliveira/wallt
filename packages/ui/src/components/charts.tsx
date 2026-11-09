import { useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import {
  BarChart as GiftedBar,
  LineChart as GiftedLine,
  PieChart,
} from "react-native-gifted-charts";
import { useTheme } from "../theme/context";
import { withAlpha } from "../tokens";
import { Text } from "./primitives";

/**
 * Thin chart wrappers (ADR 0003): screens never import the chart library, so a swap stays contained. Every colour
 * comes from tokens. Axis amounts are not drawn: totals and legends are text next to the chart, which keeps privacy
 * mode honest (a hidden amount is never leaked by an axis) and the chart readable at phone width.
 */

function useWidth(fallback = 300) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== width) setWidth(w);
  };
  return { width: width || fallback, onLayout, measured: width > 0 };
}

export interface DonutSlice {
  value: number;
  color: string;
}

/** Donut with a centre label (e.g. the total). `size` is the outer diameter. */
export function DonutChart({
  data,
  size = 180,
  centerLabel,
  centerCaption,
  accessibilityLabel,
}: {
  data: readonly DonutSlice[];
  size?: number;
  centerLabel?: string;
  centerCaption?: string;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const radius = size / 2;
  const slices = data.filter((d) => d.value > 0);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      className="items-center"
    >
      <PieChart
        data={
          slices.length > 0
            ? slices.map((d) => ({ value: d.value, color: d.color }))
            : [{ value: 1, color: colors.border }]
        }
        donut
        radius={radius}
        innerRadius={radius * 0.64}
        innerCircleColor={colors.surface}
        strokeColor={colors.surface}
        strokeWidth={2}
        isAnimated={false}
        centerLabelComponent={() => (
          <View className="items-center">
            {centerLabel ? (
              <Text variant="title" tabular>
                {centerLabel}
              </Text>
            ) : null}
            {centerCaption ? (
              <Text variant="small" tone="muted">
                {centerCaption}
              </Text>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

export interface BarGroup {
  label: string;
  a: number;
  b: number;
}

/** Grouped bars (income in `positive`, spending in `text`), one group per label. */
export function PairedBarChart({
  data,
  height = 180,
  accessibilityLabel,
}: {
  data: readonly BarGroup[];
  height?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const { width, onLayout } = useWidth();
  const groups = Math.max(1, data.length);
  const slot = Math.max(18, Math.floor((width - 16) / groups));
  const barWidth = Math.max(5, Math.min(18, Math.floor(slot / 2.8)));
  const bars = data.flatMap((g) => [
    {
      value: g.a,
      label: g.label,
      frontColor: colors.positive,
      spacing: 2,
      labelWidth: slot,
      labelTextStyle: { color: colors.muted, fontSize: 10 },
    },
    { value: g.b, frontColor: colors.text, spacing: Math.max(4, slot - barWidth * 2 - 2) },
  ]);
  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <GiftedBar
        data={bars}
        width={width - 8}
        height={height}
        barWidth={barWidth}
        initialSpacing={Math.max(4, (slot - barWidth * 2) / 2)}
        endSpacing={0}
        barBorderTopLeftRadius={3}
        barBorderTopRightRadius={3}
        hideYAxisText
        yAxisThickness={0}
        xAxisColor={colors.border}
        rulesColor={colors.border}
        noOfSections={3}
        isAnimated={false}
        disablePress
        backgroundColor="transparent"
      />
    </View>
  );
}

export interface SeriesPoint {
  label: string;
  value: number;
}

/** Line (optionally with the soft area fill below it) over evenly spaced points. */
export function SeriesChart({
  data,
  color,
  area,
  height = 160,
  accessibilityLabel,
}: {
  data: readonly SeriesPoint[];
  color?: string;
  area?: boolean;
  height?: number;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const { width, onLayout } = useWidth();
  const stroke = color ?? colors.text;
  const spacing = data.length > 1 ? Math.max(4, (width - 24) / (data.length - 1)) : width;
  const points = data.map((d, i) => ({
    value: d.value,
    // label only a handful of points so the axis never crowds
    label: i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 5) === 0 ? d.label : "",
    labelTextStyle: { color: colors.muted, fontSize: 10, width: 48 },
  }));
  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <GiftedLine
        data={points}
        width={width - 24}
        height={height}
        spacing={spacing}
        initialSpacing={8}
        endSpacing={8}
        color={stroke}
        thickness={2}
        hideDataPoints
        areaChart={area ?? false}
        startFillColor={stroke}
        endFillColor={stroke}
        startOpacity={0.3}
        endOpacity={0}
        curved
        hideYAxisText
        yAxisThickness={0}
        xAxisColor={colors.border}
        rulesColor={withAlpha(colors.border, 0.8)}
        noOfSections={3}
        isAnimated={false}
        disableScroll
        backgroundColor="transparent"
        adjustToWidth={false}
      />
    </View>
  );
}
