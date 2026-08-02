import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AnimatedMoney } from '../../components/AnimatedMoney';
import { Button } from '../../components/Button';
import { SelvedgeEdge } from '../../components/Selvedge';
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

/**
 * One entry in the breakdown strip: a muted label with its figure beside it.
 *
 * These used to be full-width label/value rows. Four of them — taxable,
 * discount, CGST, SGST — stacked to roughly a third of a small phone's screen
 * for information nobody reads twice: the counter watches the grand total and
 * checks the breakdown once, if at all. Inline they cost one line, wrap to two
 * on a narrow phone, and every figure is still on screen.
 */
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.meta}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
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
      {/* The bill's finished edge. The dock is where the document ends, which
          is the one place on this screen the selvedge belongs. */}
      <SelvedgeEdge />

      <View style={styles.metaRow}>
        <Meta
          label={isGst ? t('billing.taxableValue') : t('billing.subTotal')}
          value={`₹${formatMoney(isGst ? preview.taxableValue : preview.subTotal)}`}
        />

        {preview.totalDiscount > 0 ? (
          <Meta label={t('billing.discount')} value={`− ₹${formatMoney(preview.totalDiscount)}`} />
        ) : null}

        {isGst && taxType === 'CGST_SGST' ? (
          <>
            <Meta label={t('billing.cgst')} value={`₹${formatMoney(preview.cgstAmount)}`} />
            <Meta label={t('billing.sgst')} value={`₹${formatMoney(preview.sgstAmount)}`} />
          </>
        ) : null}

        {isGst && taxType === 'IGST' ? (
          <Meta label={t('billing.igst')} value={`₹${formatMoney(preview.igstAmount)}`} />
        ) : null}
      </View>

      {/*
        The total and the action share a row.
        Stacked, they were the two heaviest things on the screen sitting one
        above the other and the dock swallowed the line list. Side by side the
        eye lands on the figure and the thumb is already next to the button —
        which is the actual sequence at the counter: read the total out, then
        commit it.
      */}
      <View style={styles.totalRow}>
        <View style={styles.totalBlock}>
          <Text style={styles.totalLabel}>{t('billing.total')}</Text>
          <AnimatedMoney
            style={styles.totalValue}
            value={`₹${formatMoney(preview.grandTotal)}`}
            numberOfLines={1}
            adjustsFontSizeToFit
          />
        </View>

        {created ? null : (
          <Button
            label={generating ? t('billing.generating') : t('billing.generate')}
            onPress={onGenerate}
            variant="accent"
            loading={generating}
            disabled={!canGenerate}
            fullWidth={false}
            style={styles.generate}
          />
        )}
      </View>

      {/* Two equal follow-ups, so they keep a row of their own. This state is
          transient — the bill is written and the counter is about to start the
          next one — so it can afford the height the editing state cannot. */}
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
      ) : null}
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
    paddingTop: spacing.md,
    gap: spacing.sm,
    ...shadow.raised,
  },

  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    // Column gap is generous and row gap tight: the pairs need air between
    // them to read as separate figures, but a wrapped second line should sit
    // close enough to still read as one strip.
    columnGap: spacing.md,
    rowGap: spacing.xs,
  },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  metaLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  metaValue: { ...type.caption, color: colors.text, ...tabularNumbers },

  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  // Takes the slack so the button keeps its natural width and the figure
  // shrinks first on a narrow phone.
  totalBlock: { flex: 1, minWidth: 0 },
  totalLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  totalValue: { ...type.kpi, color: colors.primary },
  // A floor, not a width: a seven-figure total must never squeeze the one
  // action that commits the bill down to an unreadable stub.
  generate: { minWidth: 132 },

  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});
