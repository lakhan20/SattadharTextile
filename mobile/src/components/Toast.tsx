import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle2, TriangleAlert } from 'lucide-react-native';
import { ICON_STROKE, colors, radius, shadow, spacing, type } from '../theme';

export type ToastTone = 'success' | 'error';

interface ToastProps {
  /** Passing a message shows the toast; passing null hides it. */
  message: string | null;
  tone?: ToastTone;
  onHide: () => void;
  durationMs?: number;
}

const TONE = {
  success: { bg: colors.successInk, Icon: CheckCircle2 },
  error: { bg: colors.dangerInk, Icon: TriangleAlert },
} as const;

/**
 * A brief confirmation that floats above the screen and dismisses itself.
 *
 * Used for "the entry was saved" — not for anything the user must act on. A
 * failure that needs a decision belongs in a Banner attached to the field it
 * is about, where it stays put.
 */
export function Toast({ message, tone = 'success', onHide, durationMs = 2600 }: ToastProps) {
  const insets = useSafeAreaInsets();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return undefined;

    Animated.timing(progress, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    const timer = setTimeout(() => {
      Animated.timing(progress, { toValue: 0, duration: 180, useNativeDriver: true }).start(({ finished }) => {
        if (finished) onHide();
      });
    }, durationMs);

    return () => clearTimeout(timer);
  }, [message, durationMs, onHide, progress]);

  if (!message) return null;

  const { bg, Icon } = TONE[tone];

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        styles.wrap,
        { bottom: insets.bottom + spacing.xl },
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}
    >
      <View style={[styles.toast, { backgroundColor: bg }]}>
        <Icon size={18} color={colors.onPrimary} strokeWidth={ICON_STROKE} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    maxWidth: '100%',
    ...shadow.raised,
  },
  text: { ...type.bodyStrong, color: colors.onPrimary, flexShrink: 1 },
});
