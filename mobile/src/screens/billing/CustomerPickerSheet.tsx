import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Search, UserRound, X } from 'lucide-react-native';
import { TextField } from '../../components/TextField';
import { customersApi } from '../../api/customers';
import type { Customer } from '../../api/types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, type } from '../../theme';

interface CustomerPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** `null` selects the walk-in path. */
  onSelect: (customer: Customer | null) => void;
}

export function CustomerPickerSheet({ visible, onClose, onSelect }: CustomerPickerSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const result = await customersApi.list({
          search: debounced.trim() || undefined,
          isActive: true,
          pageSize: 50,
        });
        if (!cancelled) setItems(result.items);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, debounced]);

  useEffect(() => {
    if (!visible) setSearch('');
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>{t('billing.choose')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <X size={22} color={colors.muted} strokeWidth={ICON_STROKE} />
          </Pressable>
        </View>

        <TextField
          label=""
          value={search}
          onChangeText={setSearch}
          placeholder={t('billing.searchCustomer')}
          leftIcon={<Search size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.searchField}
        />

        <Pressable
          onPress={() => {
            onSelect(null);
            onClose();
          }}
          style={({ pressed }) => [styles.walkInRow, pressed && styles.rowPressed]}
          accessibilityRole="button"
        >
          <View style={styles.walkInIcon}>
            <UserRound size={18} color={colors.primary} strokeWidth={ICON_STROKE} />
          </View>
          <Text style={styles.walkInLabel}>{t('billing.walkIn')}</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator style={styles.spinner} color={colors.primary} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>{t('billing.noCustomers')}</Text>}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                accessibilityRole="button"
              >
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.phone} · {item.state}
                  </Text>
                </View>
                {item.type === 'WHOLESALE' ? (
                  <View style={styles.typeChip}>
                    <Text style={styles.typeChipText}>{t('billing.wholesale')}</Text>
                  </View>
                ) : null}
              </Pressable>
            )}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    maxHeight: '82%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { ...type.h3, color: colors.text },
  searchField: { marginBottom: spacing.sm },
  spinner: { marginVertical: spacing.xxl },
  /**
   * `flexShrink: 1`, NOT `flex: 1` — the sheet is bounded only by `maxHeight`,
   * so its height comes from its content, and `flex: 1`'s implied
   * `flexBasis: 0%` collapses the list to zero height. Shrink-only lets a long
   * customer list scroll inside the cap without a short one padding the sheet
   * out. See the same note in `components/SelectField.tsx`.
   */
  list: { flexShrink: 1 },

  walkInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP_TARGET,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  walkInIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walkInLabel: { ...type.bodyStrong, color: colors.text },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: TAP_TARGET,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.background },
  rowText: { flexShrink: 1 },
  rowName: { ...type.body, color: colors.text },
  rowSub: { ...type.small, color: colors.muted, marginTop: 1 },
  typeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  typeChipText: { ...type.caption, color: colors.primary },
  empty: { ...type.body, color: colors.muted, textAlign: 'center', paddingVertical: spacing.xl },
});
