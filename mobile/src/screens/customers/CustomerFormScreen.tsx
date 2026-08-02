import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ChevronRight, IndianRupee, Phone, UserPlus } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionHeader } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { TextField } from '../../components/TextField';
import { Toast } from '../../components/Toast';
import { customersApi } from '../../api/customers';
import type { Customer, CustomerType } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAuthStore } from '../../store/authStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, type } from '../../theme';
import type { CustomersStackParamList } from '../../navigation/types';
import { formatRupees } from '../khata/khataFormat';

type Props = NativeStackScreenProps<CustomersStackParamList, 'CustomerForm'>;

/**
 * Registering a customer.
 *
 * The phone number is the first field and does the most work: it is checked
 * against the customer list *while it is being typed*, so someone about to
 * re-register a regular is shown that person's record before filling anything
 * else in. Catching it at submit would be correct and useless — the form would
 * already have been completed twice.
 *
 * Credit limit and opening balance are owner-only. Both are commitments about
 * money the shop is owed, and neither belongs to whoever is standing at the
 * counter taking a name down.
 */
export function CustomerFormScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const isAdmin = useAuthStore((s) => s.user?.role === 'ADMIN');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState(route.params?.phone ?? '');
  const [customerType, setCustomerType] = useState<CustomerType>('RETAIL');
  const [gstin, setGstin] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Gujarat');
  const [pincode, setPincode] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');

  const [existing, setExisting] = useState<Customer | null>(null);
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [toast, setToast] = useState<string | null>(null);

  const debouncedPhone = useDebouncedValue(phone);

  // Look the number up as it is typed. Ten digits is the point at which an
  // Indian mobile is complete enough to be worth asking about.
  useEffect(() => {
    const digits = debouncedPhone.replace(/\D/g, '');
    if (digits.length < 10) {
      setExisting(null);
      return undefined;
    }
    let cancelled = false;
    setChecking(true);
    (async () => {
      try {
        const found = await customersApi.byPhone(debouncedPhone);
        if (!cancelled) setExisting(found);
      } catch {
        // A failed check must not block registration — the server refuses a
        // true duplicate at submit regardless.
        if (!cancelled) setExisting(null);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedPhone]);

  const dismissToast = useCallback(() => setToast(null), []);

  async function submit() {
    setFailure(null);

    const nextErrors: { name?: string; phone?: string } = {};
    if (name.trim().length < 2) nextErrors.name = t('customers.errorNameRequired');
    if (phone.replace(/\D/g, '').length < 6) nextErrors.phone = t('customers.errorPhoneRequired');
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      const created = await customersApi.create({
        name: name.trim(),
        phone: phone.trim(),
        type: customerType,
        state: state.trim() || 'Gujarat',
        ...(gstin.trim() ? { gstin: gstin.trim().toUpperCase() } : {}),
        ...(addressLine.trim() ? { addressLine: addressLine.trim() } : {}),
        ...(city.trim() ? { city: city.trim() } : {}),
        ...(pincode.trim() ? { pincode: pincode.trim() } : {}),
        ...(isAdmin && creditLimit.trim() ? { creditLimit: Number(creditLimit) } : {}),
        ...(isAdmin && openingBalance.trim() ? { openingBalance: Number(openingBalance) } : {}),
      });

      setToast(t('customers.createdToast', { name: created.name }));
      // Replace, not push: coming "back" to a form that has already been
      // submitted invites a second identical customer.
      navigation.replace('CustomerDetail', { customerId: created.id, customerName: created.name });
    } catch (error) {
      setFailure(readError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader title={t('customers.newTitle')} onBack={() => navigation.goBack()} />

      <Screen>
        {failure ? (
          <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
        ) : null}

        <Card>
          <TextField
            label={t('customers.phoneLabel')}
            value={phone}
            onChangeText={(next) => {
              setPhone(next);
              setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
            placeholder={t('customers.phonePlaceholder')}
            keyboardType="phone-pad"
            error={errors.phone}
            hint={t('customers.phoneHint')}
            leftIcon={<Phone size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
          />

          {checking ? (
            <View style={styles.checkingRow}>
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={styles.checkingText}>{t('customers.checkingPhone')}</Text>
            </View>
          ) : null}

          {/* The duplicate this whole feature exists to prevent. Offered as a
              way through, not just a warning — the thing they actually want is
              that customer's record. */}
          {existing ? (
            <Pressable
              onPress={() =>
                navigation.replace('CustomerDetail', {
                  customerId: existing.id,
                  customerName: existing.name,
                })
              }
              accessibilityRole="button"
              style={({ pressed }) => [styles.existing, pressed && styles.pressed]}
            >
              <View style={styles.existingText}>
                <Text style={styles.existingTitle}>{t('customers.alreadyRegistered')}</Text>
                <Text style={styles.existingName} numberOfLines={1}>
                  {existing.name}
                </Text>
                <Text style={styles.existingSub}>
                  {existing.outstanding > 0
                    ? t('customers.owesAmount', { amount: formatRupees(existing.outstanding) })
                    : t('customers.settled')}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.warningInk} strokeWidth={ICON_STROKE} />
            </Pressable>
          ) : null}

          <View style={styles.spacer} />

          <TextField
            label={t('customers.nameLabel')}
            value={name}
            onChangeText={(next) => {
              setName(next);
              setErrors((prev) => ({ ...prev, name: undefined }));
            }}
            placeholder={t('customers.namePlaceholder')}
            error={errors.name}
            maxLength={120}
          />

          <View style={styles.spacer} />

          <SegmentedControl<CustomerType>
            label={t('customers.typeLabel')}
            value={customerType}
            onChange={setCustomerType}
            options={[
              { value: 'RETAIL', label: t('customers.retail') },
              { value: 'WHOLESALE', label: t('customers.wholesale') },
            ]}
          />
          <Text style={styles.hint}>
            {customerType === 'WHOLESALE' ? t('customers.wholesaleHint') : t('customers.retailHint')}
          </Text>
        </Card>

        <View>
          <SectionHeader title={t('customers.addressSection')} />
          <Card>
            <TextField
              label={t('customers.gstin')}
              value={gstin}
              onChangeText={setGstin}
              placeholder={t('customers.gstinPlaceholder')}
              autoCapitalize="characters"
              maxLength={15}
            />
            <View style={styles.spacer} />
            <TextField
              label={t('customers.addressLabel')}
              value={addressLine}
              onChangeText={setAddressLine}
              placeholder={t('customers.addressPlaceholder')}
              maxLength={200}
            />
            <View style={styles.spacer} />
            <View style={styles.pairRow}>
              <TextField
                label={t('customers.city')}
                value={city}
                onChangeText={setCity}
                maxLength={80}
                containerStyle={styles.pairItem}
              />
              <TextField
                label={t('customers.pincode')}
                value={pincode}
                onChangeText={(next) => setPincode(next.replace(/\D/g, ''))}
                keyboardType="number-pad"
                maxLength={6}
                containerStyle={styles.pairItem}
              />
            </View>
            <View style={styles.spacer} />
            <TextField
              label={t('customers.stateLabel')}
              value={state}
              onChangeText={setState}
              maxLength={60}
              hint={t('customers.stateHint')}
            />
          </Card>
        </View>

        {/* Money the shop is owed, or agrees to be owed — the owner's call. */}
        {isAdmin ? (
          <View>
            <SectionHeader title={t('customers.creditSection')} />
            <Card>
              <TextField
                label={t('customers.creditLimit')}
                value={creditLimit}
                onChangeText={(next) => setCreditLimit(next.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                keyboardType="decimal-pad"
                hint={t('customers.creditLimitHint')}
                leftIcon={<IndianRupee size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              />
              <View style={styles.spacer} />
              <TextField
                label={t('customers.openingBalance')}
                value={openingBalance}
                onChangeText={(next) => setOpeningBalance(next.replace(/[^0-9.]/g, ''))}
                placeholder="0.00"
                keyboardType="decimal-pad"
                hint={t('customers.openingBalanceHint')}
                leftIcon={<IndianRupee size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              />
            </Card>
          </View>
        ) : null}

        <Button
          label={t('customers.saveCustomer')}
          onPress={() => void submit()}
          variant="accent"
          loading={submitting}
          disabled={!!existing}
          icon={<UserPlus size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
        />
      </Screen>

      <Toast message={toast} onHide={dismissToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  spacer: { height: spacing.lg },
  hint: { ...type.small, color: colors.muted, marginTop: spacing.sm },

  checkingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  checkingText: { ...type.caption, color: colors.muted },

  existing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.input,
    backgroundColor: colors.warningSoft,
    minHeight: TAP_TARGET,
  },
  existingText: { flex: 1 },
  existingTitle: { ...type.caption, color: colors.warningInk, textTransform: 'uppercase' },
  existingName: { ...type.bodyStrong, color: colors.text, marginTop: 2 },
  existingSub: { ...type.small, color: colors.muted },
  pressed: { opacity: 0.7 },

  pairRow: { flexDirection: 'row', gap: spacing.md },
  pairItem: { flex: 1 },
});
