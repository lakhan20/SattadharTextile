import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Constants from 'expo-constants';
import {
  BadgePercent,
  Check,
  ChevronRight,
  FileBarChart,
  Languages,
  Lock,
  LogOut,
  Percent,
  Server,
  ShieldCheck,
  Users,
  Warehouse,
} from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Card, SectionHeader } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { pingServer } from '../../api/auth';
import { PERMISSION_KEYS, type PermissionKey } from '../../api/types';
import { LANGUAGES, LANGUAGE_LABEL, type AppLanguage } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { useSettingsStore } from '../../store/settingsStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, type } from '../../theme';
import type { AppStackParamList } from '../../navigation/types';

type Reachability = 'checking' | 'online' | 'offline';

export function MoreScreen({ onOpenServer }: { onOpenServer: () => void }) {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const baseUrl = useSettingsStore((s) => s.baseUrl);
  const language = useSettingsStore((s) => s.language);
  const setLanguage = useSettingsStore((s) => s.setLanguage);

  const [reachability, setReachability] = useState<Reachability>('checking');
  const isAdmin = user?.role === 'ADMIN';

  const checkServer = useCallback(async () => {
    setReachability('checking');
    try {
      await pingServer(baseUrl, 6000);
      setReachability('online');
    } catch {
      setReachability('offline');
    }
  }, [baseUrl]);

  useEffect(() => {
    void checkServer();
  }, [checkServer]);

  function confirmSignOut() {
    Alert.alert(t('auth.signOutConfirmTitle'), t('auth.signOutConfirmBody'), [
      { text: t('common.notNow'), style: 'cancel' },
      { text: t('auth.signOut'), style: 'destructive', onPress: () => void signOut() },
    ]);
  }

  const grantedPermissions = PERMISSION_KEYS.filter((key) =>
    isAdmin ? true : user?.permissions?.[key] === true,
  );

  return (
    <View style={styles.root}>
      <AppHeader title={t('more.title')} />

      <Screen onRefresh={() => void checkServer()} refreshing={false}>
        {/* ── Account ─────────────────────────────── */}
        <View>
          <SectionHeader title={t('more.account')} />
          <Card>
            <View style={styles.identity}>
              <View style={[styles.avatar, isAdmin ? styles.avatarAdmin : styles.avatarStaff]}>
                <Text style={[styles.avatarText, isAdmin ? styles.avatarTextAdmin : styles.avatarTextStaff]}>
                  {(user?.name ?? '?').slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.identityText}>
                <Text style={styles.name}>{user?.name}</Text>
                <Text style={styles.meta}>@{user?.username}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <Row
              icon={<ShieldCheck size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              label={t('more.yourRole')}
              value={isAdmin ? t('common.admin') : t('common.staff')}
            />
            <Row
              icon={<Percent size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              label={t('more.maxDiscount')}
              value={
                (user?.maxDiscountPercent ?? 0) > 0
                  ? t('more.maxDiscountValue', { percent: user?.maxDiscountPercent })
                  : t('more.noDiscount')
              }
            />
          </Card>
        </View>

        {/* ── What this account may do ─────────────── */}
        <View>
          <SectionHeader title={t('more.permissions')} />
          <Card>
            {grantedPermissions.length === 0 ? (
              <Text style={styles.noPermissions}>{t('more.noPermissions')}</Text>
            ) : (
              grantedPermissions.map((key, index) => (
                <View key={key} style={[styles.permRow, index > 0 && styles.permRowSpaced]}>
                  <Check size={16} color={colors.success} strokeWidth={ICON_STROKE} />
                  <Text style={styles.permText}>{t(`permissions.${key}` as `permissions.${PermissionKey}`)}</Text>
                </View>
              ))
            )}
          </Card>
        </View>

        {/* ── Shop floor ──────────────────────────── */}
        <View>
          <SectionHeader title={t('more.shopFloor')} />
          <Card padded={false}>
            {/* Open to everyone: STAFF get the shelf and the ledger read-only,
                and the server refuses the write endpoints regardless. */}
            <PressableRow
              icon={<Warehouse size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              label={t('stock.title')}
              value={isAdmin ? t('more.stockSubAdmin') : t('more.stockSubStaff')}
              onPress={() => navigation.navigate('Stock', { screen: 'StockOverview' })}
            />
          </Card>
        </View>

        {/* ── Preferences ─────────────────────────── */}
        <View>
          <SectionHeader title={t('more.preferences')} />
          <Card padded={false}>
            <View style={styles.langHeader}>
              <Languages size={18} color={colors.muted} strokeWidth={ICON_STROKE} />
              <Text style={styles.rowLabel}>{t('more.language')}</Text>
            </View>
            <View style={styles.langOptions}>
              {LANGUAGES.map((code: AppLanguage) => {
                const active = language === code;
                return (
                  <Pressable
                    key={code}
                    onPress={() => setLanguage(code)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[styles.langOption, active && styles.langOptionActive]}
                  >
                    <Text style={[styles.langOptionText, active && styles.langOptionTextActive]}>
                      {LANGUAGE_LABEL[code]}
                    </Text>
                    {active ? <Check size={16} color={colors.accentDark} strokeWidth={ICON_STROKE} /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>
        </View>

        {/* ── Connection ──────────────────────────── */}
        <View>
          <SectionHeader title={t('more.connection')} />
          <Card padded={false}>
            <PressableRow
              icon={<Server size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              label={t('more.server')}
              value={baseUrl.replace(/^https?:\/\//, '')}
              onPress={onOpenServer}
              badge={
                <View style={styles.statusRow}>
                  <View
                    style={[
                      styles.statusDot,
                      reachability === 'online' && styles.dotOnline,
                      reachability === 'offline' && styles.dotOffline,
                    ]}
                  />
                  <Text style={styles.statusText}>
                    {reachability === 'checking'
                      ? t('more.serverStatusChecking')
                      : reachability === 'online'
                        ? t('more.serverStatusOnline')
                        : t('more.serverStatusOffline')}
                  </Text>
                </View>
              }
            />
          </Card>
        </View>

        {/* ── Owner-only area ─────────────────────── */}
        <View>
          <SectionHeader title={t('more.adminSection')} />
          <Card padded={false}>
            <LockedRow
              icon={<Users size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              label={t('more.staffAccounts')}
              allowed={isAdmin}
              lockedLabel={t('more.lockedToOwner')}
              soonLabel={t('modules.buildingNow')}
            />
            {/* Reports are built now, so for the owner this is a real link.
                Staff keep the locked row: the app's shape stays honest about
                what exists, and their navigator has no Reports route to
                reach even if this rendered as pressable. */}
            {isAdmin ? (
              <PressableRow
                icon={<FileBarChart size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
                label={t('more.reports')}
                value={t('more.reportsSub')}
                onPress={() => navigation.navigate('Reports', { screen: 'ReportsHub' })}
              />
            ) : (
              <LockedRow
                icon={<FileBarChart size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
                label={t('more.reports')}
                allowed={false}
                lockedLabel={t('more.lockedToOwner')}
                soonLabel={t('modules.buildingNow')}
              />
            )}
            <LockedRow
              icon={<BadgePercent size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              label={t('more.discountRules')}
              allowed={isAdmin}
              lockedLabel={t('more.lockedToOwner')}
              soonLabel={t('modules.buildingNow')}
              last
            />
          </Card>
        </View>

        <Pressable
          onPress={confirmSignOut}
          accessibilityRole="button"
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}
        >
          <LogOut size={18} color={colors.danger} strokeWidth={ICON_STROKE} />
          <Text style={styles.signOutText}>{t('auth.signOut')}</Text>
        </Pressable>

        <Text style={styles.version}>
          {t('more.version')} {Constants.expoConfig?.version ?? '1.0.0'}
        </Text>
      </Screen>
    </View>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        {icon}
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function PressableRow({
  icon,
  label,
  value,
  onPress,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.pressableRow, pressed && styles.pressed]}
    >
      <View style={styles.rowLeft}>
        {icon}
        <View style={styles.rowTextBlock}>
          <Text style={styles.rowLabel}>{label}</Text>
          {value ? (
            <Text style={styles.rowSub} numberOfLines={1}>
              {value}
            </Text>
          ) : null}
          {badge}
        </View>
      </View>
      <ChevronRight size={18} color={colors.muted} strokeWidth={ICON_STROKE} />
    </Pressable>
  );
}

/**
 * Shown to everyone so the app's shape is honest, but STAFF see the lock —
 * and the server would refuse the call regardless of what this renders.
 */
function LockedRow({
  icon,
  label,
  allowed,
  lockedLabel,
  soonLabel,
  last = false,
}: {
  icon: React.ReactNode;
  label: string;
  allowed: boolean;
  lockedLabel: string;
  soonLabel: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.pressableRow, !last && styles.rowBorder, !allowed && styles.rowDimmed]}>
      <View style={styles.rowLeft}>
        {icon}
        <View style={styles.rowTextBlock}>
          <Text style={styles.rowLabel}>{label}</Text>
          <Text style={styles.rowSub}>{allowed ? soonLabel : lockedLabel}</Text>
        </View>
      </View>
      {allowed ? null : <Lock size={16} color={colors.muted} strokeWidth={ICON_STROKE} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarAdmin: { backgroundColor: colors.accentSoft, borderWidth: 1, borderColor: colors.accent },
  avatarStaff: { backgroundColor: colors.primarySoft },
  avatarText: { ...type.h2 },
  avatarTextAdmin: { color: colors.accentDark },
  avatarTextStaff: { color: colors.primary },
  identityText: { flex: 1 },
  name: { ...type.h3, color: colors.text },
  meta: { ...type.small, color: colors.muted },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.lg },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  rowTextBlock: { flex: 1, gap: 1 },
  rowLabel: { ...type.body, color: colors.text },
  rowSub: { ...type.small, color: colors.muted },
  rowValue: { ...type.bodyStrong, color: colors.text, marginLeft: spacing.md },

  pressableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TAP_TARGET + 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowDimmed: { opacity: 0.6 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.border },
  dotOnline: { backgroundColor: colors.success },
  dotOffline: { backgroundColor: colors.danger },
  statusText: { ...type.caption, color: colors.muted },

  permRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  permRowSpaced: { marginTop: spacing.md },
  permText: { ...type.body, color: colors.text, flex: 1 },
  noPermissions: { ...type.body, color: colors.muted },

  langHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  langOptions: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TAP_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  langOptionActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  langOptionText: { ...type.body, color: colors.text },
  langOptionTextActive: { ...type.bodyStrong, color: colors.accentDark },

  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: TAP_TARGET,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
    backgroundColor: colors.dangerSoft,
  },
  signOutText: { ...type.button, color: colors.danger },
  pressed: { opacity: 0.65 },

  version: { ...type.caption, color: colors.muted, textAlign: 'center' },
});
