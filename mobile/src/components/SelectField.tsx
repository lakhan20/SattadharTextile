import { useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Search, X } from 'lucide-react-native';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, type } from '../theme';
import { TextField } from './TextField';

export interface SelectOption {
  value: string;
  label: string;
  /** Small line under the label — used to show a category under a sub-category. */
  hint?: string;
}

interface SelectFieldProps {
  label: string;
  value: string | null | undefined;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  /** Shows a "Clear" row so an optional field can be set back to none. */
  clearable?: boolean;
  onClear?: () => void;
  containerStyle?: StyleProp<ViewStyle>;
}

/** A tap-to-open list picker, styled to match TextField exactly. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder,
  error,
  disabled = false,
  clearable = false,
  onClear,
  containerStyle,
}: SelectFieldProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((option) => option.value === value);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const needle = query.trim().toLowerCase();
    return options.filter((option) => option.label.toLowerCase().includes(needle));
  }, [options, query]);

  function handleOpen() {
    if (disabled) return;
    setQuery('');
    setOpen(true);
  }

  function handleSelect(option: SelectOption) {
    onChange(option.value);
    setOpen(false);
  }

  const borderColor = error ? colors.danger : colors.border;

  return (
    <View style={containerStyle}>
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        style={[
          styles.field,
          { borderColor, opacity: disabled ? 0.55 : 1 },
        ]}
      >
        <Text style={[styles.value, !selected && styles.placeholder]} numberOfLines={1}>
          {selected ? selected.label : placeholder ?? t('common.select')}
        </Text>
        <ChevronDown size={18} color={colors.muted} strokeWidth={ICON_STROKE} />
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <Pressable onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <X size={22} color={colors.muted} strokeWidth={ICON_STROKE} />
            </Pressable>
          </View>

          <TextField
            label=""
            value={query}
            onChangeText={setQuery}
            placeholder={t('common.search')}
            leftIcon={<Search size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
            containerStyle={styles.searchField}
            autoCapitalize="none"
            autoCorrect={false}
          />

          {clearable && value ? (
            <Pressable
              onPress={() => {
                onClear?.();
                setOpen(false);
              }}
              style={styles.clearRow}
              accessibilityRole="button"
            >
              <Text style={styles.clearText}>{t('common.clearSelection')}</Text>
            </Pressable>
          ) : null}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item.value}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>{t('common.noResults')}</Text>}
            renderItem={({ item }) => {
              const isSelected = item.value === value;
              return (
                <Pressable
                  onPress={() => handleSelect(item)}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  accessibilityRole="button"
                >
                  <View style={styles.rowText}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    {item.hint ? <Text style={styles.rowHint}>{item.hint}</Text> : null}
                  </View>
                  {isSelected ? <Check size={18} color={colors.primary} strokeWidth={ICON_STROKE} /> : null}
                </Pressable>
              );
            }}
          />
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.smallStrong, color: colors.text, marginBottom: spacing.xs + 2 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TAP_TARGET,
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  value: { ...type.body, color: colors.text, flexShrink: 1 },
  placeholder: { color: colors.muted },
  error: { ...type.small, color: colors.danger, marginTop: spacing.xs + 2 },

  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: '80%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sheetTitle: { ...type.h3, color: colors.text },
  searchField: { marginBottom: spacing.sm },
  clearRow: { paddingVertical: spacing.md },
  clearText: { ...type.smallStrong, color: colors.danger },
  /**
   * `flexShrink: 1`, NOT `flex: 1`.
   *
   * The sheet is only bounded by `maxHeight`, so its height comes from its
   * content. `flex: 1` implies `flexBasis: 0%`, which contributes nothing to
   * that content height and leaves no free space to grow back into — the list
   * lays out at zero height and the sheet opens empty.
   *
   * Shrink-only keeps `flexBasis: auto`, so the list asks for its content
   * height and gives it back only when the sheet reaches `maxHeight`, which is
   * the point at which it starts scrolling. Short lists get a short sheet.
   */
  list: { flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TAP_TARGET,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.background },
  rowText: { flexShrink: 1 },
  rowLabel: { ...type.body, color: colors.text },
  rowHint: { ...type.small, color: colors.muted, marginTop: 1 },
  empty: { ...type.body, color: colors.muted, textAlign: 'center', paddingVertical: spacing.xl },
});
