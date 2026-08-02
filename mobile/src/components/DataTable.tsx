import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, tabularNumbers, type } from '../theme';

export interface DataColumn<T> {
  key: string;
  header: string;
  /** Fixed width in dp. Numeric columns are sized for their widest figure. */
  width: number;
  align?: 'left' | 'right';
  /** Money and quantities must render right-aligned and tabular. */
  numeric?: boolean;
  render: (row: T) => string;
  /** Lets a row flag itself, e.g. an over-limit balance in danger ink. */
  tone?: (row: T) => 'default' | 'danger' | 'warning' | 'success';
}

interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  /** Bold summary row pinned under the body. */
  totals?: Partial<Record<string, string>>;
  emptyText: string;
}

const TONE_COLOR = {
  default: colors.text,
  danger: colors.dangerInk,
  warning: colors.warningInk,
  success: colors.successInk,
} as const;

/**
 * A table that scrolls sideways rather than squeezing.
 *
 * A report has more columns than a 360dp phone can hold, and the two ways out
 * are both worse than scrolling: shrinking the type until figures stop being
 * legible, or dropping columns and quietly changing what the report says. The
 * first column stays put as a row header so a sideways scroll never leaves you
 * looking at unlabelled numbers.
 *
 * Every numeric cell is right-aligned and tabular, so a column of rupees reads
 * as a column.
 */
export function DataTable<T>({ columns, rows, keyExtractor, totals, emptyText }: DataTableProps<T>) {
  if (rows.length === 0) {
    return <Text style={styles.empty}>{emptyText}</Text>;
  }

  const [firstColumn, ...scrollingColumns] = columns;
  if (!firstColumn) return null;

  const cellStyle = (column: DataColumn<T>) => [
    styles.cell,
    { width: column.width },
    (column.align ?? (column.numeric ? 'right' : 'left')) === 'right' && styles.cellRight,
    column.numeric && tabularNumbers,
  ];

  return (
    <View style={styles.frame}>
      {/* Pinned row-header column. */}
      <View>
        <View style={[styles.headerRow, styles.pinned]}>
          <Text style={[styles.headerCell, { width: firstColumn.width }]} numberOfLines={2}>
            {firstColumn.header}
          </Text>
        </View>
        {rows.map((row, index) => (
          <View key={keyExtractor(row)} style={[styles.bodyRow, styles.pinned, index % 2 === 1 && styles.zebra]}>
            <Text style={[styles.cell, { width: firstColumn.width }]} numberOfLines={2}>
              {firstColumn.render(row)}
            </Text>
          </View>
        ))}
        {totals ? (
          <View style={[styles.totalRow, styles.pinned]}>
            <Text style={[styles.totalCell, { width: firstColumn.width }]} numberOfLines={1}>
              {totals[firstColumn.key] ?? ''}
            </Text>
          </View>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} bounces={false}>
        <View>
          <View style={styles.headerRow}>
            {scrollingColumns.map((column) => (
              <Text
                key={column.key}
                style={[
                  styles.headerCell,
                  { width: column.width },
                  (column.align ?? (column.numeric ? 'right' : 'left')) === 'right' && styles.cellRight,
                ]}
                numberOfLines={2}
              >
                {column.header}
              </Text>
            ))}
          </View>

          {rows.map((row, index) => (
            <View key={keyExtractor(row)} style={[styles.bodyRow, index % 2 === 1 && styles.zebra]}>
              {scrollingColumns.map((column) => (
                <Text
                  key={column.key}
                  style={[...cellStyle(column), { color: TONE_COLOR[column.tone?.(row) ?? 'default'] }]}
                  numberOfLines={1}
                >
                  {column.render(row)}
                </Text>
              ))}
            </View>
          ))}

          {totals ? (
            <View style={styles.totalRow}>
              {scrollingColumns.map((column) => (
                <Text
                  key={column.key}
                  style={[
                    styles.totalCell,
                    { width: column.width },
                    (column.align ?? (column.numeric ? 'right' : 'left')) === 'right' && styles.cellRight,
                    column.numeric && tabularNumbers,
                  ]}
                  numberOfLines={1}
                >
                  {totals[column.key] ?? ''}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const ROW_PADDING = spacing.sm;

const styles = StyleSheet.create({
  frame: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  pinned: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    backgroundColor: colors.surface,
  },

  headerRow: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: ROW_PADDING,
  },
  headerCell: {
    ...type.caption,
    color: colors.onPrimary,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.sm,
  },

  bodyRow: {
    flexDirection: 'row',
    minHeight: 38,
    alignItems: 'center',
    paddingVertical: 5,
  },
  zebra: { backgroundColor: colors.background },
  cell: { ...type.small, color: colors.text, paddingHorizontal: spacing.sm },
  cellRight: { textAlign: 'right' },

  totalRow: {
    flexDirection: 'row',
    minHeight: 38,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  totalCell: {
    ...type.smallStrong,
    color: colors.primaryInk,
    paddingHorizontal: spacing.sm,
  },

  empty: {
    ...type.body,
    color: colors.muted,
    textAlign: 'center',
    paddingVertical: spacing.xxl,
  },
});
