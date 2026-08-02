import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, ring, shadow, spacing, tabularNumbers, type } from '../theme';

interface KpiTileProps {
  label: string;
  /** Leave undefined while the figure is not available yet — the tile shows a dash. */
  value?: string;
  caption?: string;
  icon?: ReactNode;
  tone?: 'default' | 'warning' | 'danger' | 'success' | 'accent';
  /** Sets the tile width — used to place tiles in a computed-width grid. */
  style?: StyleProp<ViewStyle>;
}

const TONE = {
  default: { ring: colors.primarySoft, value: colors.text },
  accent: { ring: colors.accentSoft, value: colors.text },
  warning: { ring: colors.warningSoft, value: colors.warningInk },
  danger: { ring: colors.dangerSoft, value: colors.dangerInk },
  success: { ring: colors.successSoft, value: colors.successInk },
} as const;

export function KpiTile({ label, value, caption, icon, tone = 'default', style }: KpiTileProps) {
  const palette = TONE[tone];
  const hasValue = value !== undefined && value !== '';

  return (
    <View style={[styles.tile, style]}>
      {icon ? <View style={[styles.iconRing, { backgroundColor: palette.ring }]}>{icon}</View> : null}
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
      <Text
        style={[styles.value, tabularNumbers, { color: hasValue ? palette.value : colors.faint }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {hasValue ? value : '—'}
      </Text>
      {caption ? (
        <Text style={styles.caption} numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    /**
     * `flexGrow`, never `flex: 1`. `flex: 1` implies `flexBasis: 0%`, which
     * overrides the `width` the grid passes in — and a zero-basis item can
     * never overflow its line, so `flexWrap` stops wrapping and every tile
     * crams onto one row. Leaving `flexBasis` at `auto` lets the given width
     * decide where the row breaks, and grow only absorbs the rounding
     * remainder on the last tile.
     */
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  iconRing: {
    width: ring.sm,
    height: ring.sm,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  label: {
    ...type.label,
    color: colors.muted,
    textTransform: 'uppercase',
  },
  value: {
    ...type.kpi,
    marginTop: spacing.xs,
  },
  caption: {
    ...type.small,
    color: colors.muted,
    marginTop: 2,
  },
});
