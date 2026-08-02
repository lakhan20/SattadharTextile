import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Check,
  KeyRound,
  Lock,
  LockOpen,
  Percent,
  Power,
  ShieldCheck,
  SquarePen,
  X,
} from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionHeader } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { Toast } from '../../components/Toast';
import { staffApi } from '../../api/staff';
import { PERMISSION_KEYS, type PermissionKey, type StaffAccount } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import type { StaffStackParamList } from '../../navigation/types';
import { ASSIGNABLE_MENUS, menuIcon } from './staffMenus';

type Props = NativeStackScreenProps<StaffStackParamList, 'StaffDetail'>;

/**
 * One account: what it is, what it sees, what it may do, and the four things an
 * owner can do to it.
 *
 * Every destructive action says what will actually happen before it happens —
 * resetting a password and switching an account off both throw that person out
 * of the app mid-shift, and an owner should know that before tapping, not after
 * a phone call from the counter.
 */
export function StaffDetailScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const { staffId, staffName } = route.params;
  const currentUserId = useAuthStore((s) => s.user?.id);
  const isSelf = staffId === currentUserId;

  const [staff, setStaff] = useState<StaffAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setFailure(null);
      try {
        setStaff(await staffApi.get(staffId));
      } catch (error) {
        setFailure(readError(error));
      } finally {
        setLoading(false);
      }
    },
    [staffId, readError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Returning from the edit form: show what was saved, not what was here before.
  const reloadOnReturn = useCallback(() => {
    void load({ silent: true });
  }, [load]);
  useFocusEffect(reloadOnReturn);

  const dismissToast = useCallback(() => setToast(null), []);

  /** Every action funnels through here so a refusal always reads the same way. */
  async function run(action: () => Promise<string>) {
    setBusy(true);
    setFailure(null);
    try {
      setToast(await action());
      await load({ silent: true });
    } catch (error) {
      const readable = readError(error);
      // The last-owner and not-yourself rules come back as CONFLICT/FORBIDDEN
      // with a sentence that names the actual reason. Show that sentence —
      // "You do not have access to this" would be a lie here.
      setFailure(
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? { ...readable, body: error.message }
          : readable,
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmDeactivate() {
    if (!staff) return;
    Alert.alert(t('staff.deactivateConfirmTitle', { name: staff.name }), t('staff.deactivateConfirmBody'), [
      { text: t('common.notNow'), style: 'cancel' },
      {
        text: t('staff.deactivate'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            const result = await staffApi.deactivate(staff.id);
            return result.revokedSessions > 0
              ? t('staff.deactivatedSignedOutToast', { name: staff.name })
              : t('staff.deactivatedToast', { name: staff.name });
          }),
      },
    ]);
  }

  function confirmActivate() {
    if (!staff) return;
    Alert.alert(t('staff.activateConfirmTitle', { name: staff.name }), t('staff.activateConfirmBody'), [
      { text: t('common.notNow'), style: 'cancel' },
      {
        text: t('staff.activate'),
        onPress: () =>
          void run(async () => {
            await staffApi.activate(staff.id);
            return t('staff.activatedToast', { name: staff.name });
          }),
      },
    ]);
  }

  function doUnlock() {
    if (!staff) return;
    void run(async () => {
      await staffApi.unlock(staff.id);
      return t('staff.unlockedToast', { name: staff.name });
    });
  }

  function submitReset() {
    if (!staff) return;
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setPasswordError(t('staff.errorPassword'));
      return;
    }
    Alert.alert(t('staff.resetConfirmTitle', { name: staff.name }), t('staff.resetConfirmBody'), [
      { text: t('common.notNow'), style: 'cancel' },
      {
        text: t('staff.resetPassword'),
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            await staffApi.resetPassword(staff.id, newPassword);
            setNewPassword('');
            setPasswordError(undefined);
            setResetting(false);
            return t('staff.resetToast', { name: staff.name });
          }),
      },
    ]);
  }

  if (loading && !staff) {
    return (
      <View style={styles.root}>
        <AppHeader title={staffName ?? t('staff.detailTitle')} onBack={() => navigation.goBack()} />
        <ActivityIndicator style={styles.spinner} color={colors.primary} />
      </View>
    );
  }

  const isAdminAccount = staff?.role === 'ADMIN';
  const grantedPermissions = staff
    ? PERMISSION_KEYS.filter((key) => (isAdminAccount ? true : staff.permissions[key] === true))
    : [];

  return (
    <View style={styles.root}>
      <AppHeader
        title={staff?.name ?? staffName ?? t('staff.detailTitle')}
        {...(staff ? { subtitle: `@${staff.username}` } : {})}
        onBack={() => navigation.goBack()}
      />

      <Screen onRefresh={() => void load({ silent: true })} refreshing={false}>
        {failure ? (
          <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
        ) : null}

        {staff ? (
          <>
            {!staff.isActive ? <Banner tone="warning" title={t('staff.inactiveBanner')} body={t('staff.inactiveBannerBody')} /> : null}
            {staff.isLocked ? <Banner tone="warning" title={t('staff.lockedBanner')} body={t('staff.lockedBannerBody')} /> : null}

            {/* ── Account ─────────────────────────── */}
            <Card>
              <View style={styles.identity}>
                <View style={[styles.avatar, isAdminAccount ? styles.avatarAdmin : styles.avatarStaff]}>
                  <Text style={[styles.avatarText, isAdminAccount ? styles.avatarTextAdmin : styles.avatarTextStaff]}>
                    {staff.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.identityText}>
                  <Text style={styles.name}>{staff.name}</Text>
                  <Text style={styles.meta}>@{staff.username}</Text>
                </View>
                <View style={[styles.pill, staff.isActive ? styles.pillActive : styles.pillInactive]}>
                  <Text style={[styles.pillText, staff.isActive ? styles.pillTextActive : styles.pillTextInactive]}>
                    {staff.isActive ? t('staff.active') : t('staff.inactive')}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              <Row
                icon={<ShieldCheck size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
                label={t('staff.roleLabel')}
                value={isAdminAccount ? t('common.admin') : t('common.staff')}
              />
              <Row
                icon={<Percent size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
                label={t('staff.maxDiscountLabel')}
                value={
                  staff.maxDiscountPercent > 0
                    ? t('staff.discountUpTo', { percent: staff.maxDiscountPercent })
                    : t('staff.noDiscount')
                }
              />
              <Row
                icon={<KeyRound size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
                label={t('staff.lastSignIn')}
                value={staff.lastLoginAt ? formatWhen(staff.lastLoginAt) : t('staff.neverSignedIn')}
              />
            </Card>

            {/* ── Screens they see ────────────────── */}
            <View>
              <SectionHeader title={t('staff.menuSection')} />
              <Card padded={false}>
                <View style={styles.sectionIntro}>
                  <Text style={styles.sectionIntroText}>
                    {isAdminAccount ? t('staff.menuIntroAdmin') : t('staff.menuIntroDetail')}
                  </Text>
                </View>

                {ASSIGNABLE_MENUS.map((key, index) => {
                  const on = isAdminAccount || staff.effectiveMenu.includes(key);
                  return (
                    <View key={key} style={[styles.menuRow, index > 0 && styles.rowBorder]}>
                      <View style={[styles.menuIcon, on && styles.menuIconOn]}>
                        {menuIcon(key, on ? colors.primary : colors.faint)}
                      </View>
                      <Text style={[styles.menuLabel, on && styles.menuLabelOn]}>{t(`menus.${key}.label`)}</Text>
                      {on ? (
                        <Check size={17} color={colors.success} strokeWidth={2.5} />
                      ) : (
                        <X size={17} color={colors.faint} strokeWidth={ICON_STROKE} />
                      )}
                    </View>
                  );
                })}
              </Card>
            </View>

            {/* ── What they can do ────────────────── */}
            <View>
              <SectionHeader title={t('staff.permissionSection')} />
              <Card>
                {grantedPermissions.length === 0 ? (
                  <Text style={styles.noneText}>{t('staff.noPermissions')}</Text>
                ) : (
                  grantedPermissions.map((key: PermissionKey, index) => (
                    <View key={key} style={[styles.permRow, index > 0 && styles.permRowSpaced]}>
                      <Check size={16} color={colors.success} strokeWidth={ICON_STROKE} />
                      <Text style={styles.permText}>{t(`permissions.${key}`)}</Text>
                    </View>
                  ))
                )}
              </Card>
            </View>

            {/* ── Actions ─────────────────────────── */}
            <View>
              <SectionHeader title={t('staff.actionsSection')} />
              <Card>
                <Button
                  label={t('staff.edit')}
                  onPress={() => navigation.navigate('StaffForm', { staffId: staff.id, staffName: staff.name })}
                  variant="accent"
                  icon={<SquarePen size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
                />

                <View style={styles.actionGap} />

                {resetting ? (
                  <View style={styles.resetBlock}>
                    <TextField
                      label={t('staff.newPasswordLabel')}
                      value={newPassword}
                      onChangeText={(next) => {
                        setNewPassword(next);
                        setPasswordError(undefined);
                      }}
                      secure
                      error={passwordError}
                      hint={t('staff.resetWarning')}
                      maxLength={72}
                      showPasswordLabel={t('auth.showPassword')}
                      hidePasswordLabel={t('auth.hidePassword')}
                    />
                    <View style={styles.resetActions}>
                      <Button
                        label={t('common.cancel')}
                        onPress={() => {
                          setResetting(false);
                          setNewPassword('');
                          setPasswordError(undefined);
                        }}
                        variant="ghost"
                        size="small"
                      />
                      <Button
                        label={t('staff.resetPassword')}
                        onPress={submitReset}
                        variant="danger"
                        size="small"
                        loading={busy}
                      />
                    </View>
                  </View>
                ) : (
                  <Button
                    label={t('staff.resetPassword')}
                    onPress={() => setResetting(true)}
                    variant="outline"
                    icon={<KeyRound size={18} color={colors.primary} strokeWidth={ICON_STROKE} />}
                  />
                )}

                {staff.isLocked ? (
                  <>
                    <View style={styles.actionGap} />
                    <Button
                      label={t('staff.unlock')}
                      onPress={doUnlock}
                      variant="outline"
                      loading={busy}
                      icon={<LockOpen size={18} color={colors.primary} strokeWidth={ICON_STROKE} />}
                    />
                  </>
                ) : null}

                <View style={styles.actionGap} />

                {/* An owner cannot switch off the account they are signed in
                    with — the server refuses it, and offering the button would
                    only teach them that the hard way. */}
                {isSelf ? (
                  <View style={styles.blockedRow}>
                    <Lock size={16} color={colors.muted} strokeWidth={ICON_STROKE} />
                    <Text style={styles.blockedText}>{t('staff.cannotDeactivateSelf')}</Text>
                  </View>
                ) : staff.isActive ? (
                  <Button
                    label={t('staff.deactivate')}
                    onPress={confirmDeactivate}
                    variant="danger"
                    loading={busy}
                    icon={<Power size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
                  />
                ) : (
                  <Button
                    label={t('staff.activate')}
                    onPress={confirmActivate}
                    variant="outline"
                    loading={busy}
                    icon={<Power size={18} color={colors.primary} strokeWidth={ICON_STROKE} />}
                  />
                )}
              </Card>
            </View>
          </>
        ) : null}
      </Screen>

      <Toast message={toast} onHide={dismissToast} />
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

/** Short and local — the owner wants "when", not a timestamp. */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) +
    ', ' +
    date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  spinner: { marginTop: spacing.xxxl },

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

  pill: { paddingHorizontal: spacing.md, paddingVertical: 3, borderRadius: radius.pill },
  pillActive: { backgroundColor: colors.successSoft },
  pillInactive: { backgroundColor: colors.surfaceSunken },
  pillText: { ...type.caption },
  pillTextActive: { color: colors.successInk },
  pillTextInactive: { color: colors.muted },

  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  rowLabel: { ...type.body, color: colors.text },
  rowValue: { ...type.bodyStrong, color: colors.text, marginLeft: spacing.md, ...tabularNumbers },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },

  sectionIntro: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  sectionIntroText: { ...type.small, color: colors.muted },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP_TARGET,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  menuIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  menuIconOn: { backgroundColor: colors.primarySoft },
  menuLabel: { ...type.body, color: colors.faint, flex: 1 },
  menuLabelOn: { color: colors.text },

  permRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  permRowSpaced: { marginTop: spacing.md },
  permText: { ...type.body, color: colors.text, flex: 1 },
  noneText: { ...type.body, color: colors.muted },

  actionGap: { height: spacing.md },
  resetBlock: { gap: spacing.md },
  resetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },

  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TAP_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.button,
    backgroundColor: colors.surfaceSunken,
  },
  blockedText: { ...type.small, color: colors.muted, flex: 1 },
});
