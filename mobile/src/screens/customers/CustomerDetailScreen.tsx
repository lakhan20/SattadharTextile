import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { BookOpen, ChevronRight, IndianRupee, Receipt } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionHeader } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { billsApi } from '../../api/bills';
import { customersApi } from '../../api/customers';
import type { Bill, BillsPage, Customer } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useHasMenu, useHasPermission } from '../../store/authStore';
import { ICON_STROKE, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { formatMoney } from '../../utils/money';
import type { CustomersStackParamList } from '../../navigation/types';
import { BillModeBadge } from '../billing/BillModeBadge';
import { balanceTone, formatRupees, useBalanceCopy } from '../khata/khataFormat';

type Props = NativeStackScreenProps<CustomersStackParamList, 'CustomerDetail'>;

/**
 * The customer's page, and the door to their khata.
 *
 * Read-only for now — editing arrives with the customers module. What it owes
 * the khata work is a single obvious way in, plus the balance itself, since
 * "how much do they owe?" is the question this screen is usually opened to
 * answer.
 */
export function CustomerDetailScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const balanceCopy = useBalanceCopy();
  const canRecordPayment = useHasPermission('payment.record');
  /**
   * The khata screens are registered only for a session whose menu carries
   * KHATA, so these two buttons must not offer a route that is not there. The
   * balance above stays visible either way — one customer's balance is
   * precisely what anyone serving them needs to know.
   */
  const hasKhata = useHasMenu('KHATA');

  const { customerId, customerName } = route.params;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [recentBills, setRecentBills] = useState<Bill[]>([]);
  const [billSummary, setBillSummary] = useState<BillsPage['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setLoading(true);
      setFailure(null);
      try {
        // Both together: the customer without their history answers half the
        // question this screen is opened to answer.
        const [loaded, bills] = await Promise.all([
          customersApi.get(customerId),
          billsApi.list({ customerId, page: 1, pageSize: 3 }),
        ]);
        setCustomer(loaded);
        setRecentBills(bills.items);
        setBillSummary(bills.summary);
      } catch (error) {
        setFailure(readError(error));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [customerId, readError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const reloadOnReturn = useCallback(() => {
    void load({ silent: true });
  }, [load]);
  useFocusEffect(reloadOnReturn);

  const outstanding = customer?.outstanding ?? 0;
  const tone = balanceTone(outstanding);
  const availableCredit =
    customer && customer.creditLimit > 0 ? customer.creditLimit - customer.outstanding : null;

  return (
    <View style={styles.root}>
      <AppHeader
        title={customer?.name ?? customerName ?? t('customers.detailTitle')}
        subtitle={customer ? t(`customers.${customer.type === 'WHOLESALE' ? 'wholesale' : 'retail'}`) : undefined}
        onBack={() => navigation.goBack()}
      />

      <Screen
        onRefresh={() => {
          setRefreshing(true);
          void load({ silent: true });
        }}
        refreshing={refreshing}
      >
        {failure ? (
          <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
        ) : null}

        {loading && !customer ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}

        {customer ? (
          <>
            {!customer.isActive ? <Banner tone="warning" title={t('customers.inactive')} /> : null}

            <Card tone={tone.owes ? 'danger' : 'default'}>
              <Text style={styles.balanceLabel}>{t('khata.outstandingLabel')}</Text>
              <Text style={[styles.balanceValue, { color: tone.color }]}>{balanceCopy(outstanding)}</Text>

              <Text style={styles.balanceCaption}>
                {customer.creditLimit > 0
                  ? `${t('customers.creditLimit')}: ${formatRupees(customer.creditLimit)}`
                  : t('customers.noCreditLimit')}
              </Text>

              {availableCredit !== null ? (
                <Text style={styles.balanceCaption}>
                  {availableCredit >= 0
                    ? `${t('customers.availableCredit')}: ${formatRupees(availableCredit)}`
                    : t('customers.overLimitBy', { amount: formatRupees(Math.abs(availableCredit)) })}
                </Text>
              ) : null}

              {hasKhata ? (
                <Button
                  label={t('customers.openKhata')}
                  onPress={() =>
                    navigation.navigate('CustomerKhata', { customerId, customerName: customer.name })
                  }
                  variant="accent"
                  style={styles.primaryAction}
                  icon={<BookOpen size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
                />
              ) : null}

              {hasKhata && canRecordPayment ? (
                <Button
                  label={t('khata.recordPayment')}
                  onPress={() =>
                    navigation.navigate('RecordPayment', { customerId, customerName: customer.name })
                  }
                  variant="outline"
                  style={styles.secondaryAction}
                  icon={<IndianRupee size={18} color={colors.primary} strokeWidth={ICON_STROKE} />}
                />
              ) : null}
            </Card>

            {/* The purchase history, up front. "What did they buy last time"
                is asked at the counter about as often as "what do they owe",
                and it used to be answerable only by scrolling the whole
                bills list looking for their name. */}
            <View>
              <SectionHeader
                title={t('customers.billHistory')}
                action={
                  billSummary && billSummary.billCount > 0 ? (
                    <Text style={styles.sectionCaption}>
                      {t('customers.billsAndValue', {
                        count: billSummary.billCount,
                        value: formatMoney(billSummary.grandTotal),
                      })}
                    </Text>
                  ) : undefined
                }
              />
              {recentBills.length === 0 ? (
                <Card>
                  <Text style={styles.noBills}>{t('customers.noBillsShort')}</Text>
                </Card>
              ) : (
                <Card padded={false} style={styles.billsCard}>
                  {recentBills.map((bill, index) => (
                    <Pressable
                      key={bill.id}
                      onPress={() => navigation.navigate('BillDetail', { billId: bill.id })}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.billRow,
                        index > 0 && styles.billRowDivided,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.billText}>
                        <View style={styles.billTitleLine}>
                          <Text style={styles.billNumber}>{bill.billNumber}</Text>
                          <BillModeBadge mode={bill.billingMode} />
                        </View>
                        <Text style={styles.billDate}>
                          {new Date(bill.billDate).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </Text>
                      </View>
                      <View style={styles.billAmounts}>
                        <Text style={styles.billTotal}>₹{formatMoney(bill.grandTotal)}</Text>
                        {bill.dueAmount > 0 ? (
                          <Text style={styles.billDue}>
                            {t('bills.dueShort', { amount: formatMoney(bill.dueAmount) })}
                          </Text>
                        ) : null}
                      </View>
                      <ChevronRight size={16} color={colors.faint} strokeWidth={ICON_STROKE} />
                    </Pressable>
                  ))}

                  {billSummary && billSummary.billCount > recentBills.length ? (
                    <Pressable
                      onPress={() =>
                        navigation.navigate('CustomerBills', { customerId, customerName: customer.name })
                      }
                      accessibilityRole="button"
                      style={({ pressed }) => [styles.seeAll, pressed && styles.pressed]}
                    >
                      <Receipt size={15} color={colors.primary} strokeWidth={ICON_STROKE} />
                      <Text style={styles.seeAllText}>
                        {t('customers.seeAllBills', { count: billSummary.billCount })}
                      </Text>
                    </Pressable>
                  ) : null}
                </Card>
              )}
            </View>

            <View>
              <SectionHeader title={t('customers.contact')} />
              <Card>
                <Row
                  label={t('customers.contact')}
                  value={customer.phone}
                  onPress={() => void Linking.openURL(`tel:${customer.phone}`)}
                  actionLabel={t('customers.callCustomer')}
                />
                <Row label={t('customers.gstin')} value={customer.gstin ?? t('customers.notProvided')} />
                <Row
                  label={t('customers.address')}
                  value={
                    [customer.addressLine, customer.city, customer.state, customer.pincode]
                      .filter(Boolean)
                      .join(', ') || t('customers.notProvided')
                  }
                />
              </Card>
            </View>
          </>
        ) : null}
      </Screen>
    </View>
  );
}

function Row({
  label,
  value,
  onPress,
  actionLabel,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  actionLabel?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowValueBlock}>
        <Text style={styles.rowValue}>{value}</Text>
        {onPress && actionLabel ? (
          <Text style={styles.rowAction} onPress={onPress} accessibilityRole="button">
            {actionLabel}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  spinner: { marginTop: spacing.xxxl },

  balanceLabel: { ...type.label, color: colors.muted, textTransform: 'uppercase' },
  balanceValue: { ...type.kpi, marginTop: spacing.xs },
  balanceCaption: { ...type.small, color: colors.muted, marginTop: 2, ...tabularNumbers },
  primaryAction: { marginTop: spacing.lg },
  secondaryAction: { marginTop: spacing.sm },

  sectionCaption: { ...type.caption, color: colors.muted, ...tabularNumbers },
  noBills: { ...type.small, color: colors.muted },
  billsCard: { overflow: 'hidden' },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  billRowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  billText: { flex: 1, gap: 2 },
  billTitleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  billNumber: { ...type.body, color: colors.text, ...tabularNumbers },
  billDate: { ...type.caption, color: colors.muted, ...tabularNumbers },
  billAmounts: { alignItems: 'flex-end', gap: 1 },
  billTotal: { ...type.money, color: colors.text },
  billDue: { ...type.caption, color: colors.danger, ...tabularNumbers },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.primarySoft,
    borderBottomLeftRadius: radius.card,
    borderBottomRightRadius: radius.card,
  },
  seeAllText: { ...type.smallStrong, color: colors.primary },
  pressed: { opacity: 0.6 },

  row: { paddingVertical: spacing.sm, gap: 2 },
  rowLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  rowValueBlock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rowValue: { ...type.body, color: colors.text, flexShrink: 1 },
  rowAction: { ...type.smallStrong, color: colors.primary },
});
