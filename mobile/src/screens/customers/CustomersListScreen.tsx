import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronRight, Search, UserPlus, Users, Wallet } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { TextField } from '../../components/TextField';
import { customersApi } from '../../api/customers';
import type { Customer } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuthStore, useHasPermission } from '../../store/authStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import type { CustomersStackParamList } from '../../navigation/types';
import { balanceTone, formatRupees } from '../khata/khataFormat';

type Props = NativeStackScreenProps<CustomersStackParamList, 'CustomersList'>;

const PAGE_SIZE = 20;

/**
 * The way into a customer's khata.
 *
 * Read-only on purpose: creating and editing customers is the customers
 * module's job and is not built yet. What this needs to do today is let
 * someone find a name and get to their book, so every row leads straight
 * there rather than to a form.
 *
 * The outstanding badge is shown to everyone — it is one customer's balance,
 * which is precisely what staff are allowed to see. The shop-wide total is
 * behind the owner-only button in the header.
 */
export function CustomersListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');
  const canCreate = useHasPermission('customer.create');

  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);

  const [items, setItems] = useState<Customer[]>([]);
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
        const result = await customersApi.list({
          page: 1,
          pageSize: PAGE_SIZE,
          ...(debounced.trim() ? { search: debounced.trim() } : {}),
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
    [debounced, readError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Balances change on the khata screens behind this list.
  const reloadOnReturn = useCallback(() => {
    void load({ silent: true });
  }, [load]);
  useFocusEffect(reloadOnReturn);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await customersApi.list({
        page: nextPage,
        pageSize: PAGE_SIZE,
        ...(debounced.trim() ? { search: debounced.trim() } : {}),
      });
      setItems((prev) => [...prev, ...result.items]);
      setPage(nextPage);
      setHasMore(result.pagination.page < result.pagination.totalPages);
    } catch {
      // What is already on screen stays usable.
    } finally {
      setLoadingMore(false);
    }
  }

  const searching = debounced.trim().length > 0;

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('customers.title')}
        right={
          // Registered only in the owner's navigator — see CustomersStackNavigator.
          isAdmin ? (
            <Pressable
              onPress={() => navigation.navigate('Outstanding')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('khata.outstandingTitle')}
              style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
            >
              <Wallet size={15} color={colors.primary} strokeWidth={ICON_STROKE} />
              <Text style={styles.headerActionText}>{t('khata.outstandingTitle')}</Text>
            </Pressable>
          ) : null
        }
      />

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          void load({ silent: true });
        }}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <TextField
              label=""
              value={search}
              onChangeText={setSearch}
              placeholder={t('customers.searchPlaceholder')}
              leftIcon={<Search size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {canCreate ? (
              <Button
                label={t('customers.newCustomer')}
                onPress={() => navigation.navigate('CustomerForm')}
                variant="accent"
                icon={<UserPlus size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
              />
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
              icon={<Users size={28} color={colors.primary} strokeWidth={ICON_STROKE} />}
              title={searching ? t('customers.noMatchTitle') : t('customers.emptyTitle')}
              body={searching ? t('customers.noMatchBody') : t('customers.emptyBody')}
              {...(canCreate
                ? {
                    actionLabel: t('customers.newCustomer'),
                    // A search that found nobody is the most likely moment
                    // someone wants to add them — carry the typed digits over
                    // so the number is not retyped.
                    onAction: () =>
                      navigation.navigate('CustomerForm', {
                        ...(/^[\d+\s-]+$/.test(debounced.trim()) ? { phone: debounced.trim() } : {}),
                      }),
                  }
                : {})}
            />
          )
        }
        renderItem={({ item }) => {
          const tone = balanceTone(item.outstanding);
          return (
            <Card
              style={styles.row}
              onPress={() =>
                navigation.navigate('CustomerDetail', { customerId: item.id, customerName: item.name })
              }
            >
              <View style={styles.rowText}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  {item.type === 'WHOLESALE' ? (
                    <View style={styles.typeChip}>
                      <Text style={styles.typeChipText}>{t('customers.wholesale')}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  {item.phone}
                  {item.city ? ` · ${item.city}` : ''}
                </Text>
              </View>

              <View style={styles.balanceBlock}>
                <Text style={styles.balanceLabel}>
                  {item.outstanding > 0
                    ? t('customers.owes')
                    : item.outstanding < 0
                      ? t('customers.inCredit')
                      : t('customers.settled')}
                </Text>
                {item.outstanding !== 0 ? (
                  <Text style={[styles.balance, { color: tone.color }]}>
                    {formatRupees(Math.abs(item.outstanding))}
                  </Text>
                ) : null}
              </View>

              <ChevronRight size={18} color={colors.muted} strokeWidth={ICON_STROKE} />
            </Card>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm, flexGrow: 1 },
  headerBlock: { marginBottom: spacing.md, gap: spacing.md },

  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  headerActionText: { ...type.smallStrong, color: colors.primary },
  pressed: { opacity: 0.7 },

  spinner: { marginTop: spacing.xxxl },
  footerSpinner: { marginVertical: spacing.lg },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP_TARGET + 8 },
  rowText: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  sub: { ...type.small, color: colors.muted, marginTop: 1 },
  typeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  typeChipText: { ...type.caption, color: colors.primary },

  balanceBlock: { alignItems: 'flex-end' },
  balanceLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  balance: { ...type.money, ...tabularNumbers, marginTop: 1 },
});
