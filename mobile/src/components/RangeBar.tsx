import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { CalendarRange, X } from 'lucide-react-native';
import { Button } from './Button';
import { Chip } from './Chip';
import { TextField } from './TextField';
import { ICON_STROKE, TAP_TARGET, colors, radius, shadow, spacing, type } from '../theme';
import {
  REPORT_PRESETS,
  detectPreset,
  formatRange,
  parseDateKey,
  rangeForPreset,
  type ConcretePreset,
  type DateRange,
} from '../utils/reportRange';

interface RangeBarProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Which quick chips to offer. Reports and the bills list want different ones. */
  presets?: ConcretePreset[];
}

const PRESET_LABELS: Record<ConcretePreset, string> = {
  TODAY: 'reports.presetToday',
  YESTERDAY: 'reports.presetYesterday',
  THIS_WEEK: 'reports.presetWeek',
  THIS_MONTH: 'reports.presetMonth',
  THIS_FY: 'reports.presetFy',
};

/**
 * Quick presets plus a custom range.
 *
 * There is no date-picker dependency in this project, and adding one for two
 * fields would be a native module and a rebuild. Two typed `YYYY-MM-DD` fields
 * are honest about the format the API takes, validate before they close, and —
 * for a shop that reaches for "This month" nine times in ten — sit behind the
 * presets rather than in front of them.
 */
export function RangeBar({ value, onChange, presets = REPORT_PRESETS }: RangeBarProps) {
  const { t } = useTranslation();
  const [customOpen, setCustomOpen] = useState(false);
  const active = detectPreset(value, presets);

  return (
    <View style={styles.wrap}>
      <View style={styles.chipRow}>
        {presets.map((preset) => (
          <Chip
            key={preset}
            label={t(PRESET_LABELS[preset])}
            active={active === preset}
            onPress={() => onChange(rangeForPreset(preset))}
          />
        ))}
        <Chip label={t('reports.presetCustom')} active={active === 'CUSTOM'} onPress={() => setCustomOpen(true)} />
      </View>

      <Pressable
        onPress={() => setCustomOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t('reports.changeRange')}
        style={({ pressed }) => [styles.readout, pressed && styles.pressed]}
      >
        <CalendarRange size={15} color={colors.muted} strokeWidth={ICON_STROKE} />
        <Text style={styles.readoutText}>{formatRange(value)}</Text>
      </Pressable>

      <CustomRangeSheet
        visible={customOpen}
        value={value}
        onClose={() => setCustomOpen(false)}
        onApply={(range) => {
          onChange(range);
          setCustomOpen(false);
        }}
      />
    </View>
  );
}

function CustomRangeSheet({
  visible,
  value,
  onClose,
  onApply,
}: {
  visible: boolean;
  value: DateRange;
  onClose: () => void;
  onApply: (range: DateRange) => void;
}) {
  const { t } = useTranslation();
  const [from, setFrom] = useState(value.from);
  const [to, setTo] = useState(value.to);
  const [error, setError] = useState<string | null>(null);

  // Reopening after a preset was chosen elsewhere should show that range,
  // not whatever was last typed here.
  useEffect(() => {
    if (visible) {
      setFrom(value.from);
      setTo(value.to);
      setError(null);
    }
  }, [visible, value.from, value.to]);

  function apply(): void {
    const parsedFrom = parseDateKey(from);
    const parsedTo = parseDateKey(to);
    if (!parsedFrom || !parsedTo) {
      setError(t('reports.invalidDate'));
      return;
    }
    if (parsedFrom > parsedTo) {
      setError(t('reports.rangeBackwards'));
      return;
    }
    onApply({ from, to });
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} />
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>{t('reports.customRange')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <X size={20} color={colors.muted} strokeWidth={ICON_STROKE} />
          </Pressable>
        </View>

        <TextField
          label={t('reports.fromDate')}
          value={from}
          onChangeText={(text) => {
            setFrom(text);
            setError(null);
          }}
          placeholder="2026-08-01"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
        />
        <TextField
          label={t('reports.toDate')}
          value={to}
          onChangeText={(text) => {
            setTo(text);
            setError(null);
          }}
          placeholder="2026-08-31"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          error={error ?? undefined}
        />

        <Text style={styles.hint}>{t('reports.dateHint')}</Text>

        <Button label={t('reports.applyRange')} onPress={apply} variant="primary" />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  readout: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 24 },
  readoutText: { ...type.small, color: colors.muted },
  pressed: { opacity: 0.6 },

  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.raised,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TAP_TARGET - 12,
  },
  sheetTitle: { ...type.h3, color: colors.text },
  hint: { ...type.caption, color: colors.muted, marginTop: -spacing.sm },
});
