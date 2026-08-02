import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { History } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { EmptyState } from '../../components/EmptyState';
import { Reveal } from '../../components/Reveal';
import { SkeletonRows } from '../../components/Skeleton';
import { billsApi } from '../../api/bills';
import type { BillRevision } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useIsAdmin } from '../../store/authStore';
import { ICON_STROKE, colors, spacing, type } from '../../theme';
import type { BillRoutes, BillingStackParamList } from '../../navigation/types';
import { BillRevisionRow } from './BillRevisionRow';

/**
 * The edit log, in two guises.
 *
 * With a `billId` this is one bill's history, open to anyone who may already
 * open the bill. Without one it is the shop-wide log, which the server serves
 * to an owner alone — and which is registered in the ADMIN branch of the
 * navigator only, so a staff session has no route to it at all.
 */

type PerBillProps = NativeStackScreenProps<BillRoutes, 'BillRevisions'>;
type LogProps = NativeStackScreenProps<BillingStackParamList, 'BillEditLog'>;

const PAGE_SIZE = 20;

function RevisionsList({
  billId,
  title,
  subtitle,
  onBack,
  onOpenBill,
}: {
  billId?: string;
  title: string;
  subtitle?: string | undefined;
  onBack: () => void;
  onOpenBill?: (id: string) => void;
}) {
  const { t } = useTranslation();
  const readError = useApiError();
  const isAdmin = useIsAdmin();
  const shopWide = billId === undefined;

  const [items, setItems] = useState<BillRevision[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  const fetchPage = useCallback(
    (p: number) =>
      billId
        ? billsApi.revisions(billId, { page: p, pageSize: PAGE_SIZE })
        : billsApi.editLog({ page: p, pageSize: PAGE_SIZE }),
    [billId],
  );

  const loadFirstPage = useCallback(async () => {
    setFailure(null);
    try {
      const result = await fetchPage(1);
      setItems(result.items);
      setPage(1);
      setHasMore(result.pagination.page < result.pagination.totalPages);
    } catch (error) {
      setFailure(readError(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchPage, readError]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const result = await fetchPage(next);
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
      <AppHeader title={title} subtitle={subtitle} onBack={onBack} />

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
            {/* The server scopes a staff caller to their own edits. Saying so
                is honest about what this list is, rather than letting someone
                read an empty screen as "nobody has edited anything". */}
            {!isAdmin && !shopWide ? <Text style={styles.ownOnly}>{t('bills.revisionsOwnOnly')}</Text> : null}
          </View>
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={styles.footerSpinner} color={colors.primary} /> : null
        }
        ListEmptyComponent={
          loading ? (
            <SkeletonRows count={4} />
          ) : failure ? null : (
            <EmptyState
              icon={<History size={28} color={colors.primary} strokeWidth={ICON_STROKE} />}
              title={t(shopWide ? 'bills.editLogEmptyTitle' : 'bills.revisionsEmptyTitle')}
              body={t(shopWide ? 'bills.editLogEmptyBody' : 'bills.revisionsEmptyBody')}
            />
          )
        }
        renderItem={({ item, index }) => (
          <Reveal index={index}>
            <BillRevisionRow
              revision={item}
              showBillNumber={shopWide}
              {...(onOpenBill ? { onPress: () => onOpenBill(item.billId) } : null)}
            />
          </Reveal>
        )}
      />
    </View>
  );
}

/** One bill's history, pushed from its detail screen. */
export function BillRevisionsScreen({ navigation, route }: PerBillProps) {
  const { t } = useTranslation();
  const { billId, billNumber } = route.params;
  return (
    <RevisionsList
      billId={billId}
      title={t('bills.editHistory')}
      subtitle={billNumber}
      onBack={() => navigation.goBack()}
    />
  );
}

/** The shop-wide log. Registered for ADMIN sessions only. */
export function BillEditLogScreen({ navigation }: LogProps) {
  const { t } = useTranslation();
  return (
    <RevisionsList
      title={t('bills.editLog')}
      onBack={() => navigation.goBack()}
      onOpenBill={(id) => navigation.navigate('BillDetail', { billId: id })}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  headerBlock: { gap: spacing.md },
  ownOnly: { ...type.small, color: colors.muted },
  footerSpinner: { marginVertical: spacing.lg },
});
