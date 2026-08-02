import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadow, spacing, type } from '../theme';
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

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action}
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
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...type.label,
    color: colors.muted,
    textTransform: 'uppercase',
  },
});
