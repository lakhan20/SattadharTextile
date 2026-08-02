import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing, type } from '../theme';
import { Selvedge } from './Selvedge';
import { Touchable } from './Touchable';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Left accent stripe — used for low-stock and overdue warnings. */
  tone?: 'default' | 'warning' | 'danger' | 'success';
  padded?: boolean;
}

const TONE_BORDER: Record<NonNullable<CardProps['tone']>, string | undefined> = {
  default: undefined,
  warning: colors.warning,
  danger: colors.danger,
  success: colors.success,
};

export function Card({ children, style, onPress, tone = 'default', padded = true }: CardProps) {
  const accent = TONE_BORDER[tone];
  const cardStyle = [
    styles.card,
    padded && styles.padded,
    accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null,
    style,
  ];

  if (!onPress) return <View style={cardStyle}>{children}</View>;

  // `subtle` rather than the default dip: a card is large enough that a full
  // press-scale looks like the layout is collapsing under the finger.
  return (
    <Touchable onPress={onPress} accessibilityRole="button" feedback="subtle" style={cardStyle}>
      {children}
    </Touchable>
  );
}

/**
 * A section boundary.
 *
 * `rule` draws the selvedge under the label — the app's signature, see
 * `Selvedge`. It is off by default because most section headers in this app
 * sit *inside* a card, where the card's own border already finishes the edge
 * and a second finish reads as noise. Turn it on for headers that divide a
 * bare scroll, which is where the section genuinely has no other boundary.
 */
export function SectionHeader({
  title,
  action,
  rule = false,
}: {
  title: string;
  action?: ReactNode;
  rule?: boolean;
}) {
  return (
    <View style={rule ? styles.sectionBlock : null}>
      <View style={rule ? styles.sectionHeaderRuled : styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {action}
      </View>
      {rule ? <Selvedge /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },
  padded: { padding: spacing.lg },
  /** The header + its selvedge, held together above whatever the section holds. */
  sectionBlock: { marginBottom: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionHeaderRuled: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...type.label,
    color: colors.muted,
    textTransform: 'uppercase',
  },
});
