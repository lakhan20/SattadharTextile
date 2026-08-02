import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';
import { billsApi } from '../../api/bills';
import type { Bill } from '../../api/types';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { formatDay, formatRupees } from './khataFormat';

interface BillPickerSheetProps {
  visible: boolean;
  customerId: string;
  onClose: () => void;
  /** `null` clears the selection and falls back to oldest-first allocation. */
  onSelect: (bill: Bill | null) => void;
}

/**
 * Picks the bill a payment is being made against.
 *
 * Only bills with something still owed are offered — settling an already-paid
 * bill is not a thing anyone means to do, and the server would allocate the
 * money onward regardless. Choosing nothing is a first-class option, and the
 * common one: most customers hand over money against the khata as a whole.
 */
export function BillPickerSheet({ visible, customerId, onClose, onSelect }: BillPickerSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const result = await billsApi.list({ customerId, pageSize: 50 });
        if (!cancelled) setBills(result.items.filter((b) => b.dueAmount > 0 && b.status === 'FINAL'));
      } catch {
        if (!cancelled) setBills([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, customerId]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('khata.pickBill')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <X size={22} color={colors.muted} strokeWidth={ICON_STROKE} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => {
            onSelect(null);
            onClose();
          }}
          style={({ pressed }) => [styles.anyRow, pressed && styles.rowPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.anyLabel}>{t('khata.anyOpenBill')}</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator style={styles.spinner} color={colors.primary} />
        ) : (
          <FlatList
            data={bills}
            keyExtractor={(item) => item.id}
            style={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>{t('khata.noBillsYet')}</Text>}
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
                    {item.billNumber}
                  </Text>
                  <Text style={styles.rowSub}>{formatDay(item.billDate)}</Text>
                </View>
                <Text style={styles.due}>{formatRupees(item.dueAmount)}</Text>
              </Pressable>
            )}
          />
        )}
      </View>
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
    maxHeight: '76%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  title: { ...type.h3, color: colors.text },
  spinner: { marginVertical: spacing.xxl },
  // Shrink-only, not flex:1 — the sheet is bounded by maxHeight, so a
  // flexBasis of 0% would collapse the list. Same note as CustomerPickerSheet.
  list: { flexShrink: 1 },

  anyRow: {
    minHeight: TAP_TARGET,
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  anyLabel: { ...type.bodyStrong, color: colors.primary },

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
  due: { ...type.money, color: colors.danger, ...tabularNumbers },
  empty: { ...type.body, color: colors.muted, textAlign: 'center', paddingVertical: spacing.xl },
});
