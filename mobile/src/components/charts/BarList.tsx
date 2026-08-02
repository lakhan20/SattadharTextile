import { StyleSheet, Text, View } from 'react-native';
import { chart, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { formatRupees } from '../../utils/money';

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Right-hand caption, e.g. "18.4% · 220 m". */
  caption?: string;
}

interface BarListProps {
  data: BarDatum[];
  emptyText: string;
  /** Bars are drawn against this rather than the local max when totals matter. */
  max?: number;
}

/**
 * Horizontal bars for one measure across categories — the readable form for
 * ranked magnitude on a phone, where a vertical bar chart would either clip
 * its labels or rotate them.
 *
 * One measure means one hue: colouring each category differently would imply
 * an identity encoding that carries no information, and would need a legend to
 * decode something the row already spells out in words. Every row is directly
 * labelled, so nothing here depends on colour at all.
 */
export function BarList({ data, emptyText, max }: BarListProps) {
  if (data.length === 0) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }

  const scaleMax = Math.max(max ?? 0, ...data.map((d) => d.value), 1);

  return (
    <View style={styles.list}>
      {data.map((datum) => {
        // Sub-1% bars would render as an invisible sliver; give them a stub so
        // the row still reads as "present but small" rather than "missing".
        const fraction = datum.value <= 0 ? 0 : Math.max(0.02, datum.value / scaleMax);
        return (
          <View key={datum.key} style={styles.row}>
            <View style={styles.labelRow}>
              <Text style={styles.label} numberOfLines={1}>
                {datum.label}
              </Text>
              <Text style={styles.value}>{formatRupees(datum.value)}</Text>
            </View>

            <View style={styles.track}>
              <View style={[styles.bar, { width: `${fraction * 100}%` }]} />
            </View>

            {datum.caption ? <Text style={styles.caption}>{datum.caption}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

export interface SegmentDatum {
  key: string;
  label: string;
  value: number;
  colour: string;
}

/**
 * A single stacked bar plus a legend — for parts of one total, such as the
 * ageing buckets.
 *
 * Segments are separated by a 2px gap in the surface colour rather than
 * abutting, so two adjacent segments never read as one longer block. The
 * legend names every segment and repeats its figure, which is what makes the
 * chart safe for a colourblind reader; the colours are the verified ramp in
 * `theme/tokens.chart.ageing`, not the UI's warning/danger pair.
 */
export function SegmentedBar({ segments, emptyText }: { segments: SegmentDatum[]; emptyText: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  if (total <= 0) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }

  const visible = segments.filter((segment) => segment.value > 0);

  return (
    <View style={styles.segmentWrap}>
      <View style={styles.segmentTrack}>
        {visible.map((segment, index) => (
          <View
            key={segment.key}
            style={[
              styles.segment,
              {
                flexGrow: segment.value,
                backgroundColor: segment.colour,
                marginLeft: index === 0 ? 0 : 2,
              },
            ]}
          />
        ))}
      </View>

      <View style={styles.legend}>
        {segments.map((segment) => (
          <View key={segment.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: segment.colour }]} />
            <View style={styles.legendText}>
              <Text style={styles.legendLabel}>{segment.label}</Text>
              <Text style={styles.legendValue}>{formatRupees(segment.value)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const BAR_HEIGHT = 10;

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  row: { gap: 5 },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm },
  label: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  value: { ...type.money, color: colors.text, ...tabularNumbers },
  caption: { ...type.caption, color: colors.muted },

  track: {
    height: BAR_HEIGHT,
    backgroundColor: colors.surfaceSunken,
    borderRadius: BAR_HEIGHT / 2,
    overflow: 'hidden',
  },
  // Rounded data-end, anchored flush to the baseline at the left.
  bar: { height: BAR_HEIGHT, backgroundColor: chart.bar, borderRadius: BAR_HEIGHT / 2 },

  segmentWrap: { gap: spacing.lg },
  segmentTrack: { flexDirection: 'row', height: 14, borderRadius: radius.sm, overflow: 'hidden' },
  segment: { flexBasis: 0, height: 14 },

  legend: { gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  legendLabel: { ...type.small, color: colors.muted },
  legendValue: { ...type.money, color: colors.text, ...tabularNumbers },

  empty: { ...type.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.lg },
});
