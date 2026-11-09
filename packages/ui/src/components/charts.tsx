import { useId, useState } from "react";
import { type LayoutChangeEvent, View } from "react-native";
import { BarChart as GiftedBar, PieChart } from "react-native-gifted-charts";
import Svg, { Defs, Line, LinearGradient, Path, Stop } from "react-native-svg";
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

/** Monotone cubic (Fritsch–Carlson) path through the points: smooth, but never overshoots the data. */
function monotonePath(pts: readonly { x: number; y: number }[]): string {
  const n = pts.length;
  if (n === 0) return "";
  const first = pts[0] as { x: number; y: number };
  if (n === 1) return `M${first.x},${first.y}`;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i] as { x: number; y: number };
    const q = pts[i + 1] as { x: number; y: number };
    dx.push(q.x - p.x);
    slope.push((q.y - p.y) / (q.x - p.x || 1));
  }
  const m: number[] = [slope[0] as number];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1] as number;
    const b = slope[i] as number;
    m.push(a * b <= 0 ? 0 : (a + b) / 2);
  }
  m.push(slope[n - 2] as number);
  for (let i = 0; i < n - 1; i++) {
    const d = slope[i] as number;
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = (m[i] as number) / d;
    const b = (m[i + 1] as number) / d;
    const h = Math.hypot(a, b);
    if (h > 3) {
      m[i] = (3 * a * d) / h;
      m[i + 1] = (3 * b * d) / h;
    }
  }
  let d = `M${first.x},${first.y}`;
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i] as { x: number; y: number };
    const q = pts[i + 1] as { x: number; y: number };
    const w = (dx[i] as number) / 3;
    d += ` C${p.x + w},${p.y + w * (m[i] as number)} ${q.x - w},${q.y - w * (m[i + 1] as number)} ${q.x},${q.y}`;
  }
  return d;
}

const PAD = { top: 8, right: 8, bottom: 22, left: 8 };

/**
 * Line (optionally with a soft area fill) over evenly spaced points, drawn directly with SVG so the plot is
 * always exactly `height` tall and the value range (negatives included) is fitted to it.
 */
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
  const gradientId = useId().replace(/:/g, "");
  const plotW = Math.max(1, width - PAD.left - PAD.right);
  const plotH = Math.max(1, height - PAD.top - PAD.bottom);

  const values = data.map((d) => d.value);
  let lo = Math.min(...values, 0);
  let hi = Math.max(...values, 0);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo === hi) {
    lo = (Number.isFinite(lo) ? lo : 0) - 1;
    hi = (Number.isFinite(hi) ? hi : 0) + 1;
  }
  const margin = (hi - lo) * 0.08;
  lo -= margin;
  hi += margin;
  const x = (i: number) =>
    PAD.left + (data.length > 1 ? (plotW * i) / (data.length - 1) : plotW / 2);
  const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
  const pts = data.map((d, i) => ({ x: x(i), y: y(d.value) }));
  const line = monotonePath(pts);
  const baseY = PAD.top + plotH;
  const last = pts.at(-1);
  const firstPt = pts[0];
  const areaPath = last && firstPt ? `${line} L${last.x},${baseY} L${firstPt.x},${baseY} Z` : "";
  const every = Math.ceil(data.length / 5);

  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ height }}
    >
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={stroke} stopOpacity={0.3} />
            <Stop offset="1" stopColor={stroke} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {[0, 1, 2, 3].map((i) => (
          <Line
            key={i}
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={PAD.top + (plotH * i) / 3}
            y2={PAD.top + (plotH * i) / 3}
            stroke={withAlpha(colors.border, 0.8)}
            strokeWidth={1}
          />
        ))}
        {lo < 0 && hi > 0 ? (
          <Line
            x1={PAD.left}
            x2={PAD.left + plotW}
            y1={y(0)}
            y2={y(0)}
            stroke={colors.borderStrong}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}
        {area && areaPath ? <Path d={areaPath} fill={`url(#${gradientId})`} /> : null}
        <Path
          d={line}
          stroke={stroke}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      {data.map((d, i) =>
        i === 0 || i === data.length - 1 || i % every === 0 ? (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: positional labels
            key={i}
            variant="small"
            tone="muted"
            style={{
              position: "absolute",
              top: height - PAD.bottom + 4,
              left: Math.min(Math.max(x(i) - 24, 0), width - 48),
              width: 48,
              textAlign: i === 0 ? "left" : i === data.length - 1 ? "right" : "center",
              fontSize: 10,
              lineHeight: 14,
            }}
          >
            {d.label}
          </Text>
        ) : null,
      )}
    </View>
  );
}
