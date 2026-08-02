import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Plus } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionHeader } from '../../components/Card';
import { TextField } from '../../components/TextField';
import { ApiError } from '../../api/client';
import { billsApi } from '../../api/bills';
import { customersApi } from '../../api/customers';
import type { Bill, Customer, DiscountType, PaymentMode, Product, TaxType } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useIsAdmin } from '../../store/authStore';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { previewBill } from '../../utils/billCalc';
import { formatMoney } from '../../utils/money';
import type { BillRoutes } from '../../navigation/types';
import { BillLineRow, type BillLine } from './BillLineRow';
import { PaymentPanel } from './PaymentPanel';
import { ProductPickerSheet } from './ProductPickerSheet';

type Props = NativeStackScreenProps<BillRoutes, 'BillEdit'>;

/**
 * Revising an issued bill.
 *
 * Deliberately not a second billing screen: the bill number, date, mode and
 * customer are shown as fixed facts rather than fields, because the server
 * refuses to change any of them. Changing who a bill belongs to is not a
 * correction — it is a cancellation and a new bill.
 *
 * The reason box is not optional and not at the bottom as an afterthought. An
 * edit with no explanation is exactly the activity the owner asked to be able
 * to see, so the screen will not submit without one.
 */

let lineCounter = 0;
const nextLineKey = (): string => `edit-${++lineCounter}`;

export function BillEditScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const readError = useApiError();
  const isAdmin = useIsAdmin();
  const { billId } = route.params;

  const [bill, setBill] = useState<Bill | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  const [lines, setLines] = useState<BillLine[]>([]);
  const [billDiscountType, setBillDiscountType] = useState<DiscountType>('PERCENT');
  const [billDiscountText, setBillDiscountText] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('CASH');
  const [paidText, setPaidText] = useState('');
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');

  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const loaded = await billsApi.get(billId);
      setBill(loaded);
      setLines(
        (loaded.items ?? []).map((item) => ({
          key: nextLineKey(),
          productId: item.productId,
          productName: item.productName,
          unit: item.unit,
          qty: item.qty,
          qtyText: String(item.qty),
          rate: item.rate,
          rateText: String(item.rate),
          // The bill's own rates are the truth here — there is no customer
          // switch on this screen, so nothing should ever re-price a line.
          retailRate: item.rate,
          wholesaleRate: item.rate,
          rateEdited: true,
          gstPercent: item.gstPercent,
          discountType: item.discountType ?? 'PERCENT',
          discountValue: item.discountValue,
          discountText: item.discountValue > 0 ? String(item.discountValue) : '',
        })),
      );
      setBillDiscountType(loaded.billDiscountType ?? 'PERCENT');
      setBillDiscountText(loaded.billDiscountValue > 0 ? String(loaded.billDiscountValue) : '');
      setPaymentMode(loaded.paymentMode);
      setPaidText(String(loaded.paidAmount));
      setNotes(loaded.notes ?? '');
      if (loaded.customerId) {
        // Only so the picker offers the right rate for a line added now.
        // A failure here is not worth blocking the edit over.
        try {
          setCustomer(await customersApi.get(loaded.customerId));
        } catch {
          setCustomer(null);
        }
      }
    } catch (error) {
      setFailure(readError(error));
    } finally {
      setLoading(false);
    }
  }, [billId, readError]);

  useEffect(() => {
    void load();
  }, [load]);

  const billDiscountValue = Number(billDiscountText) || 0;

  const taxType: TaxType = bill?.taxType ?? 'NONE';
  const preview = useMemo(
    () =>
      previewBill(lines, {
        billingMode: bill?.billingMode ?? 'GST',
        taxType,
        billDiscountType,
        billDiscountValue,
      }),
    [lines, bill?.billingMode, taxType, billDiscountType, billDiscountValue],
  );

  const updateLine = useCallback((key: string, patch: Partial<BillLine>) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }, []);

  const removeLine = useCallback(
    (key: string, name: string) => {
      Alert.alert(t('billing.removeLine'), t('billing.removeLineConfirm', { name }), [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: () => setLines((prev) => prev.filter((line) => line.key !== key)),
        },
      ]);
    },
    [t],
  );

  function handleAddProduct(product: Product) {
    const rate = customer?.type === 'WHOLESALE' ? product.wholesaleRate : product.retailRate;
    setLines((prev) => [
      ...prev,
      {
        key: nextLineKey(),
        productId: product.id,
        productName: product.name,
        unit: product.unit,
        qty: 1,
        qtyText: '1',
        rate,
        rateText: String(rate),
        retailRate: product.retailRate,
        wholesaleRate: product.wholesaleRate,
        rateEdited: false,
        gstPercent: product.gstPercent,
        discountType: 'PERCENT',
        discountValue: 0,
        discountText: '',
      },
    ]);
  }

  const reasonReady = reason.trim().length >= 3;
  const canSave = Boolean(bill) && lines.length > 0 && reasonReady && !saving;

  /**
   * The server refuses to revise a bill below what has already been received
   * against it — that is a credit note, not an edit. Saying so here saves a
   * round trip and, more usefully, names the right instrument.
   */
  const belowPaid = bill ? preview.grandTotal < bill.paidAmount - 0.005 : false;

  async function handleSave(override = false) {
    if (!canSave || !bill) return;
    setSaving(true);
    setFailure(null);
    setServerMessage(null);
    try {
      await billsApi.update(bill.id, {
        reason: reason.trim(),
        paymentMode,
        ...(paidText.trim() === '' ? null : { paidAmount: Number(paidText) || 0 }),
        billDiscountType,
        billDiscountValue,
        notes: notes.trim(),
        ...(override ? { overrideCreditLimit: true } : null),
        items: lines.map((line) => ({
          productId: line.productId,
          qty: line.qty,
          rate: line.rate,
          discountType: line.discountType,
          discountValue: line.discountValue,
        })),
      });
      // Back to the bill it belongs to, which reloads on focus and will show
      // the new totals plus a fresh entry in its history.
      navigation.goBack();
    } catch (error) {
      if (error instanceof ApiError) {
        setServerMessage(error.message);
        setFailure(readError(error));
        if (error.code === 'CREDIT_LIMIT_EXCEEDED' && isAdmin) {
          Alert.alert(t('billing.creditLimitTitle'), error.message, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('billing.sellAnyway'), style: 'destructive', onPress: () => void handleSave(true) },
          ]);
        }
      } else {
        setFailure(readError(error));
      }
    } finally {
      setSaving(false);
    }
  }

  function confirmDiscard() {
    Alert.alert(t('bills.discardEditTitle'), t('bills.discardEditBody'), [
      { text: t('billing.keepEditing'), style: 'cancel' },
      { text: t('billing.discard'), style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  }

  return (
    <View style={styles.root}>
      <AppHeader
        title={t('bills.editTitle')}
        subtitle={bill?.billNumber}
        onBack={confirmDiscard}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 56}
      >
        {loading ? (
          <ActivityIndicator style={styles.spinner} color={colors.primary} />
        ) : (
          <FlatList
            data={lines}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View style={styles.headerBlock}>
                {/* What cannot be changed, stated as fact rather than left as
                    a greyed-out field the shopkeeper keeps tapping. */}
                {bill ? (
                  <Card style={styles.fixedCard}>
                    <Text style={styles.fixedLine}>
                      {bill.billNumber} · {new Date(bill.billDate).toLocaleDateString('en-IN')}
                    </Text>
                    <Text style={styles.fixedSub}>
                      {bill.customerNameSnapshot ?? t('billing.walkIn')}
                    </Text>
                    <Text style={styles.fixedNote}>{t('bills.editFixedNote')}</Text>
                  </Card>
                ) : null}

                {failure ? (
                  <Banner
                    tone={failure.isOffline ? 'offline' : 'error'}
                    title={failure.title}
                    body={serverMessage ?? failure.body}
                  />
                ) : null}

                {bill?.billingMode === 'GST' ? (
                  <Banner tone="warning" title={t('bills.editGstWarning')} body={t('bills.editGstWarningBody')} />
                ) : null}

                {belowPaid && bill ? (
                  <Banner
                    tone="error"
                    title={t('bills.belowPaidTitle')}
                    body={t('bills.belowPaidBody', { paid: formatMoney(bill.paidAmount) })}
                  />
                ) : null}

                <SectionHeader title={t('billing.items')} />
              </View>
            }
            renderItem={({ item }) => (
              <BillLineRow
                line={item}
                customerId={bill?.customerId ?? null}
                onChange={(patch) => updateLine(item.key, patch)}
                onRemove={() => removeLine(item.key, item.productName)}
              />
            )}
            ListEmptyComponent={<Text style={styles.emptyLines}>{t('bills.editNeedsALine')}</Text>}
            ListFooterComponent={
              <View style={styles.footerBlock}>
                <Button
                  label={t('billing.addProduct')}
                  onPress={() => setProductPickerOpen(true)}
                  variant="outline"
                  icon={<Plus size={18} color={colors.primary} strokeWidth={ICON_STROKE} />}
                />

                <Card style={styles.blockCard}>
                  <Text style={styles.blockLabel}>{t('billing.billDiscount')}</Text>
                  <View style={styles.discountInput}>
                    <TextField
                      label=""
                      value={billDiscountText}
                      onChangeText={(text) => setBillDiscountText(text.replace(/[^0-9.]/g, ''))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      containerStyle={styles.flex}
                    />
                    <Pressable
                      onPress={() => setBillDiscountType((prev) => (prev === 'PERCENT' ? 'FLAT' : 'PERCENT'))}
                      style={styles.discountToggle}
                      accessibilityRole="button"
                      accessibilityLabel={billDiscountType === 'PERCENT' ? '%' : '₹'}
                    >
                      <Text style={styles.discountToggleText}>{billDiscountType === 'PERCENT' ? '%' : '₹'}</Text>
                    </Pressable>
                  </View>
                </Card>

                <Card style={styles.blockCard}>
                  <PaymentPanel
                    mode={paymentMode}
                    onModeChange={setPaymentMode}
                    paidText={paidText}
                    onPaidChange={setPaidText}
                    grandTotal={preview.grandTotal}
                    // A bill being revised already belongs to someone, or it
                    // is a walk-in that can never go on a khata.
                    creditAllowed={Boolean(bill?.customerId)}
                    creditBlockedReason={t('bills.editCreditNeedsCustomer')}
                  />
                </Card>

                <Card style={styles.blockCard}>
                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>{t('billing.total')}</Text>
                    <Text style={styles.totalValue}>₹{formatMoney(preview.grandTotal)}</Text>
                  </View>
                  {bill && Math.abs(preview.grandTotal - bill.grandTotal) >= 0.005 ? (
                    <Text style={styles.deltaText}>
                      {t('bills.wasTotal', { total: formatMoney(bill.grandTotal) })}
                    </Text>
                  ) : null}
                </Card>

                <TextField
                  label={t('billing.notes')}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                />

                {/* Required. The save button stays disabled until this is
                    filled, because the reason is the entire point of the log. */}
                <TextField
                  label={t('bills.editReason')}
                  value={reason}
                  onChangeText={setReason}
                  placeholder={t('bills.editReasonPlaceholder')}
                  multiline
                />
                <Text style={styles.reasonHint}>{t('bills.editReasonHint')}</Text>
              </View>
            }
          />
        )}

        <View style={[styles.saveBar, { paddingBottom: insets.bottom + spacing.sm }]}>
          <Button
            label={saving ? t('common.saving') : t('bills.saveChanges')}
            onPress={() => void handleSave()}
            variant="indigo"
            loading={saving}
            disabled={!canSave}
          />
        </View>
      </KeyboardAvoidingView>

      <ProductPickerSheet
        visible={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        onSelect={handleAddProduct}
        useWholesaleRate={customer?.type === 'WHOLESALE'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  spinner: { marginTop: spacing.xxxl },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  headerBlock: { gap: spacing.md, marginBottom: spacing.xs },
  footerBlock: { gap: spacing.md, marginTop: spacing.md },
  emptyLines: { ...type.small, color: colors.muted, textAlign: 'center', paddingVertical: spacing.xl },

  fixedCard: { gap: 2 },
  fixedLine: { ...type.bodyStrong, color: colors.text, ...tabularNumbers },
  fixedSub: { ...type.small, color: colors.muted },
  fixedNote: { ...type.caption, color: colors.faint, marginTop: spacing.xs },

  blockCard: { gap: spacing.sm },
  blockLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  discountInput: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  discountToggle: {
    width: TAP_TARGET,
    height: TAP_TARGET,
    borderRadius: radius.input,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountToggleText: { ...type.bodyStrong, color: colors.primary },

  totalRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  totalLabel: { ...type.h3, color: colors.text },
  totalValue: { ...type.kpiSmall, color: colors.primary },
  deltaText: { ...type.caption, color: colors.muted, ...tabularNumbers },

  reasonHint: { ...type.caption, color: colors.muted, marginTop: -spacing.xs },

  saveBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
