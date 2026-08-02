import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  /** Small uppercase chip above the title, e.g. "Being built now". */
  badge?: string;
  actionLabel?: string;
  onAction?: () => void;
  tone?: 'neutral' | 'warning' | 'danger';
}

const TONE = {
  neutral: { bg: colors.primarySoft, fg: colors.primary },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
} as const;

export function EmptyState({
  icon,
  title,
  body,
  badge,
  actionLabel,
  onAction,
  tone = 'neutral',
}: EmptyStateProps) {
  const palette = TONE[tone];
  return (
    <View style={styles.wrap}>
      {icon ? <View style={[styles.iconRing, { backgroundColor: palette.bg }]}>{icon}</View> : null}

      {badge ? (
        <View style={[styles.badge, { backgroundColor: palette.bg }]}>
          <Text style={[styles.badgeText, { color: palette.fg }]}>{badge}</Text>
        </View>
      ) : null}

      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}

      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="outline" fullWidth={false} size="small" style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  badgeText: {
    ...type.caption,
    textTransform: 'uppercase',
  },
  title: {
    ...type.h3,
    color: colors.text,
    textAlign: 'center',
  },
  body: {
    ...type.body,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.sm,
    maxWidth: 320,
  },
  action: { marginTop: spacing.xl },
});
