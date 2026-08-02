import { Pressable, StyleSheet, Text } from 'react-native';
import { TAP_TARGET, colors, radius, spacing, type } from '../theme';

interface ChipProps {
  label: string;
  active?: boolean;
  onPress: () => void;
}

/**
 * Category filter chip. Gold-when-active is an explicit exception to "gold is
 * the single primary action" — this is a filter row, not a screen action.
 */
export function Chip({ label, active = false, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        active ? styles.active : styles.inactive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, active && styles.activeLabel]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: TAP_TARGET - 12,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    borderWidth: 1,
  },
  active: { backgroundColor: colors.accent, borderColor: colors.accent },
  inactive: { backgroundColor: colors.surface, borderColor: colors.border },
  pressed: { opacity: 0.8 },
  label: { ...type.smallStrong, color: colors.text },
  activeLabel: { color: '#FFFFFF' },
});
