import { StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Receipt } from 'lucide-react-native';
import { Card } from '../../components/Card';
import type { LedgerEntry } from '../../api/types';
import { ICON_STROKE, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { ENTRY_TONE, formatMoment, formatRupees, formatSignedRupees } from './khataFormat';

/**
 * One line of the khata.
 *
 * The layout answers the three questions a shopkeeper asks in order — what
 * kind of entry, how much, and what the balance stood at afterwards — with the
 * running balance pinned bottom-right so the column reads straight down the
 * page in tabular figures.
 */
export function LedgerEntryRow({ entry }: { entry: LedgerEntry }) {
  const { t } = useTranslation();
  const tone = ENTRY_TONE[entry.type];
  const owed = entry.direction === 'DEBIT';

  // A payment's mode is worth showing; a credit sale has none, and the enum's
  // other values never reach a khata row.
  const modeLabel =
    entry.type === 'PAYMENT' && entry.paymentMode
      ? t(`khata.mode${entry.paymentMode}` as 'khata.modeCASH', { defaultValue: entry.paymentMode })
      : null;

  const reference = entry.billNumber
    ? t('khata.againstBill', { number: entry.billNumber })
    : entry.noteNumber
      ? t('khata.noteNumber', { number: entry.noteNumber })
      : entry.receiptNumber
        ? t('khata.receipt', { number: entry.receiptNumber })
        : null;

  return (
    <Card style={styles.row}>
      <View style={styles.top}>
        <View style={styles.badgeRow}>
          <View style={[styles.badge, { backgroundColor: tone.bg }]}>
            <Text style={[styles.badgeText, { color: tone.fg }]}>{t(tone.labelKey)}</Text>
          </View>
          {modeLabel ? <Text style={styles.mode}>{modeLabel}</Text> : null}
        </View>

        <Text style={[styles.amount, owed ? styles.amountOwed : styles.amountPaid]}>
          {formatSignedRupees(entry.amount, entry.direction)}
        </Text>
      </View>

      {entry.note ? (
        <Text style={styles.note} numberOfLines={3}>
          {entry.note}
        </Text>
      ) : null}

      {reference ? (
        <View style={styles.metaRow}>
          <Receipt size={12} color={colors.muted} strokeWidth={ICON_STROKE} />
          <Text style={styles.meta}>{reference}</Text>
        </View>
      ) : null}

      <View style={styles.bottom}>
        <Text style={styles.moment} numberOfLines={1}>
          {formatMoment(entry.entryDate)}
          {entry.createdByName ? ` · ${t('khata.byUser', { name: entry.createdByName })}` : ''}
        </Text>
        <Text style={styles.balance}>
          {t('khata.balanceAfter')} {formatRupees(entry.balanceAfter)}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: spacing.sm, gap: spacing.xs },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  badge: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill },
  badgeText: { ...type.caption, textTransform: 'uppercase' },
  mode: { ...type.caption, color: colors.muted },

  amount: { ...type.kpiSmall, ...tabularNumbers },
  amountOwed: { color: colors.danger },
  amountPaid: { color: colors.success },

  note: { ...type.body, color: colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  meta: { ...type.small, color: colors.muted, flexShrink: 1 },

  bottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  moment: { ...type.caption, color: colors.muted, flexShrink: 1 },
  balance: { ...type.smallStrong, color: colors.text, ...tabularNumbers },
});
