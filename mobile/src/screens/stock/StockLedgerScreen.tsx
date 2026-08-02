import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { History, Package } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { productsApi } from '../../api/products';
import { stockApi } from '../../api/stock';
import type { Product, StockMovement } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useAuthStore, useHasPermission } from '../../store/authStore';
import { ICON_STROKE, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import type { StockStackParamList } from '../../navigation/types';
import { MOVEMENT_TONE, useStockFormat } from './stockFormat';

type Props = NativeStackScreenProps<StockStackParamList, 'StockLedger'>;

const PAGE_SIZE = 20;

/** "1 Aug 2026, 4:12 pm" — the ledger is read by date, not by timestamp. */
function formatMoment(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString(
    'en-IN',
    { hour: 'numeric', minute: '2-digit' },
  )}`;
}

export function StockLedgerScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const { formatStock, formatSigned } = useStockFormat();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const canStockIn = useHasPermission('stock.in');
  const canAdjust = useHasPermission('stock.adjust');

  const { productId, productName } = route.params;

  const [product, setProduct] = useState<Product | null>(null);
  const [items, setItems] = useState<StockMovement[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setFailure(null);
      try {
        const [movements, fetchedProduct] = await Promise.all([
          stockApi.movements({ productId, page: 1, pageSize: PAGE_SIZE }),
          productsApi.get(productId).catch(() => null),
        ]);
        setItems(movements.items);
        setPage(1);
        setHasMore(movements.pagination.page < movements.pagination.totalPages);
        if (fetchedProduct) setProduct(fetchedProduct);
      } catch (error) {
        setFailure(readError(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [productId, readError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await stockApi.movements({ productId, page: nextPage, pageSize: PAGE_SIZE });
      setItems((prev) => [...prev, ...result.items]);
      setPage(nextPage);
      setHasMore(result.pagination.page < result.pagination.totalPages);
    } catch {
      // What is already on screen stays usable.
    } finally {
      setLoadingMore(false);
    }
  }

  const title = product?.name ?? productName ?? t('stock.ledgerTitle');

  return (
    <View style={styles.root}>
      <AppHeader title={title} subtitle={t('stock.ledgerTitle')} onBack={() => navigation.goBack()} />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load({ silent: true });
        }}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {product ? (
              <Card tone={product.currentStock <= product.reorderLevel ? 'warning' : 'default'}>
                <Text style={styles.balanceLabel}>{t('stock.currentBalance')}</Text>
                <Text style={styles.balanceValue}>{formatStock(product.currentStock, product.unit)}</Text>
                <Text style={styles.balanceCaption}>
                  {t('stock.reorderAt', { level: formatStock(product.reorderLevel, product.unit) })}
                </Text>

                {canStockIn || canAdjust ? (
                  <View style={styles.actionRow}>
                    {canStockIn ? (
                      <Button
                        label={t('stock.stockIn')}
                        onPress={() => navigation.navigate('StockIn', { productId })}
                        variant="outline"
                        size="small"
                        fullWidth={false}
                      />
                    ) : null}
                    {canAdjust ? (
                      <Button
                        label={t('stock.adjust')}
                        onPress={() => navigation.navigate('StockAdjust', { productId })}
                        variant="ghost"
                        size="small"
                        fullWidth={false}
                      />
                    ) : null}
                  </View>
                ) : null}
              </Card>
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
              icon={<History size={28} color={colors.primary} strokeWidth={ICON_STROKE} />}
              title={t('stock.ledgerEmptyTitle')}
              body={t('stock.ledgerEmptyBody')}
            />
          )
        }
        renderItem={({ item }) => {
          const tone = MOVEMENT_TONE[item.type];
          const inward = item.qty > 0;
          return (
            <Card style={styles.row}>
              <View style={styles.rowTop}>
                <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.badgeText, { color: tone.fg }]}>{t(tone.labelKey)}</Text>
                </View>
                <Text style={[styles.qty, inward ? styles.qtyIn : styles.qtyOut]}>
                  {formatSigned(item.qty, item.unit)}
                </Text>
              </View>

              {item.reason ? (
                <Text style={styles.reason} numberOfLines={2}>
                  {item.reason}
                </Text>
              ) : null}

              {item.billNumber ? (
                <View style={styles.metaRow}>
                  <Package size={12} color={colors.muted} strokeWidth={ICON_STROKE} />
                  <Text style={styles.meta}>{t('stock.againstBill', { number: item.billNumber })}</Text>
                </View>
              ) : null}

              {item.supplierRef ? (
                <Text style={styles.meta}>{t('stock.supplierRefValue', { ref: item.supplierRef })}</Text>
              ) : null}

              <View style={styles.rowBottom}>
                <Text style={styles.moment}>
                  {formatMoment(item.createdAt)}
                  {item.createdByName ? ` · ${item.createdByName}` : ''}
                </Text>
                <Text style={styles.balanceAfter}>
                  {t('stock.balanceAfter')} {formatStock(item.balanceAfter, item.unit)}
                </Text>
              </View>

              {/* Landed rate is cost data — the server omits it entirely for a
                  STAFF token, so this row simply never renders for them. */}
              {isAdmin && item.rate !== undefined && item.rate > 0 ? (
                <Text style={styles.rate}>{t('stock.rateValue', { rate: item.rate.toFixed(2) })}</Text>
              ) : null}
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

  balanceLabel: { ...type.label, color: colors.muted, textTransform: 'uppercase' },
  balanceValue: { ...type.kpi, color: colors.text, marginTop: spacing.xs },
  balanceCaption: { ...type.small, color: colors.muted, marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },

  spinner: { marginTop: spacing.xxxl },
  footerSpinner: { marginVertical: spacing.lg },

  row: { marginBottom: spacing.sm, gap: spacing.xs },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  badge: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { ...type.caption, textTransform: 'uppercase' },
  qty: { ...type.kpiSmall, ...tabularNumbers },
  qtyIn: { color: colors.successInk },
  qtyOut: { color: colors.primaryInk },

  reason: { ...type.body, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { ...type.small, color: colors.muted },

  rowBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  moment: { ...type.caption, color: colors.muted, flexShrink: 1 },
  balanceAfter: { ...type.smallStrong, color: colors.text, ...tabularNumbers },
  rate: { ...type.caption, color: colors.muted, ...tabularNumbers },
});
