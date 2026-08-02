import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TAP_TARGET, TRACK_INSET, colors, radius, spacing, type } from '../theme';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
}

/** Two- or three-way choice, e.g. unit METER/PIECE — not a filter, so no accent. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.smallStrong, color: colors.text, marginBottom: spacing.sm },
  track: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    padding: TRACK_INSET,
    gap: TRACK_INSET,
  },
  segment: {
    flex: 1,
    minHeight: TAP_TARGET - 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.input - TRACK_INSET,
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentLabel: { ...type.smallStrong, color: colors.muted },
  segmentLabelActive: { color: colors.onPrimary },
});
