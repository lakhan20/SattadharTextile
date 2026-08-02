import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Banknote, BookUser, Building2, CreditCard, ReceiptText, Smartphone } from 'lucide-react-native';
import { TextField } from '../../components/TextField';
import type { PaymentMode } from '../../api/types';
import { ICON_STROKE, TAP_TARGET, colors, radius, spacing, tabularNumbers, type } from '../../theme';
import { formatMoney } from '../../utils/money';

/**
 * How the bill is being settled — chosen on the billing screen, where the
 * money actually changes hands.
 *
 * Until this existed the app sent no payment mode at all, so every bill was
 * recorded as paid in cash and a khata sale could not be written from the
 * counter. That is why selling on credit needed a detour through the customer
 * form: the shortest path to a credit sale ran outside the billing screen.
 *
 * CREDIT is visually separated from the settled modes because it is not a way
 * of paying — it is the decision not to be paid today, and it puts the amount
 * on someone's khata.
 */

const SETTLED_MODES: { value: PaymentMode; labelKey: string; Icon: typeof Banknote }[] = [
  { value: 'CASH', labelKey: 'billing.paymentCash', Icon: Banknote },
  { value: 'UPI', labelKey: 'billing.paymentUpi', Icon: Smartphone },
  { value: 'BANK', labelKey: 'billing.paymentBank', Icon: Building2 },
  { value: 'CARD', labelKey: 'billing.paymentCard', Icon: CreditCard },
  { value: 'CHEQUE', labelKey: 'billing.paymentCheque', Icon: ReceiptText },
];

interface PaymentPanelProps {
  mode: PaymentMode;
  onModeChange: (mode: PaymentMode) => void;
  /** Blank means "the whole bill", which is what a settled mode implies. */
  paidText: string;
  onPaidChange: (value: string) => void;
  grandTotal: number;
  /** A credit sale needs someone to chase — a saved customer or a phone number. */
  creditAllowed: boolean;
  creditBlockedReason?: string;
  disabled?: boolean;
}

export function PaymentPanel({
  mode,
  onModeChange,
  paidText,
  onPaidChange,
  grandTotal,
  creditAllowed,
  creditBlockedReason,
  disabled = false,
}: PaymentPanelProps) {
  const { t } = useTranslation();

  const isCredit = mode === 'CREDIT';
  const paid = isCredit ? Number(paidText) || 0 : paidText.trim() === '' ? grandTotal : Number(paidText) || 0;
  const due = Math.max(0, Math.round((grandTotal - paid) * 100) / 100);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{t('billing.paymentMode')}</Text>

      <View style={styles.modeGrid}>
        {SETTLED_MODES.map(({ value, labelKey, Icon }) => {
          const active = mode === value;
          return (
            <Pressable
              key={value}
              onPress={() => onModeChange(value)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active, disabled }}
              style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
            >
              <Icon size={15} color={active ? colors.onPrimary : colors.muted} strokeWidth={ICON_STROKE} />
              <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{t(labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* On its own row, in danger tones when chosen: this is the one option
          that leaves the shop out of pocket at the end of the sale. */}
      <Pressable
        onPress={() => creditAllowed && onModeChange('CREDIT')}
        disabled={disabled || !creditAllowed}
        accessibilityRole="button"
        accessibilityState={{ selected: isCredit, disabled: disabled || !creditAllowed }}
        style={[
          styles.creditChip,
          isCredit && styles.creditChipActive,
          (!creditAllowed || disabled) && styles.chipDisabled,
        ]}
      >
        <BookUser
          size={16}
          color={isCredit ? colors.onAccent : creditAllowed ? colors.danger : colors.faint}
          strokeWidth={ICON_STROKE}
        />
        <Text
          style={[
            styles.creditLabel,
            isCredit && styles.creditLabelActive,
            !creditAllowed && styles.creditLabelDisabled,
          ]}
        >
          {t('billing.paymentCredit')}
        </Text>
      </Pressable>

      {!creditAllowed && creditBlockedReason ? (
        <Text style={styles.blockedHint}>{creditBlockedReason}</Text>
      ) : null}

      {/* A part payment is the common case on khata: some cash now, the rest
          on the book. Offered for every mode, because a partly-paid cash bill
          is just as real. */}
      <View style={styles.amountRow}>
        <TextField
          label={t('billing.amountReceived')}
          value={paidText}
          onChangeText={(next) => onPaidChange(next.replace(/[^0-9.]/g, ''))}
          placeholder={isCredit ? '0.00' : formatMoney(grandTotal)}
          keyboardType="decimal-pad"
          editable={!disabled}
          containerStyle={styles.amountField}
        />
        <View style={styles.dueBlock}>
          <Text style={styles.dueLabel}>{t('billing.dueLabel')}</Text>
          <Text style={[styles.dueValue, due > 0 ? styles.dueOwed : styles.dueSettled]}>
            ₹{formatMoney(due)}
          </Text>
        </View>
      </View>

      {due > 0 ? (
        <Text style={styles.khataHint}>{t('billing.goesOnKhata', { amount: formatMoney(due) })}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...type.smallStrong, color: colors.text },

  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: TAP_TARGET - 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipDisabled: { opacity: 0.45 },
  chipLabel: { ...type.smallStrong, color: colors.muted },
  chipLabelActive: { color: colors.onPrimary },

  creditChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: TAP_TARGET - 8,
    marginTop: spacing.xs,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
    backgroundColor: colors.dangerSoft,
  },
  creditChipActive: { backgroundColor: colors.danger, borderColor: colors.danger },
  creditLabel: { ...type.button, color: colors.danger },
  creditLabelActive: { color: colors.onAccent },
  creditLabelDisabled: { color: colors.faint },
  blockedHint: { ...type.caption, color: colors.muted },

  amountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md, marginTop: spacing.xs },
  amountField: { flex: 1 },
  dueBlock: { alignItems: 'flex-end', paddingBottom: spacing.sm, minWidth: 110 },
  dueLabel: { ...type.caption, color: colors.muted, textTransform: 'uppercase' },
  dueValue: { ...type.kpiSmall, ...tabularNumbers },
  dueOwed: { color: colors.danger },
  dueSettled: { color: colors.success },

  khataHint: { ...type.caption, color: colors.muted },
});
