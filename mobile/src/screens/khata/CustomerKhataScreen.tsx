import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ArrowUpDown, BookOpen, FilePlus2, IndianRupee } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ledgerApi } from '../../api/ledger';
import type { KhataStatement, LedgerEntry } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useAuthStore, useHasPermission } from '../../store/authStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import type { CustomersStackParamList } from '../../navigation/types';
import { LedgerEntryRow } from './LedgerEntryRow';
import { balanceTone, formatRupees, useBalanceCopy } from './khataFormat';

type Props = NativeStackScreenProps<CustomersStackParamList, 'CustomerKhata'>;

const PAGE_SIZE = 20;

/**
 * One customer's book. Open to staff — this is the screen they stand at the
 * counter with. Everything shop-wide lives elsewhere and is owner-only.
 *
 * The statement reloads on focus rather than only on mount, so coming back
 * from recording a payment shows the new balance without a manual pull.
 */
export function CustomerKhataScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const balanceCopy = useBalanceCopy();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const canRecordPayment = useHasPermission('payment.record');

  const { customerId, customerName } = route.params;

  const [statement, setStatement] = useState<KhataStatement | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [sort, setSort] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean; sort?: 'asc' | 'desc' } = {}) => {
      const order = opts.sort ?? sort;
      if (!opts.silent) setLoading(true);
      setFailure(null);
      try {
        const result = await ledgerApi.statement(customerId, { page: 1, pageSize: PAGE_SIZE, sort: order });
        setStatement(result);
        setEntries(result.entries);
        setPage(1);
        setHasMore(result.pagination.page < result.pagination.totalPages);
      } catch (error) {
        setFailure(readError(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [customerId, readError, sort],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // A payment recorded on the next screen changes the balance behind this one.
  const reloadOnReturn = useCallback(() => {
    void load({ silent: true });
  }, [load]);
  useFocusEffect(reloadOnReturn);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await ledgerApi.statement(customerId, { page: nextPage, pageSize: PAGE_SIZE, sort });
      setEntries((prev) => [...prev, ...result.entries]);
      setPage(nextPage);
      setHasMore(result.pagination.page < result.pagination.totalPages);
    } catch {
      // What is already on screen stays usable.
    } finally {
      setLoadingMore(false);
    }
  }

  function toggleSort() {
    const next = sort === 'desc' ? 'asc' : 'desc';
    setSort(next);
    void load({ sort: next });
  }

  const customer = statement?.customer;
  const outstanding = customer?.outstanding ?? 0;
  const tone = balanceTone(outstanding);
  const title = customer?.name ?? customerName ?? t('khata.title');

  return (
    <View style={styles.root}>
      <AppHeader title={title} subtitle={t('khata.statement')} onBack={() => navigation.goBack()} />

      <FlatList
        data={entries}
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
            {statement && customer ? (
              <Card tone={tone.owes ? 'danger' : 'default'}>
                <Text style={styles.balanceLabel}>{t('khata.outstandingLabel')}</Text>
                <Text style={[styles.balanceValue, { color: tone.color }]}>{balanceCopy(outstanding)}</Text>

                {customer.creditLimit > 0 ? (
                  <Text style={styles.balanceCaption}>
                    {customer.availableCredit !== null && customer.availableCredit >= 0
                      ? `${t('customers.availableCredit')}: ${formatRupees(customer.availableCredit)}`
                      : t('customers.overLimitBy', {
                          amount: formatRupees(Math.abs(customer.availableCredit ?? 0)),
                        })}
                  </Text>
                ) : null}

                <View style={styles.totalsRow}>
                  <Totals label={t('khata.totalBilled')} value={formatRupees(statement.totals.debit)} />
                  <Totals label={t('khata.totalReceived')} value={formatRupees(statement.totals.credit)} tone="success" />
                </View>

                {statement.openingBalance > 0 ? (
                  <Text style={styles.opening}>
                    {t('khata.openingBalance')}: {formatRupees(statement.openingBalance)}
                  </Text>
                ) : null}

                {canRecordPayment ? (
                  <Button
                    label={t('khata.recordPayment')}
                    onPress={() =>
                      navigation.navigate('RecordPayment', { customerId, customerName: customer.name })
                    }
                    variant="accent"
                    style={styles.payButton}
                    icon={<IndianRupee size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
                  />
                ) : null}

                {/* Raising a note writes off or adds to a balance with no bill
                    behind it — the owner's call, and the server refuses it for
                    anyone else regardless of what renders here. */}
                {isAdmin ? (
                  <Button
                    label={t('khata.noteEntry')}
                    onPress={() => navigation.navigate('KhataNote', { customerId, customerName: customer.name })}
                    variant="ghost"
                    size="small"
                    style={styles.noteButton}
                    icon={<FilePlus2 size={16} color={colors.primary} strokeWidth={ICON_STROKE} />}
                  />
                ) : null}
              </Card>
            ) : null}

            {failure ? (
              <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
            ) : null}

            {entries.length > 0 ? (
              <Pressable
                onPress={toggleSort}
                accessibilityRole="button"
                style={({ pressed }) => [styles.sortRow, pressed && styles.pressed]}
              >
                <ArrowUpDown size={14} color={colors.primary} strokeWidth={ICON_STROKE} />
                <Text style={styles.sortText}>
                  {sort === 'desc' ? t('khata.sortNewest') : t('khata.sortOldest')}
                </Text>
              </Pressable>
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
              icon={<BookOpen size={28} color={colors.primary} strokeWidth={ICON_STROKE} />}
              title={t('khata.emptyTitle')}
              body={t('khata.emptyBody')}
            />
          )
        }
        renderItem={({ item }) => <LedgerEntryRow entry={item} />}
      />
    </View>
  );
}

function Totals({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <View style={styles.totalsCell}>
      <Text style={styles.totalsLabel}>{label}</Text>
      <Text style={[styles.totalsValue, tone === 'success' && styles.totalsValueSuccess]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md, flexGrow: 1 },
  headerBlock: { marginBottom: spacing.md, gap: spacing.md },

  balanceLabel: { ...type.label, color: colors.muted, textTransform: 'uppercase' },
  balanceValue: { ...type.kpi, marginTop: spacing.xs },
  balanceCaption: { ...type.small, color: colors.muted, marginTop: 2 },
  opening: { ...type.small, color: colors.muted, marginTop: spacing.md, ...tabularNumbers },

  totalsRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalsCell: { flex: 1 },
  totalsLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  totalsValue: { ...type.money, color: colors.text, marginTop: 2 },
  totalsValueSuccess: { color: colors.success },

  payButton: { marginTop: spacing.lg },
  noteButton: { marginTop: spacing.sm, alignSelf: 'flex-start' },

  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: TAP_TARGET - 12,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  sortText: { ...type.smallStrong, color: colors.primary },
  pressed: { opacity: 0.7 },

  spinner: { marginTop: spacing.xxxl },
  footerSpinner: { marginVertical: spacing.lg },
});
