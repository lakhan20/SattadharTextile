import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { History, Pencil, Share2, FileText } from 'lucide-react-native';
import { AppHeader } from '../../components/AppHeader';
import { Banner } from '../../components/Banner';
import { Button } from '../../components/Button';
import { Card, SectionHeader } from '../../components/Card';
import { Screen } from '../../components/Screen';
import { ApiError } from '../../api/client';
import { billsApi } from '../../api/bills';
import type { Bill } from '../../api/types';
import { useApiError, type ReadableError } from '../../hooks/useApiError';
import { useHasPermission } from '../../store/authStore';
import { ICON_STROKE, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { shareBillPdf } from '../../utils/billPdf';
import { formatMoney, formatQty } from '../../utils/money';
import type { BillRoutes } from '../../navigation/types';
import { BillModeBadge } from './BillModeBadge';

type Props = NativeStackScreenProps<BillRoutes, 'BillDetail'>;

function AmountRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.amountRow}>
      <Text style={[styles.amountLabel, strong && styles.amountLabelStrong]}>{label}</Text>
      <Text style={[styles.amountValue, strong && styles.amountValueStrong]}>{value}</Text>
    </View>
  );
}

export function BillDetailScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const readError = useApiError();
  const canEdit = useHasPermission('bill.edit');
  const { billId } = route.params;

  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ReadableError | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try {
      setBill(await billsApi.get(billId));
    } catch (error) {
      setFailure(readError(error));
    } finally {
      setLoading(false);
    }
  }, [billId, readError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Coming back from an edit must not leave the old totals on screen — the
  // bill in front of the customer would then disagree with the one on file.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function handleSharePdf() {
    if (!bill) return;
    setSharing(true);
    setServerMessage(null);
    try {
      await shareBillPdf(bill);
    } catch {
      setServerMessage(t('billing.pdfFailed'));
    } finally {
      setSharing(false);
    }
  }

  async function handleWhatsApp() {
    if (!bill) return;
    setSending(true);
    setServerMessage(null);
    try {
      const result = await billsApi.send(bill.id);
      await Linking.openURL(result.whatsappUrl);
    } catch (error) {
      setServerMessage(error instanceof ApiError ? error.message : t('billing.whatsappFailed'));
    } finally {
      setSending(false);
    }
  }

  const isGst = bill?.billingMode === 'GST';

  return (
    <View style={styles.root}>
      <AppHeader
        title={bill?.billNumber ?? t('bills.detailTitle')}
        subtitle={bill ? new Date(bill.billDate).toLocaleDateString('en-IN') : undefined}
        onBack={() => navigation.goBack()}
      />

      <Screen>
        {loading ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}

        {failure ? (
          <Banner tone={failure.isOffline ? 'offline' : 'error'} title={failure.title} body={failure.body} />
        ) : null}

        {serverMessage ? <Banner tone="error" title={serverMessage} /> : null}

        {bill ? (
          <>
            {/* A revised bill announces itself. The customer may be holding a
                printed copy of an earlier version, and the counter needs to
                know that before an argument starts. */}
            {bill.revisionCount > 0 ? (
              <Banner
                tone="warning"
                title={t('bills.revisedTitle', { count: bill.revisionCount })}
                body={
                  bill.lastRevisedAt
                    ? t('bills.revisedBody', { date: new Date(bill.lastRevisedAt).toLocaleString('en-IN') })
                    : undefined
                }
              />
            ) : null}

            <Card style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryText}>
                  <Text style={styles.customerName} numberOfLines={1}>
                    {bill.customerNameSnapshot ?? t('billing.walkIn')}
                  </Text>
                  <Text style={styles.customerSub}>
                    {t('bills.placeOfSupply')}: {bill.placeOfSupplyState}
                  </Text>
                  {isGst && bill.customerGstin ? (
                    <Text style={styles.customerSub}>{t('billing.gstin', { value: bill.customerGstin })}</Text>
                  ) : null}
                </View>
                <BillModeBadge mode={bill.billingMode} />
              </View>
            </Card>

            <View>
              <SectionHeader title={t('billing.items')} />
              <Card padded={false} style={styles.itemsCard}>
                {bill.items?.map((item, index) => (
                  <View key={item.id} style={[styles.itemRow, index > 0 && styles.itemRowDivided]}>
                    <View style={styles.itemText}>
                      <Text style={styles.itemName} numberOfLines={1}>
                        {item.productName}
                      </Text>
                      <Text style={styles.itemSub}>
                        {formatQty(item.qty)} {item.unit === 'METER' ? 'm' : '×'} @ ₹{formatMoney(item.rate)}
                        {item.discountAmount > 0 ? ` − ₹${formatMoney(item.discountAmount)}` : ''}
                      </Text>
                    </View>
                    <Text style={styles.itemTotal}>₹{formatMoney(item.lineTotal)}</Text>
                  </View>
                ))}
              </Card>
            </View>

            <Card style={styles.totalsCard}>
              <AmountRow label={t('billing.subTotal')} value={`₹${formatMoney(bill.subTotal)}`} />
              {bill.lineDiscountTotal + bill.billDiscountAmount > 0 ? (
                <AmountRow
                  label={t('billing.discount')}
                  value={`− ₹${formatMoney(bill.lineDiscountTotal + bill.billDiscountAmount)}`}
                />
              ) : null}
              {isGst ? <AmountRow label={t('billing.taxableValue')} value={`₹${formatMoney(bill.taxableValue)}`} /> : null}
              {isGst && bill.taxType === 'CGST_SGST' ? (
                <>
                  <AmountRow label={t('billing.cgst')} value={`₹${formatMoney(bill.cgstAmount)}`} />
                  <AmountRow label={t('billing.sgst')} value={`₹${formatMoney(bill.sgstAmount)}`} />
                </>
              ) : null}
              {isGst && bill.taxType === 'IGST' ? (
                <AmountRow label={t('billing.igst')} value={`₹${formatMoney(bill.igstAmount)}`} />
              ) : null}
              {bill.roundOff !== 0 ? (
                <AmountRow label="Round off" value={`₹${formatMoney(bill.roundOff)}`} />
              ) : null}
              <View style={styles.grandTotalRow}>
                <AmountRow label={t('billing.total')} value={`₹${formatMoney(bill.grandTotal)}`} strong />
              </View>
              {bill.dueAmount > 0 ? (
                <AmountRow label={t('bills.due')} value={`₹${formatMoney(bill.dueAmount)}`} />
              ) : null}
            </Card>

            <View style={styles.actions}>
              <Button
                label={sharing ? t('billing.openingPdf') : t('billing.viewPdf')}
                onPress={() => void handleSharePdf()}
                variant="indigo"
                loading={sharing}
                icon={<FileText size={18} color={colors.onPrimary} strokeWidth={ICON_STROKE} />}
              />
              <Button
                label={t('billing.whatsapp')}
                onPress={() => void handleWhatsApp()}
                variant="whatsapp"
                loading={sending}
                icon={<Share2 size={18} color="#FFFFFF" strokeWidth={ICON_STROKE} />}
              />

              {/* A cancelled bill is not corrected, it is replaced — so the
                  edit route is simply absent rather than offered and refused. */}
              {canEdit && bill.status === 'FINAL' ? (
                <Button
                  label={t('bills.edit')}
                  onPress={() => navigation.navigate('BillEdit', { billId: bill.id })}
                  variant="outline"
                  icon={<Pencil size={18} color={colors.primary} strokeWidth={ICON_STROKE} />}
                />
              ) : null}

              {bill.revisionCount > 0 ? (
                <Button
                  label={t('bills.editHistory')}
                  onPress={() =>
                    navigation.navigate('BillRevisions', { billId: bill.id, billNumber: bill.billNumber })
                  }
                  variant="outline"
                  icon={<History size={18} color={colors.primary} strokeWidth={ICON_STROKE} />}
                />
              ) : null}
            </View>
          </>
        ) : null}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  spinner: { marginTop: spacing.xxxl },

  summaryCard: { paddingVertical: spacing.md },
  summaryHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  summaryText: { flex: 1, gap: 2 },
  customerName: { ...type.bodyStrong, color: colors.text },
  customerSub: { ...type.small, color: colors.muted },

  itemsCard: { overflow: 'hidden' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  itemRowDivided: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  itemText: { flex: 1, gap: 2 },
  itemName: { ...type.body, color: colors.text },
  itemSub: { ...type.small, color: colors.muted, ...tabularNumbers },
  itemTotal: { ...type.money, color: colors.text },

  totalsCard: { gap: spacing.xs },
  amountRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  amountLabel: { ...type.small, color: colors.muted },
  amountLabelStrong: { ...type.h3, color: colors.text },
  amountValue: { ...type.small, color: colors.text, ...tabularNumbers },
  amountValueStrong: { ...type.kpiSmall, color: colors.primary },
  grandTotalRow: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  actions: { gap: spacing.md },
});
