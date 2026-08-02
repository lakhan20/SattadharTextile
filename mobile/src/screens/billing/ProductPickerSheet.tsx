import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
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
import { Package, Search, X } from 'lucide-react-native';
import { TextField } from '../../components/TextField';
import { resolveMediaUrl } from '../../api/config';
import { productsApi } from '../../api/products';
import type { Product } from '../../api/types';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useSettingsStore } from '../../store/settingsStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { formatQty, formatRupees } from '../../utils/money';

interface ProductPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
  /** Wholesale customers see the wholesale rate in the row. */
  useWholesaleRate: boolean;
}

export function ProductPickerSheet({ visible, onClose, onSelect, useWholesaleRate }: ProductPickerSheetProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const baseUrl = useSettingsStore((s) => s.baseUrl);

  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const result = await productsApi.list({
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
          <Text style={styles.title}>{t('billing.addProduct')}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <X size={22} color={colors.muted} strokeWidth={ICON_STROKE} />
          </Pressable>
        </View>

        <TextField
          label=""
          value={search}
          onChangeText={setSearch}
          placeholder={t('billing.searchProduct')}
          leftIcon={<Search size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
          autoCapitalize="none"
          autoCorrect={false}
          containerStyle={styles.searchField}
        />

        {loading ? (
          <ActivityIndicator style={styles.spinner} color={colors.primary} />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            ListEmptyComponent={<Text style={styles.empty}>{t('billing.noProducts')}</Text>}
            renderItem={({ item }) => {
              const imageUri = resolveMediaUrl(item.imageUrl, baseUrl);
              const rate = useWholesaleRate ? item.wholesaleRate : item.retailRate;
              const soldOut = item.currentStock <= 0;
              return (
                <Pressable
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                  disabled={soldOut}
                  style={({ pressed }) => [styles.row, pressed && styles.rowPressed, soldOut && styles.rowDisabled]}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: soldOut }}
                >
                  {imageUri ? (
                    <Image source={{ uri: imageUri }} style={styles.thumb} />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Package size={18} color={colors.muted} strokeWidth={ICON_STROKE} />
                    </View>
                  )}

                  <View style={styles.rowText}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {item.sku} · {t(item.unit === 'METER' ? 'products.unitMeter' : 'products.unitPiece')}
                    </Text>
                  </View>

                  <View style={styles.rowRight}>
                    <Text style={styles.rowRate}>{formatRupees(rate)}</Text>
                    <Text style={[styles.rowStock, soldOut && styles.rowStockOut]}>
                      {soldOut ? t('billing.outOfStock') : t('billing.inStock', { qty: formatQty(item.currentStock) })}
                    </Text>
                  </View>
                </Pressable>
              );
            }}
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
   * `flexBasis: 0%` collapses the list to zero height. Shrink-only lets a large
   * catalogue scroll inside the cap without a two-product result padding the
   * sheet out. See the same note in `components/SelectField.tsx`.
   */
  list: { flexShrink: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP_TARGET + 8,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowPressed: { backgroundColor: colors.background },
  rowDisabled: { opacity: 0.45 },
  thumb: { width: 40, height: 40, borderRadius: radius.input, backgroundColor: colors.primarySoft },
  thumbPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: radius.input,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1 },
  rowName: { ...type.body, color: colors.text },
  rowSub: { ...type.small, color: colors.muted, marginTop: 1 },
  rowRight: { alignItems: 'flex-end' },
  rowRate: { ...type.money, color: colors.text },
  rowStock: { ...type.caption, color: colors.muted, marginTop: 2, ...tabularNumbers },
  rowStockOut: { color: colors.danger },
  empty: { ...type.body, color: colors.muted, textAlign: 'center', paddingVertical: spacing.xl },
});
