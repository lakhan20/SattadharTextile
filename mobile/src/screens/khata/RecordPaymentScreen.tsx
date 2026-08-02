import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Banknote, Building2, Check, IndianRupee, Smartphone, X } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { Toast } from '../../components/Toast';
import { ledgerApi } from '../../api/ledger';
import type { Bill, KhataStatement, ReceiptMode, RecordPaymentResult } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import type { CustomersStackParamList } from '../../navigation/types';
import { BillPickerSheet } from './BillPickerSheet';
import { formatDay, formatRupees } from './khataFormat';

type Props = NativeStackScreenProps<CustomersStackParamList, 'RecordPayment'>;

const MODES: { value: ReceiptMode; labelKey: string; Icon: typeof Banknote }[] = [
  { value: 'CASH', labelKey: 'khata.modeCASH', Icon: Banknote },
  { value: 'UPI', labelKey: 'khata.modeUPI', Icon: Smartphone },
  { value: 'BANK', labelKey: 'khata.modeBANK', Icon: Building2 },
];

/**
 * Taking money at the counter. Open to staff, because that is who is standing
 * there when the customer hands over the cash.
 *
 * After a successful receipt the form is replaced by the result rather than
 * cleared: the number that matters is the new balance, and someone who has
 * just taken 5,000 rupees should see what is left owing before they look up,
 * not an empty form inviting them to do it again.
 */
export function RecordPaymentScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();

  const { customerId, customerName } = route.params;

  const [statement, setStatement] = useState<KhataStatement | null>(null);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<ReceiptMode>('CASH');
  const [note, setNote] = useState('');
  const [bill, setBill] = useState<Bill | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [amountError, setAmountError] = useState<string | undefined>();
  const [result, setResult] = useState<RecordPaymentResult | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Read the balance so the form can offer "pay all" and say what is owed —
  // the same endpoint the khata screen uses, so the figure cannot disagree.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetched = await ledgerApi.statement(customerId, { pageSize: 1 });
        if (!cancelled) setStatement(fetched);
      } catch {
        // The balance is context, not a precondition — a payment can still be
        // recorded without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  // A preselected bill arrives from the bill detail screen's "record payment".
  useEffect(() => {
    const billId = route.params.billId;
    if (!billId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const { billsApi } = await import('../../api/bills');
        const fetched = await billsApi.get(billId);
        if (!cancelled) {
          setBill(fetched);
          setAmount(String(fetched.dueAmount));
        }
      } catch {
        // Falling back to the picker beats blocking the screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [route.params.billId]);

  const dismissToast = useCallback(() => setToast(null), []);

  const outstanding = statement?.customer.outstanding ?? 0;
  const name = statement?.customer.name ?? customerName ?? '';

  async function submit() {
    setFailure(null);
    const parsed = Number(amount);

    if (!amount.trim()) {
      setAmountError(t('khata.errorAmountRequired'));
      return;
    }
    if (Number.isNaN(parsed) || parsed <= 0) {
      setAmountError(t('khata.errorAmountPositive'));
      return;
    }
    setAmountError(undefined);

    setSubmitting(true);
    try {
      const receipt = await ledgerApi.recordPayment({
        customerId,
        amount: parsed,
        paymentMode: mode,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(bill ? { refBillId: bill.id } : {}),
      });
      setResult(receipt);
      setToast(t('khata.paymentDone', { amount: formatRupees(receipt.amount) }));
    } catch (error) {
      setFailure(readError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('khata.paymentTitle')}
        subtitle={name ? t('khata.paymentFor', { name }) : undefined}
        onBack={() => navigation.goBack()}
      />

      <Screen>
        {failure ? (
          <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
        ) : null}

        {result ? (
          <PaymentResult result={result} onDone={() => navigation.goBack()} />
        ) : (
          <>
            <Card>
              <TextField
                label={t('khata.amountLabel')}
                value={amount}
                onChangeText={(next) => {
                  setAmount(next.replace(/[^0-9.]/g, ''));
                  setAmountError(undefined);
                }}
                placeholder={t('khata.amountPlaceholder')}
                keyboardType="decimal-pad"
                error={amountError}
                hint={outstanding > 0 ? t('khata.amountHint', { amount: formatRupees(outstanding) }) : undefined}
                leftIcon={<IndianRupee size={18} color={colors.muted} strokeWidth={ICON_STROKE} />}
              />

              {outstanding > 0 ? (
                <Pressable
                  onPress={() => {
                    setAmount(outstanding.toFixed(2));
                    setAmountError(undefined);
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.payAll, pressed && styles.pressed]}
                >
                  <Text style={styles.payAllText}>
                    {t('khata.payFull', { amount: formatRupees(outstanding) })}
                  </Text>
                </Pressable>
              ) : null}

              <View style={styles.spacer} />

              <Text style={styles.fieldLabel}>{t('khata.modeLabel')}</Text>
              <View style={styles.modeRow}>
                {MODES.map(({ value, labelKey, Icon }) => {
                  const active = mode === value;
                  return (
                    <Pressable
                      key={value}
                      onPress={() => setMode(value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={[styles.modeChip, active && styles.modeChipActive]}
                    >
                      <Icon
                        size={16}
                        color={active ? colors.onPrimary : colors.muted}
                        strokeWidth={ICON_STROKE}
                      />
                      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{t(labelKey)}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.spacer} />

              <Text style={styles.fieldLabel}>{t('khata.againstBillLabel')}</Text>
              <Pressable
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.billPicker, pressed && styles.pressed]}
              >
                <View style={styles.billText}>
                  <Text style={styles.billValue} numberOfLines={1}>
                    {bill ? bill.billNumber : t('khata.anyOpenBill')}
                  </Text>
                  {bill ? (
                    <Text style={styles.billSub}>
                      {formatDay(bill.billDate)} · {formatRupees(bill.dueAmount)}
                    </Text>
                  ) : null}
                </View>
                {bill ? (
                  <Pressable
                    onPress={() => setBill(null)}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t('khata.clearBill')}
                  >
                    <X size={18} color={colors.muted} strokeWidth={ICON_STROKE} />
                  </Pressable>
                ) : null}
              </Pressable>

              <View style={styles.spacer} />

              <TextField
                label={t('khata.noteLabel')}
                value={note}
                onChangeText={setNote}
                placeholder={t('khata.notePlaceholder')}
                maxLength={200}
              />
            </Card>

            <Button
              label={t('khata.submitPayment')}
              onPress={() => void submit()}
              variant="accent"
              loading={submitting}
              icon={<Check size={18} color={colors.onAccent} strokeWidth={ICON_STROKE} />}
            />
          </>
        )}
      </Screen>

      <BillPickerSheet
        visible={pickerOpen}
        customerId={customerId}
        onClose={() => setPickerOpen(false)}
        onSelect={(picked) => {
          setBill(picked);
          // Pre-fill with what that bill still owes: the overwhelmingly common
          // intent, and still editable for a part payment.
          if (picked) setAmount(String(picked.dueAmount));
        }}
      />
      <Toast message={toast} onHide={dismissToast} />
    </View>
  );
}

/** What the shop needs to see the moment the money is in the drawer. */
function PaymentResult({ result, onDone }: { result: RecordPaymentResult; onDone: () => void }) {
  const { t } = useTranslation();
  const settled = result.balanceAfter === 0;
  const inCredit = result.balanceAfter < 0;

  return (
    <>
      <Banner
        tone="success"
        title={t('khata.paymentDone', { amount: formatRupees(result.amount) })}
        body={t('khata.receiptIssued', { number: result.receiptNumber })}
      />

      <Card tone={settled || inCredit ? 'success' : 'danger'}>
        <Text style={styles.resultLabel}>{t('khata.outstandingLabel')}</Text>
        <Text style={[styles.resultValue, settled || inCredit ? styles.resultOk : styles.resultOwed]}>
          {settled
            ? t('khata.nowSettled')
            : inCredit
              ? t('khata.nowInCredit', { amount: formatRupees(Math.abs(result.balanceAfter)) })
              : t('khata.newBalance', { amount: formatRupees(result.balanceAfter) })}
        </Text>

        {result.allocations.length > 0 ? (
          <Text style={styles.resultMeta}>
            {t('khata.allocatedTo', { bills: result.allocations.map((a) => a.billNumber).join(', ') })}
          </Text>
        ) : null}

        {result.unallocated > 0 ? (
          <Text style={styles.resultMeta}>
            {t('khata.unallocated', { amount: formatRupees(result.unallocated) })}
          </Text>
        ) : null}
      </Card>

      <Button label={t('common.close')} onPress={onDone} variant="outline" />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  spacer: { height: spacing.lg },
  fieldLabel: { ...type.smallStrong, color: colors.text, marginBottom: spacing.xs + 2 },

  payAll: { alignSelf: 'flex-start', marginTop: spacing.sm, paddingVertical: spacing.xs },
  payAllText: { ...type.smallStrong, color: colors.primary },
  pressed: { opacity: 0.7 },

  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: TAP_TARGET - 4,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  modeLabel: { ...type.smallStrong, color: colors.muted },
  modeLabelActive: { color: colors.onPrimary },

  billPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: TAP_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
  },
  billText: { flexShrink: 1 },
  billValue: { ...type.body, color: colors.text },
  billSub: { ...type.caption, color: colors.muted, ...tabularNumbers },

  resultLabel: { ...type.label, color: colors.muted, textTransform: 'uppercase' },
  resultValue: { ...type.h3, marginTop: spacing.xs },
  resultOk: { color: colors.success },
  resultOwed: { color: colors.danger },
  resultMeta: { ...type.small, color: colors.muted, marginTop: spacing.sm },
});
