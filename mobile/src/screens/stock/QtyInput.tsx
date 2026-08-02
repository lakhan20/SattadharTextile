import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Minus, Plus } from 'lucide-react-native';
import type { Unit } from '../../api/types';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';

interface QtyInputProps {
  label: string;
  unit: Unit;
  /** Held as a string so a half-typed "3." survives editing. */
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  hint?: string | undefined;
  disabled?: boolean;
}

/**
 * Unit-aware quantity entry.
 *
 * A METER product is measured off a bolt, so it takes decimals and a plain
 * field is the fastest way in. A PIECE product is counted one at a time, so it
 * gets a stepper — tapping + four times is quicker and less error-prone at a
 * counter than typing, and it makes a fractional piece unreachable rather than
 * merely invalid.
 */
export function QtyInput({ label, unit, value, onChange, error, hint, disabled = false }: QtyInputProps) {
  const { t } = useTranslation();
  const isPiece = unit === 'PIECE';

  function sanitise(next: string): string {
    if (isPiece) return next.replace(/[^0-9]/g, '');
    // One decimal point, at most three places after it.
    const cleaned = next.replace(/[^0-9.]/g, '');
    const [whole, ...rest] = cleaned.split('.');
    if (rest.length === 0) return whole ?? '';
    return `${whole ?? ''}.${rest.join('').slice(0, 3)}`;
  }

  function step(by: number) {
    const current = Number.parseInt(value || '0', 10);
    const next = Math.max(0, (Number.isNaN(current) ? 0 : current) + by);
    onChange(String(next));
  }

  const borderColor = error ? colors.danger : colors.border;

  return (
    <View>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.row}>
        {isPiece ? (
          <Pressable
            onPress={() => step(-1)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t('stock.decrease')}
            style={({ pressed }) => [styles.stepper, pressed && styles.stepperPressed, disabled && styles.dimmed]}
          >
            <Minus size={20} color={colors.primary} strokeWidth={ICON_STROKE} />
          </Pressable>
        ) : null}

        <View style={[styles.field, { borderColor, borderWidth: error ? 1.5 : 1 }, disabled && styles.dimmed]}>
          <TextInput
            value={value}
            onChangeText={(next) => onChange(sanitise(next))}
            editable={!disabled}
            keyboardType={isPiece ? 'number-pad' : Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
            placeholder="0"
            placeholderTextColor={colors.faint}
            accessibilityLabel={label}
            style={[styles.input, isPiece && styles.inputCentred]}
          />
          <Text style={styles.unit}>
            {unit === 'METER' ? t('stock.unitShortMeter') : t('stock.unitShortPiece')}
          </Text>
        </View>

        {isPiece ? (
          <Pressable
            onPress={() => step(1)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t('stock.increase')}
            style={({ pressed }) => [styles.stepper, pressed && styles.stepperPressed, disabled && styles.dimmed]}
          >
            <Plus size={20} color={colors.primary} strokeWidth={ICON_STROKE} />
          </Pressable>
        ) : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.smallStrong, color: colors.text, marginBottom: spacing.xs + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepper: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperPressed: { backgroundColor: colors.primarySoft },
  dimmed: { opacity: 0.5 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TAP_TARGET,
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...type.kpiSmall,
    color: colors.text,
    paddingVertical: spacing.sm,
    includeFontPadding: false,
    ...tabularNumbers,
  },
  inputCentred: { textAlign: 'center' },
  unit: { ...type.smallStrong, color: colors.muted },
  error: { ...type.small, color: colors.danger, marginTop: spacing.xs + 2 },
  hint: { ...type.small, color: colors.muted, marginTop: spacing.xs + 2 },
});
