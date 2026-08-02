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
import type { Bill } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, colors, spacing, tabularNumbers, type } from '../../theme';
import { formatMoney } from '../../utils/money';
import type { BillingStackParamList } from '../../navigation/types';
import { BillModeBadge } from './BillModeBadge';

type Props = NativeStackScreenProps<BillingStackParamList, 'BillsList'>;

const PAGE_SIZE = 20;

export function BillsListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  const [items, setItems] = useState<Bill[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  const loadFirstPage = useCallback(async () => {
    setFailure(null);
    try {
      const result = await billsApi.list({ page: 1, pageSize: PAGE_SIZE });
      setItems(result.items);
      setPage(1);
      setHasMore(result.pagination.page < result.pagination.totalPages);
    } catch (error) {
      setFailure(readError(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [readError]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  // A bill created on the Billing tab should be here the moment the list is opened.
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
      const result = await billsApi.list({ page: nextPage, pageSize: PAGE_SIZE });
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
      <AppHeader title={t('bills.title')} onBack={() => navigation.goBack()} />

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
              title={t('bills.emptyTitle')}
              body={t(isAdmin ? 'bills.emptyBodyAdmin' : 'bills.emptyBodyStaff')}
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
                  </View>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {item.customerNameSnapshot ?? t('billing.walkIn')}
                  </Text>
                  <Text style={styles.rowDate}>{new Date(item.billDate).toLocaleDateString('en-IN')}</Text>
                </View>
                <Text style={styles.rowTotal}>₹{formatMoney(item.grandTotal)}</Text>
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

  row: { paddingVertical: spacing.lg },
  rowContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  billNumber: { ...type.bodyStrong, color: colors.text, ...tabularNumbers },
  rowSub: { ...type.small, color: colors.muted },
  rowDate: { ...type.caption, color: colors.faint, ...tabularNumbers },
  rowTotal: { ...type.kpiSmall, color: colors.primary },
});
