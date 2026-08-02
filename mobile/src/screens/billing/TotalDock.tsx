import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import type { BillingMode, TaxType } from '../../api/types';
import { colors, radius, shadow, spacing, tabularNumbers, type } from '../../theme';
import type { BillPreview } from '../../utils/billCalc';
import { formatMoney } from '../../utils/money';

interface TotalDockProps {
  preview: BillPreview;
  billingMode: BillingMode;
  taxType: TaxType;
  onGenerate: () => void;
  generating: boolean;
  canGenerate: boolean;
  /** Present once the bill exists — swaps in the WhatsApp and New Bill actions. */
  onWhatsApp?: () => void;
  onNewBill?: () => void;
  sending?: boolean;
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, muted && styles.rowLabelMuted]}>{label}</Text>
      <Text style={[styles.rowValue, muted && styles.rowValueMuted]}>{value}</Text>
    </View>
  );
}

export function TotalDock({
  preview,
  billingMode,
  taxType,
  onGenerate,
  generating,
  canGenerate,
  onWhatsApp,
  onNewBill,
  sending = false,
}: TotalDockProps) {
  const { t } = useTranslation();
  const isGst = billingMode === 'GST';
  const created = Boolean(onWhatsApp);

  return (
    <View style={styles.dock}>
      <View style={styles.rows}>
        <Row label={isGst ? t('billing.taxableValue') : t('billing.subTotal')} value={`₹${formatMoney(isGst ? preview.taxableValue : preview.subTotal)}`} muted />

        {preview.totalDiscount > 0 ? (
          <Row label={t('billing.discount')} value={`− ₹${formatMoney(preview.totalDiscount)}`} muted />
        ) : null}

        {isGst && taxType === 'CGST_SGST' ? (
          <>
            <Row label={t('billing.cgst')} value={`₹${formatMoney(preview.cgstAmount)}`} muted />
            <Row label={t('billing.sgst')} value={`₹${formatMoney(preview.sgstAmount)}`} muted />
          </>
        ) : null}

        {isGst && taxType === 'IGST' ? (
          <Row label={t('billing.igst')} value={`₹${formatMoney(preview.igstAmount)}`} muted />
        ) : null}

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('billing.total')}</Text>
          <Text style={styles.totalValue}>₹{formatMoney(preview.grandTotal)}</Text>
        </View>
      </View>

      {created ? (
        <View style={styles.actions}>
          <Button
            label={t('billing.whatsapp')}
            onPress={onWhatsApp!}
            variant="whatsapp"
            loading={sending}
            style={styles.action}
          />
          <Button label={t('billing.newBill')} onPress={onNewBill!} variant="outline" style={styles.action} />
        </View>
      ) : (
        <Button
          label={generating ? t('billing.generating') : t('billing.generate')}
          onPress={onGenerate}
          variant="indigo"
          loading={generating}
          disabled={!canGenerate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.md,
    ...shadow.raised,
  },
  rows: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { ...type.small, color: colors.text },
  rowLabelMuted: { color: colors.muted },
  rowValue: { ...type.money, color: colors.text },
  rowValueMuted: { ...type.small, color: colors.muted, ...tabularNumbers },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  totalLabel: { ...type.h3, color: colors.text },
  totalValue: { ...type.kpi, color: colors.primary },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});
