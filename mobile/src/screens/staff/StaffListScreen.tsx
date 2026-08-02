import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronRight, Search, UserPlus, Users } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { TextField } from '../../components/TextField';
import { staffApi } from '../../api/staff';
import type { StaffAccount } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import type { StaffStackParamList } from '../../navigation/types';
import { orderMenus } from './staffMenus';

type Props = NativeStackScreenProps<StaffStackParamList, 'StaffList'>;

const PAGE_SIZE = 20;

/**
 * Who can sign in, and what each of them sees.
 *
 * Reached only from More, and only for the shop owner — a staff session's
 * navigator has no Staff route at all, and `/admin/staff` returns 403 for a
 * staff token regardless.
 */
export function StaffListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search);

  const [items, setItems] = useState<StaffAccount[]>([]);
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
        const result = await staffApi.list({
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

  // Accounts are edited, switched off and unlocked on the screens behind this
  // list, so it re-reads rather than showing what was true a minute ago.
  const reloadOnReturn = useCallback(() => {
    void load({ silent: true });
  }, [load]);
  useFocusEffect(reloadOnReturn);

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const result = await staffApi.list({
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
      <AppHeader title={t('staff.title')} subtitle={t('staff.subtitle')} onBack={() => navigation.goBack()} />

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
              placeholder={t('staff.searchPlaceholder')}
              leftIcon={<Search size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {/* The one emphasis action on this screen. */}
            <Button
              label={t('staff.addStaff')}
              onPress={() => navigation.navigate('StaffForm')}
              variant="accent"
              icon={<UserPlus size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
            />

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
              title={searching ? t('staff.noMatchTitle') : t('staff.emptyTitle')}
              body={searching ? t('staff.noMatchBody') : t('staff.emptyBody')}
              {...(searching ? {} : { actionLabel: t('staff.addStaff'), onAction: () => navigation.navigate('StaffForm') })}
            />
          )
        }
        renderItem={({ item }) => <StaffRow staff={item} isSelf={item.id === currentUserId} onPress={() => navigation.navigate('StaffDetail', { staffId: item.id, staffName: item.name })} />}
      />
    </View>
  );
}

function StaffRow({
  staff,
  isSelf,
  onPress,
}: {
  staff: StaffAccount;
  isSelf: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const isAdmin = staff.role === 'ADMIN';
  const assigned = orderMenus(staff.menuAccess);

  /**
   * An owner's menu comes from the role, not the column, so saying "3 of 6
   * screens" for one would be both wrong and confusing. Say what is true.
   */
  const menuSummary = isAdmin
    ? t('staff.allScreens')
    : assigned.length === 0
      ? t('staff.defaultScreens')
      : assigned.map((key) => t(`menus.${key}.label`)).join(' · ');

  return (
    <Card style={styles.row} onPress={onPress}>
      <View style={[styles.avatar, isAdmin ? styles.avatarAdmin : styles.avatarStaff, !staff.isActive && styles.avatarOff]}>
        <Text style={[styles.avatarText, isAdmin ? styles.avatarTextAdmin : styles.avatarTextStaff]}>
          {staff.name.slice(0, 1).toUpperCase()}
        </Text>
      </View>

      <View style={styles.rowText}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {staff.name}
          </Text>
          {isSelf ? (
            <View style={styles.selfChip}>
              <Text style={styles.selfChipText}>{t('staff.you')}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.username} numberOfLines={1}>
          @{staff.username}
        </Text>

        <View style={styles.badgeRow}>
          <View style={[styles.badge, isAdmin ? styles.badgeAdmin : styles.badgeStaff]}>
            <Text style={[styles.badgeText, isAdmin ? styles.badgeTextAdmin : styles.badgeTextStaff]}>
              {isAdmin ? t('common.admin') : t('common.staff')}
            </Text>
          </View>

          <View style={[styles.badge, staff.isActive ? styles.badgeActive : styles.badgeInactive]}>
            <Text style={[styles.badgeText, staff.isActive ? styles.badgeTextActive : styles.badgeTextInactive]}>
              {staff.isActive ? t('staff.active') : t('staff.inactive')}
            </Text>
          </View>

          {staff.isLocked ? (
            <View style={[styles.badge, styles.badgeLocked]}>
              <Text style={[styles.badgeText, styles.badgeTextLocked]}>{t('staff.locked')}</Text>
            </View>
          ) : null}

          <Text style={styles.discount}>
            {staff.maxDiscountPercent > 0
              ? t('staff.discountUpTo', { percent: staff.maxDiscountPercent })
              : t('staff.noDiscount')}
          </Text>
        </View>

        <Text style={styles.menuSummary} numberOfLines={2}>
          {menuSummary}
        </Text>
      </View>

      <ChevronRight size={18} color={colors.muted} strokeWidth={ICON_STROKE} />
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.sm, flexGrow: 1 },
  headerBlock: { marginBottom: spacing.md, gap: spacing.md },

  spinner: { marginTop: spacing.xxxl },
  footerSpinner: { marginVertical: spacing.lg },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TAP_TARGET + 16 },

  avatar: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  avatarAdmin: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  avatarStaff: { backgroundColor: colors.primarySoft },
  avatarOff: { opacity: 0.45 },
  avatarText: { ...type.h3 },
  avatarTextAdmin: { color: colors.accentDark },
  avatarTextStaff: { color: colors.primary },

  rowText: { flex: 1, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...type.bodyStrong, color: colors.text, flexShrink: 1 },
  username: { ...type.small, color: colors.muted },

  selfChip: { paddingHorizontal: spacing.sm, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken },
  selfChipText: { ...type.caption, color: colors.muted },

  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs + 2, marginTop: spacing.xs },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { ...type.caption },
  badgeAdmin: { backgroundColor: colors.accentSoft },
  badgeTextAdmin: { color: colors.accentInk },
  badgeStaff: { backgroundColor: colors.primarySoft },
  badgeTextStaff: { color: colors.primaryInk },
  badgeActive: { backgroundColor: colors.successSoft },
  badgeTextActive: { color: colors.successInk },
  badgeInactive: { backgroundColor: colors.surfaceSunken },
  badgeTextInactive: { color: colors.muted },
  badgeLocked: { backgroundColor: colors.warningSoft },
  badgeTextLocked: { color: colors.warningInk },

  discount: { ...type.caption, color: colors.muted, ...tabularNumbers },
  menuSummary: { ...type.caption, color: colors.faint, marginTop: 2 },
});
