import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowDownToLine, Package, Search, SlidersHorizontal, TriangleAlert } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Chip } from '../../components/Chip';
import { EmptyState } from '../../components/EmptyState';
import { TextField } from '../../components/TextField';
import { productsApi } from '../../api/products';
import { stockApi } from '../../api/stock';
import { resolveMediaUrl } from '../../api/config';
import type { StockValuation, Unit } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuthStore, useHasPermission } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { ICON_STROKE, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { formatRupees } from '../../utils/money';
import type { StockStackParamList } from '../../navigation/types';
import { useStockFormat } from './stockFormat';

type Props = NativeStackScreenProps<StockStackParamList, 'StockOverview'>;

const PAGE_SIZE = 20;

/** The shape both `/products` and `/stock/low` rows collapse to for this list. */
interface ShelfRow {
  id: string;
  name: string;
  sku: string;
  unit: Unit;
  imageUrl: string | null;
  currentStock: number;
  reorderLevel: number;
}

type Filter = 'all' | 'low';

export function StockOverviewScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const { formatStock } = useStockFormat();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const canStockIn = useHasPermission('stock.in');
  const canAdjust = useHasPermission('stock.adjust');
  const baseUrl = useSettingsStore((s) => s.baseUrl);

  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);

  const [items, setItems] = useState<ShelfRow[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [lowCount, setLowCount] = useState<number | null>(null);
  const [valuation, setValuation] = useState<StockValuation | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  const fetchPage = useCallback(
    async (pageNumber: number): Promise<{ rows: ShelfRow[]; more: boolean }> => {
      const query = debouncedSearch.trim() || undefined;

      if (filter === 'low') {
        const result = await stockApi.low({ search: query, page: pageNumber, pageSize: PAGE_SIZE });
        return {
          rows: result.items.map((item) => ({
            id: item.id,
            name: item.name,
            sku: item.sku,
            unit: item.unit,
            imageUrl: item.imageUrl,
            currentStock: item.currentStock,
            reorderLevel: item.reorderLevel,
          })),
          more: result.pagination.page < result.pagination.totalPages,
        };
      }

      const result = await productsApi.list({ search: query, page: pageNumber, pageSize: PAGE_SIZE });
      return {
        rows: result.items.map((item) => ({
          id: item.id,
          name: item.name,
          sku: item.sku,
          unit: item.unit,
          imageUrl: item.imageUrl,
          currentStock: item.currentStock,
          reorderLevel: item.reorderLevel,
        })),
        more: result.pagination.page < result.pagination.totalPages,
      };
    },
    [filter, debouncedSearch],
  );

  const loadFirstPage = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setFailure(null);
      try {
        const { rows, more } = await fetchPage(1);
        setItems(rows);
        setPage(1);
        setHasMore(more);
      } catch (error) {
        setFailure(readError(error));
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetchPage, readError],
  );

  /** The low-stock count and the valuation head the screen, so both refresh together. */
  const loadSummary = useCallback(async () => {
    try {
      const low = await stockApi.low({ pageSize: 1 });
      setLowCount(low.pagination.total);
    } catch {
      // A missing count only costs the chip its number — the list still works.
    }
    if (!isAdmin) return;
    try {
      setValuation(await stockApi.valuation());
    } catch {
      // Valuation is ADMIN-only and non-essential to the shelf list.
    }
  }, [isAdmin]);

  /**
   * The only fetch trigger on this screen — it fires on mount, whenever the
   * filter or the search changes, and again on every return from a stock-in or
   * an adjustment, so a balance changed one screen away is never stale. A
   * separate mount effect would have doubled every request.
   */
  useFocusEffect(
    useCallback(() => {
      void loadSummary();
      void loadFirstPage({ silent: true });
    }, [loadSummary, loadFirstPage]),
  );

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const { rows, more } = await fetchPage(nextPage);
      setItems((prev) => [...prev, ...rows]);
      setPage(nextPage);
      setHasMore(more);
    } catch {
      // A failed "load more" stops there; what is already on screen stays usable.
    } finally {
      setLoadingMore(false);
    }
  }

  /**
   * Low stock floats to the top of the page that is loaded. The server already
   * returns the low-stock filter in worst-shortfall order; this only reorders
   * the mixed "all products" view, and is stable so everything else keeps the
   * alphabetical order the products endpoint gave it.
   */
  const sortedItems = useMemo(() => {
    const isLow = (row: ShelfRow) => row.currentStock <= row.reorderLevel;
    return [...items].sort((a, b) => Number(isLow(b)) - Number(isLow(a)));
  }, [items]);

  const hasQuery = debouncedSearch.trim().length > 0;

  return (
    <View style={styles.root}>
      <AppHeader title={t('stock.title')} onBack={() => navigation.goBack()} />

      <FlatList
        data={sortedItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void loadSummary();
          void loadFirstPage({ silent: true });
        }}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {/* Valuation is built on cost price — ADMIN only, and never fetched
                for a STAFF session at all. */}
            {isAdmin ? (
              <Card style={styles.valuationCard}>
                <Text style={styles.valuationLabel}>{t('stock.valuationTitle')}</Text>
                <Text style={styles.valuationValue}>
                  {valuation ? formatRupees(valuation.costValue) : '—'}
                </Text>
                <Text style={styles.valuationCaption}>
                  {valuation
                    ? t('stock.valuationCaption', {
                        products: valuation.productCount,
                        retail: formatRupees(valuation.retailValue),
                      })
                    : t('stock.valuationLoading')}
                </Text>
              </Card>
            ) : null}

            {canStockIn || canAdjust ? (
              <View style={styles.actionRow}>
                {canStockIn ? (
                  <Button
                    label={t('stock.stockIn')}
                    onPress={() => navigation.navigate('StockIn')}
                    variant="accent"
                    icon={<ArrowDownToLine size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
                    style={styles.actionButton}
                    fullWidth={false}
                  />
                ) : null}
                {canAdjust ? (
                  <Button
                    label={t('stock.adjust')}
                    onPress={() => navigation.navigate('StockAdjust')}
                    variant="outline"
                    icon={<SlidersHorizontal size={18} color={colors.primary} strokeWidth={ICON_STROKE} />}
                    style={styles.actionButton}
                    fullWidth={false}
                  />
                ) : null}
              </View>
            ) : (
              <Banner tone="info" title={t('stock.readOnlyTitle')} body={t('stock.readOnlyBody')} />
            )}

            <TextField
              label=""
              value={search}
              onChangeText={setSearch}
              placeholder={t('products.searchPlaceholder')}
              leftIcon={<Search size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.chipRow}>
              <Chip label={t('stock.filterAll')} active={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip
                label={
                  lowCount === null
                    ? t('stock.filterLow')
                    : t('stock.filterLowCount', { count: lowCount })
                }
                active={filter === 'low'}
                onPress={() => setFilter('low')}
              />
            </View>

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
              title={
                hasQuery
                  ? t('common.noResults')
                  : filter === 'low'
                    ? t('stock.emptyLowTitle')
                    : t('stock.emptyTitle')
              }
              body={hasQuery ? undefined : filter === 'low' ? t('stock.emptyLowBody') : t('stock.emptyBody')}
            />
          )
        }
        renderItem={({ item }) => {
          const low = item.currentStock <= item.reorderLevel;
          const out = item.currentStock <= 0;
          const imageUri = resolveMediaUrl(item.imageUrl, baseUrl);
          return (
            <Card
              onPress={() => navigation.navigate('StockLedger', { productId: item.id, productName: item.name })}
              tone={out ? 'danger' : low ? 'warning' : 'default'}
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
                    {item.sku}
                  </Text>
                  {low ? (
                    <View style={styles.lowRow}>
                      <TriangleAlert
                        size={12}
                        color={out ? colors.danger : colors.warning}
                        strokeWidth={ICON_STROKE}
                      />
                      <Text style={[styles.lowText, out && styles.outText]}>
                        {out
                          ? t('stock.outOfStock')
                          : t('stock.belowReorder', { level: formatStock(item.reorderLevel, item.unit) })}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.rowRight}>
                  <Text style={[styles.stockValue, low && styles.stockValueLow, out && styles.stockValueOut]}>
                    {formatStock(item.currentStock, item.unit)}
                  </Text>
                  <Text style={styles.stockCaption}>{t('stock.inStockLabel')}</Text>
                </View>
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md, flexGrow: 1 },
  headerBlock: { marginBottom: spacing.md, gap: spacing.md },

  valuationCard: { backgroundColor: colors.primary, borderColor: colors.primary },
  valuationLabel: { ...type.label, color: colors.onPrimaryMuted, textTransform: 'uppercase' },
  valuationValue: { ...type.kpi, color: colors.onPrimary, marginTop: spacing.xs },
  valuationCaption: { ...type.small, color: colors.onPrimaryMuted, marginTop: 2 },

  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionButton: { flexGrow: 1, flexBasis: 0 },

  chipRow: { flexDirection: 'row', gap: spacing.sm },
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
  lowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  lowText: { ...type.caption, color: colors.warningInk, flexShrink: 1 },
  outText: { color: colors.dangerInk },

  rowRight: { alignItems: 'flex-end' },
  stockValue: { ...type.kpiSmall, color: colors.text, ...tabularNumbers },
  stockValueLow: { color: colors.warningInk },
  stockValueOut: { color: colors.dangerInk },
  stockCaption: { ...type.caption, color: colors.muted },
});
