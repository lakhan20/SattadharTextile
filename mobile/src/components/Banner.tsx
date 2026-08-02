import { StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, CheckCircle2, Info, WifiOff } from 'lucide-react-native';
import { ICON_STROKE, colors, radius, spacing, type } from '../theme';

export type BannerTone = 'error' | 'warning' | 'success' | 'info' | 'offline';

const TONE = {
  error: { bg: colors.dangerSoft, fg: colors.danger, Icon: AlertTriangle },
  warning: { bg: colors.warningSoft, fg: colors.warning, Icon: AlertTriangle },
  success: { bg: colors.successSoft, fg: colors.success, Icon: CheckCircle2 },
  info: { bg: colors.primarySoft, fg: colors.primary, Icon: Info },
  offline: { bg: colors.warningSoft, fg: colors.warning, Icon: WifiOff },
} as const;

interface BannerProps {
  tone?: BannerTone;
  title: string;
  body?: string | undefined;
}

/** Inline message attached to the thing it is about — not a floating toast. */
export function Banner({ tone = 'info', title, body }: BannerProps) {
  const { bg, fg, Icon } = TONE[tone];
  return (
    <View
      style={[styles.banner, { backgroundColor: bg }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Icon size={18} color={fg} strokeWidth={ICON_STROKE} style={styles.icon} />
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: fg }]}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.input,
  },
  icon: { marginTop: 1 },
  textBlock: { flex: 1, gap: 2 },
  title: { ...type.smallStrong },
  body: { ...type.small, color: colors.muted },
});
