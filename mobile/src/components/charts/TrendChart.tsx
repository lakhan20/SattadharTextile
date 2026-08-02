import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Stop } from 'react-native-svg';
import { chart, colors, spacing, tabularNumbers, type } from '../../theme';
import { formatRupees } from '../../utils/money';

export interface TrendPoint {
  /** "YYYY-MM-DD". */
  date: string;
  total: number;
}

interface TrendChartProps {
  points: TrendPoint[];
  height?: number;
  /** Shown when every point is zero — an empty chart is not a chart. */
  emptyText: string;
  accessibilityLabel: string;
}

const PADDING = { top: spacing.md, right: spacing.sm, bottom: 22, left: spacing.sm };
const GRID_LINES = 3;

/**
 * A single-series area chart, hand-drawn on `react-native-svg`.
 *
 * There is no charting library in this project and adding one for a single
 * sparkline would mean a new native dependency and a config rebuild — for a
 * shape that is thirty lines of path maths. `react-native-svg` is already
 * here for the brand mark.
 *
 * One measure, so one hue and no legend: the section title says what the line
 * is. Only the peak is labelled — a number on every point is noise, and on a
 * 30-day range they would overlap into a smear.
 */
export function TrendChart({ points, height = 150, emptyText, accessibilityLabel }: TrendChartProps) {
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const onLayout = (event: LayoutChangeEvent): void => setWidth(event.nativeEvent.layout.width);

  const geometry = useMemo(() => {
    if (width <= 0 || points.length === 0) return null;

    const plotWidth = Math.max(1, width - PADDING.left - PADDING.right);
    const plotHeight = Math.max(1, height - PADDING.top - PADDING.bottom);
    const peak = Math.max(...points.map((p) => p.total));

    // A flat run of zeroes would divide by zero and, worse, draw a line across
    // the top as if it were a maximum. Scale to 1 and let it sit on the floor.
    const scaleMax = peak > 0 ? peak : 1;

    const x = (index: number): number =>
      points.length === 1
        ? PADDING.left + plotWidth / 2
        : PADDING.left + (index / (points.length - 1)) * plotWidth;
    const y = (value: number): number => PADDING.top + plotHeight - (value / scaleMax) * plotHeight;

    const coordinates = points.map((point, index) => ({ x: x(index), y: y(point.total), point, index }));

    const line = coordinates.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
    const baseline = PADDING.top + plotHeight;
    const area =
      coordinates.length > 0
        ? `${line} L${coordinates[coordinates.length - 1]!.x.toFixed(2)},${baseline} L${coordinates[0]!.x.toFixed(2)},${baseline} Z`
        : '';

    const peakIndex = points.reduce((best, p, i) => (p.total > points[best]!.total ? i : best), 0);

    return { coordinates, line, area, baseline, peak, peakIndex, plotWidth, plotHeight };
  }, [points, width, height]);

  const hasData = points.some((point) => point.total > 0);
  const active = geometry && activeIndex !== null ? geometry.coordinates[activeIndex] : null;
  const highlighted = active ?? (geometry && hasData ? geometry.coordinates[geometry.peakIndex] : null);

  return (
    <View onLayout={onLayout} accessibilityRole="image" accessibilityLabel={accessibilityLabel}>
      {/* Reserve the height before measuring, so the card does not jump. */}
      <View style={{ height }}>
        {geometry ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={chart.seriesFillTop} />
                <Stop offset="1" stopColor={chart.seriesFillBottom} />
              </LinearGradient>
            </Defs>

            {/* Grid sits behind and stays recessive — it orients, it does not compete. */}
            {Array.from({ length: GRID_LINES + 1 }, (_, i) => {
              const gridY = PADDING.top + (geometry.plotHeight / GRID_LINES) * i;
              return (
                <Line
                  key={i}
                  x1={PADDING.left}
                  y1={gridY}
                  x2={PADDING.left + geometry.plotWidth}
                  y2={gridY}
                  stroke={chart.grid}
                  strokeWidth={StyleSheet.hairlineWidth * 2}
                />
              );
            })}

            {hasData ? (
              <>
                <Path d={geometry.area} fill="url(#trendFill)" />
                <Path
                  d={geometry.line}
                  fill="none"
                  stroke={chart.series}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {highlighted ? (
                  <>
                    <Line
                      x1={highlighted.x}
                      y1={PADDING.top}
                      x2={highlighted.x}
                      y2={geometry.baseline}
                      stroke={chart.series}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      opacity={0.4}
                    />
                    {/* A 2px surface ring keeps the marker legible where it
                        overlaps the filled area. */}
                    <Circle cx={highlighted.x} cy={highlighted.y} r={6} fill={chart.surface} />
                    <Circle cx={highlighted.x} cy={highlighted.y} r={4.5} fill={chart.series} />
                  </>
                ) : null}
              </>
            ) : null}
          </Svg>
        ) : null}

        {/* Touch targets are full-height columns, far bigger than the marks. */}
        {geometry && hasData ? (
          <View style={[StyleSheet.absoluteFill, styles.touchRow]}>
            {points.map((point, index) => (
              <Pressable
                key={point.date}
                style={styles.touchColumn}
                onPressIn={() => setActiveIndex(index)}
                onPressOut={() => setActiveIndex(null)}
                accessibilityRole="button"
                accessibilityLabel={`${labelFor(point.date)}, ${formatRupees(point.total)}`}
              />
            ))}
          </View>
        ) : null}
      </View>

      {hasData && highlighted ? (
        <View style={styles.readout}>
          <Text style={styles.readoutDate}>{labelFor(highlighted.point.date)}</Text>
          <Text style={styles.readoutValue}>{formatRupees(highlighted.point.total)}</Text>
        </View>
      ) : (
        <Text style={styles.empty}>{emptyText}</Text>
      )}

      {points.length > 1 && hasData ? (
        <View style={styles.axis}>
          <Text style={styles.axisLabel}>{labelFor(points[0]!.date)}</Text>
          <Text style={styles.axisLabel}>{labelFor(points[points.length - 1]!.date)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "04 Aug" — enough to place a point without crowding the axis. */
function labelFor(dateKey: string): string {
  const [, month, day] = dateKey.split('-');
  return `${day} ${MONTHS[Number(month) - 1] ?? ''}`.trim();
}

const styles = StyleSheet.create({
  touchRow: { flexDirection: 'row' },
  touchColumn: { flexGrow: 1, flexBasis: 0 },

  readout: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  readoutDate: { ...type.caption, color: colors.muted },
  readoutValue: { ...type.kpiSmall, color: colors.text, ...tabularNumbers },

  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axisLabel: { ...type.caption, color: chart.axisLabel },

  empty: { ...type.small, color: colors.muted, textAlign: 'center', marginTop: spacing.sm },
});
