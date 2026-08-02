import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Package, Plus, Search, Trash2, TriangleAlert } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { TextField } from '../../components/TextField';
import { categoriesApi } from '../../api/categories';
import { productsApi } from '../../api/products';
import { resolveMediaUrl } from '../../api/config';
import type { Category, Product } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuthStore, useHasPermission } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, shadow, spacing, tabularNumbers, type } from '../../theme';
import type { ProductsStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProductsStackParamList, 'ProductsList'>;

const PAGE_SIZE = 20;

export function ProductsListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const canCreate = useHasPermission('product.create');
  const canUpdate = useHasPermission('product.update');
  const baseUrl = useSettingsStore((s) => s.baseUrl);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const [items, setItems] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await categoriesApi.list({ pageSize: 100, isActive: true });
        setCategories(result.items);
      } catch {
        // Filter chips are a convenience — a failed fetch here should not block the product list.
      }
    })();
  }, []);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((c) => map.set(c.id, c.name));
    return map;
  }, [categories]);

  const loadFirstPage = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setFailure(null);
      try {
        const result = await productsApi.list({
          search: debouncedSearch.trim() || undefined,
          categoryId: categoryFilter ?? undefined,
          page: 1,
          pageSize: PAGE_SIZE,
        });
        setItems(result.items);
        setPage(1);
        setHasMore(result.pagination.page < result.pagination.totalPages);
      } catch (error) {
        setFailure(readError(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedSearch, categoryFilter, readError],
  );

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await productsApi.list({
        search: debouncedSearch.trim() || undefined,
        categoryId: categoryFilter ?? undefined,
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      setItems((prev) => [...prev, ...result.items]);
      setPage(nextPage);
      setHasMore(result.pagination.page < result.pagination.totalPages);
    } catch {
      // A failed "load more" just stops there; the list already on screen stays usable.
    } finally {
      setLoadingMore(false);
    }
  }

  function handleDelete(product: Product) {
    Alert.alert(t('products.deleteConfirmTitle'), t('products.deleteConfirmBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await productsApi.remove(product.id);
            setItems((prev) => prev.filter((p) => p.id !== product.id));
          } catch (error) {
            const readable = readError(error);
            Alert.alert(readable.title, readable.body);
          }
        },
      },
    ]);
  }

  const hasQuery = debouncedSearch.trim().length > 0 || categoryFilter !== null;

  return (
    <View style={styles.root}>
      <AppHeader title={t('products.title')} />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void loadFirstPage({ silent: true });
        }}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {isAdmin ? (
              <View style={styles.catalogRow}>
                <Button
                  label={t('products.categoriesLink')}
                  onPress={() => navigation.navigate('Categories')}
                  variant="outline"
                  size="small"
                  fullWidth={false}
                />
                <Button
                  label={t('products.subCategoriesLink')}
                  onPress={() => navigation.navigate('SubCategories')}
                  variant="outline"
                  size="small"
                  fullWidth={false}
                />
              </View>
            ) : null}

            <TextField
              label=""
              value={search}
              onChangeText={setSearch}
              placeholder={t('products.searchPlaceholder')}
              leftIcon={<Search size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {categories.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Chip label={t('products.all')} active={categoryFilter === null} onPress={() => setCategoryFilter(null)} />
                {categories.map((category) => (
                  <Chip
                    key={category.id}
                    label={category.name}
                    active={categoryFilter === category.id}
                    onPress={() => setCategoryFilter(category.id)}
                  />
                ))}
              </ScrollView>
            ) : null}

            {failure ? (
              <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
            ) : null}
          </View>
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={colors.primary} /> : null
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.spinner} color={colors.primary} />
          ) : failure ? null : (
            <EmptyState
              icon={<Package size={28} color={colors.primary} strokeWidth={ICON_STROKE} />}
              title={hasQuery ? t('common.noResults') : t(isAdmin || canCreate ? 'products.emptyTitleAdmin' : 'products.emptyTitleStaff')}
              body={hasQuery ? undefined : t(isAdmin || canCreate ? 'products.emptyBodyAdmin' : 'products.emptyBodyStaff')}
              actionLabel={!hasQuery && canCreate ? t('products.add') : undefined}
              onAction={!hasQuery && canCreate ? () => navigation.navigate('ProductForm') : undefined}
            />
          )
        }
        renderItem={({ item }) => {
          const lowStock = item.currentStock <= item.reorderLevel;
          const imageUri = resolveMediaUrl(item.imageUrl, baseUrl);
          const canEditThis = canUpdate;
          return (
            <Card
              onPress={canEditThis ? () => navigation.navigate('ProductForm', { productId: item.id }) : undefined}
              tone={lowStock ? 'warning' : 'default'}
              style={styles.row}
            >
              <View style={styles.rowContent}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.thumb} />
                ) : (
                  <View style={styles.thumbPlaceholder}>
                    <Package size={22} color={colors.muted} strokeWidth={ICON_STROKE} />
                  </View>
                )}

                <View style={styles.rowText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.sku} · {categoryNameById.get(item.categoryId) ?? '—'}
                  </Text>
                  <View style={styles.rowFooter}>
                    <Text style={styles.rowRate}>
                      ₹{item.retailRate.toFixed(2)} <Text style={styles.rowUnit}>/ {item.unit === 'METER' ? t('products.unitMeter') : t('products.unitPiece')}</Text>
                    </Text>
                    <View style={styles.stockChip}>
                      {lowStock ? <TriangleAlert size={12} color={colors.warning} strokeWidth={ICON_STROKE} /> : null}
                      <Text style={[styles.stockText, lowStock && styles.stockTextWarning]}>
                        {item.currentStock}
                      </Text>
                    </View>
                  </View>
                </View>

                {isAdmin ? (
                  <Pressable
                    onPress={() => handleDelete(item)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                    style={styles.deleteButton}
                  >
                    <Trash2 size={18} color={colors.danger} strokeWidth={ICON_STROKE} />
                  </Pressable>
                ) : null}
              </View>
            </Card>
          );
        }}
      />

      {canCreate ? (
        <Pressable
          onPress={() => navigation.navigate('ProductForm')}
          accessibilityRole="button"
          accessibilityLabel={t('products.add')}
          style={styles.fab}
        >
          <Plus size={24} color={colors.onAccent} strokeWidth={ICON_STROKE} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl * 2, gap: spacing.md, flexGrow: 1 },
  headerBlock: { marginBottom: spacing.md, gap: spacing.md },
  catalogRow: { flexDirection: 'row', gap: spacing.sm },
  chipRow: { gap: spacing.sm },
  spinner: { marginTop: spacing.xxxl },
  footerSpinner: { marginVertical: spacing.lg },

  row: { marginBottom: spacing.sm },
  rowContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  thumb: { width: 52, height: 52, borderRadius: radius.input, backgroundColor: colors.primarySoft },
  thumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: radius.input,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  rowSub: { ...type.small, color: colors.muted },
  rowFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  rowRate: { ...type.money, color: colors.text },
  rowUnit: { ...type.small, color: colors.muted },
  stockChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stockText: { ...type.smallStrong, color: colors.muted, ...tabularNumbers },
  stockTextWarning: { color: colors.warning },
  deleteButton: {
    width: TAP_TARGET - 12,
    height: TAP_TARGET - 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
});
