import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { TAP_TARGET, colors, radius, shadow, spacing, type } from '../theme';
import { Touchable } from './Touchable';

/**
 * `accent` is the single emphasis action on a screen — never two on one
 * screen. `primary` is the standard confirming action; `outline`/`ghost` are
 * secondary.
 *
 * `gold` and `indigo` are the previous palette's names, kept as aliases so the
 * screens that still use them keep working. Prefer `accent`/`primary`.
 */
export type ButtonVariant =
  | 'accent'
  | 'primary'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'whatsapp'
  | 'gold'
  | 'indigo';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  size?: 'regular' | 'small';
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

interface Paint {
  bg: string;
  fg: string;
  border?: string;
  /** Filled buttons carry a shadow; transparent ones must not. */
  elevated?: boolean;
}

const PALETTE: Record<ButtonVariant, Paint> = {
  accent: { bg: colors.accent, fg: colors.onAccent, elevated: true },
  primary: { bg: colors.primary, fg: colors.onPrimary, elevated: true },
  outline: { bg: 'transparent', fg: colors.primary, border: colors.borderStrong },
  ghost: { bg: 'transparent', fg: colors.primary },
  danger: { bg: colors.danger, fg: colors.onAccent, elevated: true },
  whatsapp: { bg: '#25D366', fg: '#FFFFFF', elevated: true },

  gold: { bg: colors.accent, fg: colors.onAccent, elevated: true },
  indigo: { bg: colors.primary, fg: colors.onPrimary, elevated: true },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  fullWidth = true,
  size = 'regular',
  style,
  accessibilityHint,
}: ButtonProps) {
  const paint = PALETTE[variant];
  const isDisabled = disabled || loading;

  return (
    <Touchable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        size === 'small' && styles.small,
        {
          backgroundColor: paint.bg,
          borderColor: paint.border ?? 'transparent',
          borderWidth: paint.border ? 1 : 0,
        },
        // A disabled button is flat: a shadow reads as "pressable".
        paint.elevated && !isDisabled ? shadow.sm : null,
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {/* The spinner replaces the label in place, so the button keeps its
          width and the layout around it never shifts mid-submit. */}
      {loading ? (
        <ActivityIndicator color={paint.fg} size="small" />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text style={[type.button, { color: paint.fg }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TAP_TARGET,
    borderRadius: radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  small: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  fullWidth: { alignSelf: 'stretch' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
