import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Receipt } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { Reveal } from '../../components/Reveal';
import { SkeletonRows } from '../../components/Skeleton';
import { billsApi } from '../../api/bills';
import type { Bill, BillsPage } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useIsAdmin } from '../../store/authStore';
import { ICON_STROKE, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { formatMoney } from '../../utils/money';
import type { CustomersStackParamList } from '../../navigation/types';
import { BillModeBadge } from '../billing/BillModeBadge';

type Props = NativeStackScreenProps<CustomersStackParamList, 'CustomerBills'>;

const PAGE_SIZE = 20;

/**
 * Everything this customer has bought, newest first.
 *
 * No date filter, unlike the bills list: this screen is opened *because* the
 * question is historical — "what did we sell them last time", "when did they
 * last buy this". Defaulting to today would answer a question nobody asked.
 *
 * The bill detail is pushed onto this same stack, so back returns to the
 * customer rather than dropping the user into the Billing tab.
 */
export function CustomerBillsScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const isAdmin = useIsAdmin();
  const { customerId, customerName } = route.params;

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
      const result = await billsApi.list({ page: 1, pageSize: PAGE_SIZE, customerId });
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
  }, [customerId, readError]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  // An edit made through this stack should be reflected on return.
  useFocusEffect(
    useCallback(() => {
      void loadFirstPage();
    }, [loadFirstPage]),
  );

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const result = await billsApi.list({ page: next, pageSize: PAGE_SIZE, customerId });
      setItems((prev) => [...prev, ...result.items]);
      setPage(next);
      setHasMore(result.pagination.page < result.pagination.totalPages);
    } catch {
      // What is on screen stays usable; pull-to-refresh retries.
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('customers.billHistory')}
        subtitle={customerName}
        onBack={() => navigation.goBack()}
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
            {failure ? (
              <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
            ) : null}

            {summary && summary.billCount > 0 ? (
              <Card style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <View>
                    <Text style={styles.summaryLabel}>{t('customers.lifetimeValue')}</Text>
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

            {/* Worth saying plainly: a staff member is seeing a slice of this
                customer's history, not all of it, and might otherwise read a
                short list as "they have barely bought from us". */}
            {isAdmin ? null : <Text style={styles.ownOnly}>{t('customers.billsOwnOnly')}</Text>}
          </View>
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={colors.primary} /> : null
        }
        ListEmptyComponent={
          loading ? (
            <SkeletonRows count={5} />
          ) : failure ? null : (
            <EmptyState
              icon={<Receipt size={28} color={colors.primary} strokeWidth={ICON_STROKE} />}
              title={t('customers.noBillsTitle')}
              body={t(isAdmin ? 'customers.noBillsBody' : 'customers.noBillsBodyStaff')}
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
                    {item.revisionCount > 0 ? (
                      <View style={styles.revisedChip}>
                        <Text style={styles.revisedChipText}>
                          {t('bills.revisedBadge', { count: item.revisionCount })}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.rowDate}>
                    {new Date(item.billDate).toLocaleDateString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                    {item.itemCount ? ` · ${t('bills.itemCount', { count: item.itemCount })}` : ''}
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
  rowDate: { ...type.small, color: colors.muted, ...tabularNumbers },
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
