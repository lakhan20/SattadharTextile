import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AtSign, Check, Info, KeyRound, Lock, Percent, Save, User } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionHeader } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TextField } from '../../components/TextField';
import { Toast } from '../../components/Toast';
import { ApiError } from '../../api/client';
import { staffApi } from '../../api/staff';
import {
  PERMISSION_KEYS,
  type AdminMenuKey,
  type PermissionKey,
  type Role,
  type ServerLanguage,
  type StaffMenuKey,
} from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, type } from '../../theme';
import type { StaffStackParamList } from '../../navigation/types';
import {
  ASSIGNABLE_MENUS,
  NEVER_ASSIGNABLE_MENUS,
  knownAdminMenus,
  knownStaffMenus,
  menuIcon,
} from './staffMenus';

type Props = NativeStackScreenProps<StaffStackParamList, 'StaffForm'>;

const DEFAULT_MENUS: StaffMenuKey[] = ['DASHBOARD', 'BILLING', 'CUSTOMERS'];

/**
 * Creating and editing a staff account.
 *
 * Two separate decisions, kept visually separate because they answer different
 * questions:
 *
 *   Screens they see  — the menu assignment. Convenience: it tidies the app
 *                       down to the job this person actually does.
 *   What they can do  — the permission toggles. These are real: the server
 *                       checks them on every write.
 *
 * The screens section can only ever narrow. Owner-only areas are not in the
 * checklist at all, and are listed underneath as permanently unavailable, so an
 * owner can see the boundary rather than guess at it. The server refuses one of
 * those keys even if the request is made by hand.
 */
export function StaffFormScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const staffId = route.params?.staffId;
  const isEdit = !!staffId;
  const currentUserId = useAuthStore((s) => s.user?.id);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const isSelf = isEdit && staffId === currentUserId;

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('STAFF');
  const [language, setLanguage] = useState<ServerLanguage>('EN');
  const [maxDiscount, setMaxDiscount] = useState('0');
  const [permissions, setPermissions] = useState<Record<PermissionKey, boolean>>(
    () => Object.fromEntries(PERMISSION_KEYS.map((key) => [key, false])) as Record<PermissionKey, boolean>,
  );
  const [menus, setMenus] = useState<StaffMenuKey[]>(DEFAULT_MENUS);

  /**
   * Which screens may be ticked, and which never can, as the SERVER defines
   * them — so this form and the validator behind it cannot disagree about the
   * boundary. Falls back to what this build knows if the shop is running an
   * older server without `/admin/staff/options`.
   */
  const [assignable, setAssignable] = useState<readonly StaffMenuKey[]>(ASSIGNABLE_MENUS);
  const [neverAssignable, setNeverAssignable] = useState<readonly AdminMenuKey[]>(NEVER_ASSIGNABLE_MENUS);

  const [loading, setLoading] = useState(isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const options = await staffApi.options();
        if (cancelled) return;
        setAssignable(knownStaffMenus(options.assignableMenus));
        setNeverAssignable(knownAdminMenus(options.adminOnlyMenus));
      } catch {
        // Keep this build's own lists. They match the server that shipped with
        // it, and the server validates the submission either way.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    (async () => {
      try {
        const staff = await staffApi.get(staffId);
        if (cancelled) return;
        setName(staff.name);
        setUsername(staff.username);
        setPhone(staff.phone ?? '');
        setRole(staff.role);
        setLanguage(staff.preferredLang);
        setMaxDiscount(String(staff.maxDiscountPercent));
        setPermissions(staff.permissions);
        setMenus(staff.menuAccess);
      } catch (error) {
        if (!cancelled) setFailure(readError(error));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [staffId, readError]);

  const dismissToast = useCallback(() => setToast(null), []);

  const toggleMenu = (key: StaffMenuKey) =>
    setMenus((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      setErrors((e) => ({ ...e, menuAccess: undefined }));
      return next;
    });

  const togglePermission = (key: PermissionKey) =>
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));

  /**
   * Khata is opened from a customer's record — there is no other way in — so
   * ticking it alone would save a setting that does nothing. Caught here so the
   * owner sees it against the checkbox rather than as a submit failure.
   */
  const khataNeedsCustomers = menus.includes('KHATA') && !menus.includes('CUSTOMERS');

  const isAdminRole = role === 'ADMIN';

  const discountNumber = useMemo(() => Number(maxDiscount || '0'), [maxDiscount]);

  function validate(): boolean {
    const next: Record<string, string | undefined> = {};
    if (name.trim().length < 2) next['name'] = t('staff.errorName');
    if (!isEdit) {
      if (!/^[a-z0-9._-]{3,50}$/.test(username.trim().toLowerCase())) next['username'] = t('staff.errorUsername');
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        next['password'] = t('staff.errorPassword');
      }
    }
    if (!Number.isFinite(discountNumber) || discountNumber < 0 || discountNumber > 100) {
      next['maxDiscount'] = t('staff.errorDiscount');
    }
    if (khataNeedsCustomers) next['menuAccess'] = t('staff.errorKhataNeedsCustomers');
    if (!isAdminRole && menus.length === 0) next['menuAccess'] = t('staff.errorNoMenus');
    setErrors(next);
    return Object.values(next).every((v) => v === undefined);
  }

  async function submit() {
    setFailure(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      if (isEdit && staffId) {
        const updated = await staffApi.update(staffId, {
          name: name.trim(),
          role,
          phone: phone.trim() || null,
          preferredLang: language,
          maxDiscountPercent: discountNumber,
          permissions,
          menuAccess: menus,
        });
        // An owner who just edited their own account should see the result of
        // it, not the app they had before the save.
        if (isSelf) await refreshUser();
        setToast(t('staff.savedToast', { name: updated.name }));
        navigation.goBack();
      } else {
        const created = await staffApi.create({
          name: name.trim(),
          username: username.trim().toLowerCase(),
          password,
          role,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          preferredLang: language,
          maxDiscountPercent: discountNumber,
          permissions,
          menuAccess: menus,
        });
        setToast(t('staff.createdToast', { name: created.name }));
        // Replace, not push: coming "back" to a submitted create form is how a
        // shop ends up with two of the same account.
        navigation.replace('StaffDetail', { staffId: created.id, staffName: created.name });
      }
    } catch (error) {
      // The server validates the menu keys too. If it rejected one, show its
      // sentence against the section rather than a generic banner.
      if (error instanceof ApiError) {
        const menuIssue = error.details.find((d) => d.field.startsWith('menuAccess'));
        const usernameIssue = error.fieldError('username');
        if (menuIssue || usernameIssue) {
          setErrors((prev) => ({
            ...prev,
            ...(menuIssue ? { menuAccess: menuIssue.message } : {}),
            ...(usernameIssue ? { username: usernameIssue } : {}),
          }));
        }
        if (error.code === 'CONFLICT') {
          setErrors((prev) => ({ ...prev, username: error.message }));
        }
      }
      setFailure(readError(error));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <AppHeader title={t('staff.editTitle')} onBack={() => navigation.goBack()} />
        <ActivityIndicator style={styles.spinner} color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title={isEdit ? t('staff.editTitle') : t('staff.newTitle')}
        {...(isEdit ? { subtitle: `@${username}` } : {})}
        onBack={() => navigation.goBack()}
      />

      <Screen>
        {failure ? (
          <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
        ) : null}

        {/* ── Who they are ────────────────────────── */}
        <Card>
          <TextField
            label={t('staff.nameLabel')}
            value={name}
            onChangeText={(next) => {
              setName(next);
              setErrors((e) => ({ ...e, name: undefined }));
            }}
            placeholder={t('staff.namePlaceholder')}
            error={errors['name']}
            maxLength={120}
            leftIcon={<User size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
          />

          <View style={styles.spacer} />

          <TextField
            label={t('staff.usernameLabel')}
            value={username}
            onChangeText={(next) => {
              setUsername(next.toLowerCase().replace(/[^a-z0-9._-]/g, ''));
              setErrors((e) => ({ ...e, username: undefined }));
            }}
            placeholder={t('staff.usernamePlaceholder')}
            error={errors['username']}
            editable={!isEdit}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={50}
            hint={isEdit ? t('staff.usernameLockedHint') : t('staff.usernameHint')}
            leftIcon={<AtSign size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
          />

          <View style={styles.spacer} />

          {isEdit ? (
            // Changing a password is not an edit — it ends every session that
            // account has open — so it lives on the detail screen behind its
            // own confirmation rather than in the middle of this form.
            <View style={styles.noticeRow}>
              <KeyRound size={16} color={colors.muted} strokeWidth={ICON_STROKE} />
              <Text style={styles.noticeText}>{t('staff.passwordOnDetail')}</Text>
            </View>
          ) : (
            <TextField
              label={t('staff.passwordLabel')}
              value={password}
              onChangeText={(next) => {
                setPassword(next);
                setErrors((e) => ({ ...e, password: undefined }));
              }}
              secure
              error={errors['password']}
              hint={t('staff.passwordHint')}
              maxLength={72}
              showPasswordLabel={t('auth.showPassword')}
              hidePasswordLabel={t('auth.hidePassword')}
              leftIcon={<Lock size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
            />
          )}

          <View style={styles.spacer} />

          <TextField
            label={t('staff.phoneLabel')}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('staff.phonePlaceholder')}
            keyboardType="phone-pad"
            maxLength={20}
          />
        </Card>

        {/* ── Role and limits ─────────────────────── */}
        <View>
          <SectionHeader title={t('staff.roleSection')} />
          <Card>
            <SegmentedControl<Role>
              label={t('staff.roleLabel')}
              value={role}
              onChange={setRole}
              options={[
                { value: 'STAFF', label: t('common.staff') },
                { value: 'ADMIN', label: t('common.admin') },
              ]}
            />
            <Text style={styles.hint}>{isAdminRole ? t('staff.roleAdminHint') : t('staff.roleStaffHint')}</Text>

            <View style={styles.spacer} />

            <TextField
              label={t('staff.maxDiscountLabel')}
              value={maxDiscount}
              onChangeText={(next) => {
                setMaxDiscount(next.replace(/[^0-9.]/g, ''));
                setErrors((e) => ({ ...e, maxDiscount: undefined }));
              }}
              keyboardType="decimal-pad"
              error={errors['maxDiscount']}
              hint={t('staff.maxDiscountHint')}
              maxLength={6}
              leftIcon={<Percent size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
            />

            <View style={styles.spacer} />

            <SegmentedControl<ServerLanguage>
              label={t('staff.languageLabel')}
              value={language}
              onChange={setLanguage}
              options={[
                { value: 'EN', label: 'English' },
                { value: 'GU', label: 'ગુજરાતી' },
              ]}
            />
            <Text style={styles.hint}>{t('staff.languageHint')}</Text>
          </Card>
        </View>

        {/* ── Screens they see ────────────────────── */}
        <View>
          <SectionHeader title={t('staff.menuSection')} />
          <Card padded={false}>
            <View style={styles.sectionIntro}>
              <Text style={styles.sectionIntroText}>
                {isAdminRole ? t('staff.menuIntroAdmin') : t('staff.menuIntro')}
              </Text>
            </View>

            {isAdminRole ? null : (
              <>
                {assignable.map((key, index) => {
                  const on = menus.includes(key);
                  return (
                    <Pressable
                      key={key}
                      onPress={() => toggleMenu(key)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={t(`menus.${key}.label`)}
                      style={({ pressed }) => [
                        styles.checkRow,
                        index > 0 && styles.checkRowBorder,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={[styles.checkIcon, on && styles.checkIconOn]}>
                        {menuIcon(key, on ? colors.primary : colors.faint)}
                      </View>
                      <View style={styles.checkText}>
                        <Text style={[styles.checkLabel, on && styles.checkLabelOn]}>
                          {t(`menus.${key}.label`)}
                        </Text>
                        <Text style={styles.checkHint}>{t(`menus.${key}.hint`)}</Text>
                      </View>
                      <View style={[styles.box, on && styles.boxOn]}>
                        {on ? <Check size={15} color={colors.onPrimary} strokeWidth={3} /> : null}
                      </View>
                    </Pressable>
                  );
                })}

                {errors['menuAccess'] ? (
                  <View style={styles.sectionError}>
                    <Text style={styles.sectionErrorText}>{errors['menuAccess']}</Text>
                  </View>
                ) : null}
              </>
            )}

            {/* The boundary, stated rather than left as an absence. */}
            <View style={styles.lockedBlock}>
              <View style={styles.lockedHeader}>
                <Info size={15} color={colors.muted} strokeWidth={ICON_STROKE} />
                <Text style={styles.lockedTitle}>{t('staff.neverAssignable')}</Text>
              </View>
              <Text style={styles.lockedBody}>{t('staff.neverAssignableBody')}</Text>
              <View style={styles.lockedList}>
                {neverAssignable.map((key) => (
                  <View key={key} style={styles.lockedChip}>
                    <Lock size={12} color={colors.muted} strokeWidth={ICON_STROKE} />
                    <Text style={styles.lockedChipText}>{t(`menus.${key}.label`)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </Card>
        </View>

        {/* ── What they can do ────────────────────── */}
        <View>
          <SectionHeader title={t('staff.permissionSection')} />
          <Card padded={false}>
            <View style={styles.sectionIntro}>
              <Text style={styles.sectionIntroText}>
                {isAdminRole ? t('staff.permissionIntroAdmin') : t('staff.permissionIntro')}
              </Text>
            </View>

            {isAdminRole
              ? null
              : PERMISSION_KEYS.map((key, index) => (
                  <View key={key} style={[styles.switchRow, index > 0 && styles.checkRowBorder]}>
                    <Text style={styles.switchLabel}>{t(`permissions.${key}`)}</Text>
                    <Switch
                      value={permissions[key] === true}
                      onValueChange={() => togglePermission(key)}
                      disabled={submitting}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor={colors.surface}
                    />
                  </View>
                ))}
          </Card>
        </View>

        <Button
          label={isEdit ? t('staff.saveChanges') : t('staff.createAccount')}
          onPress={() => void submit()}
          variant="accent"
          loading={submitting}
          icon={<Save size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
        />
      </Screen>

      <Toast message={toast} onHide={dismissToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  spacer: { height: spacing.lg },
  spinner: { marginTop: spacing.xxxl },
  hint: { ...type.small, color: colors.muted, marginTop: spacing.sm },
  pressed: { opacity: 0.7 },

  noticeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  noticeText: { ...type.small, color: colors.muted, flex: 1 },

  sectionIntro: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  sectionIntroText: { ...type.small, color: colors.muted },

  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP_TARGET + 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  checkRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  checkIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  checkIconOn: { backgroundColor: colors.primarySoft },
  checkText: { flex: 1, gap: 1 },
  checkLabel: { ...type.body, color: colors.muted },
  checkLabelOn: { ...type.bodyStrong, color: colors.text },
  checkHint: { ...type.caption, color: colors.faint },

  box: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },

  sectionError: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, paddingTop: spacing.sm },
  sectionErrorText: { ...type.small, color: colors.danger },

  lockedBlock: {
    margin: spacing.md,
    padding: spacing.md,
    borderRadius: radius.input,
    backgroundColor: colors.surfaceSunken,
    gap: spacing.sm,
  },
  lockedHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lockedTitle: { ...type.smallStrong, color: colors.text },
  lockedBody: { ...type.caption, color: colors.muted },
  lockedList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  lockedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  lockedChipText: { ...type.caption, color: colors.muted },

  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: TAP_TARGET,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  switchLabel: { ...type.body, color: colors.text, flex: 1 },
});
