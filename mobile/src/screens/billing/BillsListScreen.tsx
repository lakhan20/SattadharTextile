import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { History, Receipt } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { RangeBar } from '../../components/RangeBar';
import { Reveal } from '../../components/Reveal';
import { SkeletonRows } from '../../components/Skeleton';
import { billsApi } from '../../api/bills';
import type { Bill, BillsPage } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { formatMoney } from '../../utils/money';
import { BILL_PRESETS, rangeForPreset, type DateRange } from '../../utils/reportRange';
import type { BillingStackParamList } from '../../navigation/types';
import { BillModeBadge } from './BillModeBadge';

type Props = NativeStackScreenProps<BillingStackParamList, 'BillsList'>;

const PAGE_SIZE = 20;

/**
 * Opens on today.
 *
 * Nine times in ten this screen is opened to find a bill written minutes ago —
 * a customer is back at the counter, or a PDF needs re-sending. Loading the
 * whole history first put the newest bill behind a page of nothing relevant,
 * and on a shop with a few thousand bills it was a slow way to answer a
 * question about the last hour. Earlier bills are a chip away.
 */
export function BillsListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  const [range, setRange] = useState<DateRange>(() => rangeForPreset('TODAY'));
  const [items, setItems] = useState<Bill[]>([]);
  const [summary, setSummary] = useState<BillsPage['summary'] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  const loadFirstPage = useCallback(async () => {
    setFailure(null);
    try {
      const result = await billsApi.list({
        page: 1,
        pageSize: PAGE_SIZE,
        dateFrom: range.from,
        dateTo: range.to,
      });
      setItems(result.items);
      setSummary(result.summary);
      setPage(1);
      setHasMore(result.pagination.page < result.pagination.totalPages);
    } catch (error) {
      setFailure(readError(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range.from, range.to, readError]);

  // Changing the range is a new query, not a page — clear first so the old
  // day's bills never sit under the new day's heading.
  useEffect(() => {
    setLoading(true);
    setItems([]);
    setSummary(null);
    void loadFirstPage();
  }, [loadFirstPage]);

  // A bill created on the Billing tab should be here the moment the list is
  // opened — and it will be, because the default range is the day it was written.
  useFocusEffect(
    useCallback(() => {
      void loadFirstPage();
    }, [loadFirstPage]),
  );

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await billsApi.list({
        page: nextPage,
        pageSize: PAGE_SIZE,
        dateFrom: range.from,
        dateTo: range.to,
      });
      setItems((prev) => [...prev, ...result.items]);
      setPage(nextPage);
      setHasMore(result.pagination.page < result.pagination.totalPages);
    } catch {
      // The page already on screen stays usable; the next pull-to-refresh retries.
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('bills.title')}
        onBack={() => navigation.goBack()}
        // "Who has been rewriting bills" is a supervision question, so the way
        // in exists for an owner only — and the route is not even registered
        // for anyone else.
        right={
          isAdmin ? (
            <Pressable
              onPress={() => navigation.navigate('BillEditLog')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('bills.editLog')}
              style={styles.logButton}
            >
              <History size={18} color={colors.primary} strokeWidth={ICON_STROKE} />
            </Pressable>
          ) : undefined
        }
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void loadFirstPage();
        }}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <RangeBar value={range} onChange={setRange} presets={BILL_PRESETS} />

            {failure ? (
              <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
            ) : null}

            {/* Totals for the whole range, not the page — so this stays true
                as the list is scrolled and more bills load in. */}
            {summary && summary.billCount > 0 ? (
              <Card style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <View>
                    <Text style={styles.summaryLabel}>{t('bills.rangeTotal')}</Text>
                    <Text style={styles.summaryValue}>₹{formatMoney(summary.grandTotal)}</Text>
                  </View>
                  <View style={styles.summaryRight}>
                    <Text style={styles.summaryCount}>
                      {t('bills.itemCountBills', { count: summary.billCount })}
                    </Text>
                    {summary.dueTotal > 0 ? (
                      <Text style={styles.summaryDue}>
                        {t('bills.dueInRange', { amount: formatMoney(summary.dueTotal) })}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </Card>
            ) : null}

            {/* The server filters to the caller's own bills for STAFF; this
                only makes that visible rather than enforcing it. */}
            {isAdmin ? null : <Text style={styles.ownOnly}>{t('bills.ownOnlyNote')}</Text>}
          </View>
        }
        ListFooterComponent={
          // Paging keeps the spinner: the rows above are already real, so a
          // skeleton here would imply the list is reloading from scratch.
          loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={colors.primary} /> : null
        }
        ListEmptyComponent={
          loading ? (
            <SkeletonRows count={6} />
          ) : failure ? null : (
            <EmptyState
              icon={<Receipt size={28} color={colors.primary} strokeWidth={ICON_STROKE} />}
              title={t('bills.emptyInRangeTitle')}
              // Naming the way out matters more than naming the problem: an
              // empty "today" is normal at 10am and says nothing is wrong.
              body={t('bills.emptyInRangeBody')}
            />
          )
        }
        renderItem={({ item, index }) => (
          <Reveal index={index}>
            <Card onPress={() => navigation.navigate('BillDetail', { billId: item.id })} style={styles.row}>
              <View style={styles.rowContent}>
                <View style={styles.rowText}>
                  <View style={styles.rowTitleLine}>
                    <Text style={styles.billNumber}>{item.billNumber}</Text>
                    <BillModeBadge mode={item.billingMode} />
                    {/* Visible in the list, not only once opened — the point
                        of the log is that an edit is easy to notice. */}
                    {item.revisionCount > 0 ? (
                      <View style={styles.revisedChip}>
                        <Text style={styles.revisedChipText}>
                          {t('bills.revisedBadge', { count: item.revisionCount })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.customerNameSnapshot ?? t('billing.walkIn')}
                  </Text>
                  <Text style={styles.rowDate}>
                    {new Date(item.billDate).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <View style={styles.rowAmounts}>
                  <Text style={styles.rowTotal}>₹{formatMoney(item.grandTotal)}</Text>
                  {item.dueAmount > 0 ? (
                    <Text style={styles.rowDue}>{t('bills.dueShort', { amount: formatMoney(item.dueAmount) })}</Text>
                  ) : null}
                </View>
              </View>
            </Card>
          </Reveal>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  headerBlock: { gap: spacing.md },
  ownOnly: { ...type.small, color: colors.muted },
  footerSpinner: { marginVertical: spacing.lg },
  logButton: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryCard: { paddingVertical: spacing.md },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  summaryLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  summaryValue: { ...type.kpiSmall, color: colors.primary, marginTop: 2 },
  summaryRight: { alignItems: 'flex-end', gap: 2 },
  summaryCount: { ...type.small, color: colors.muted, ...tabularNumbers },
  summaryDue: { ...type.caption, color: colors.danger, ...tabularNumbers },

  row: { paddingVertical: spacing.lg },
  rowContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  billNumber: { ...type.bodyStrong, color: colors.text, ...tabularNumbers },
  rowSub: { ...type.small, color: colors.muted },
  rowDate: { ...type.caption, color: colors.faint, ...tabularNumbers },
  rowAmounts: { alignItems: 'flex-end', gap: 2 },
  rowTotal: { ...type.kpiSmall, color: colors.primary },
  rowDue: { ...type.caption, color: colors.danger, ...tabularNumbers },
  revisedChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.warningSoft,
  },
  revisedChipText: { ...type.caption, color: colors.warningInk },
});
