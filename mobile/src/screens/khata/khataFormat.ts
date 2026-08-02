import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { LedgerEntryType } from '../../api/types';
import { colors } from '../../theme';
import { formatMoney, formatRupees } from '../../utils/money';

/**
 * ── Reading a khata at a glance ──────────────────────────────────────────
 *
 * Colour carries one meaning across every khata screen, and only one:
 *
 *   danger  → money the customer owes the shop
 *   success → money the shop has received
 *
 * So a credit sale and a debit note are both danger-side even though they are
 * different kinds of entry, and a payment and a credit note are both
 * success-side. The badge label says *which* kind it was; the colour only ever
 * says which way the balance moved. Nothing in this module uses the mulberry
 * accent — that stays reserved for the one primary action on the screen.
 */

export interface EntryTone {
  bg: string;
  fg: string;
  labelKey: `khata.type${LedgerEntryType}`;
}

export const ENTRY_TONE: Record<LedgerEntryType, EntryTone> = {
  // The opening balance predates the app. Neutral-informational: it is a fact
  // carried over, not something that happened at this counter.
  OPENING: { bg: colors.infoSoft, fg: colors.infoInk, labelKey: 'khata.typeOPENING' },
  CREDIT_SALE: { bg: colors.primarySoft, fg: colors.primaryInk, labelKey: 'khata.typeCREDIT_SALE' },
  PAYMENT: { bg: colors.successSoft, fg: colors.successInk, labelKey: 'khata.typePAYMENT' },
  DEBIT_NOTE: { bg: colors.warningSoft, fg: colors.warningInk, labelKey: 'khata.typeDEBIT_NOTE' },
  // A credit note reduces a balance but is not money received, so it is
  // deliberately quieter than a payment — a shopkeeper scanning the column
  // should not mistake a write-off for cash in hand.
  CREDIT_NOTE: { bg: colors.surfaceSunken, fg: colors.muted, labelKey: 'khata.typeCREDIT_NOTE' },
};

/**
 * The colour a balance should be shown in.
 *
 * A negative balance is an advance the shop is holding, which is neither owed
 * nor settled — it is shown in the success colour because, from the shop's
 * side of the counter, it is money already in the till.
 */
export function balanceTone(outstanding: number): { color: string; owes: boolean } {
  if (outstanding > 0) return { color: colors.danger, owes: true };
  if (outstanding < 0) return { color: colors.success, owes: false };
  return { color: colors.muted, owes: false };
}

/** "+₹1,250.00" / "−₹500.00". The minus is U+2212, not a hyphen. */
export function formatSignedRupees(amount: number, direction: 'DEBIT' | 'CREDIT'): string {
  return `${direction === 'DEBIT' ? '+' : '−'}${formatRupees(Math.abs(amount))}`;
}

/** "1 Aug 2026, 4:12 pm" — matches the stock ledger, which reads the same way. */
export function formatMoment(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${date.toLocaleTimeString(
    'en-IN',
    { hour: 'numeric', minute: '2-digit' },
  )}`;
}

export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * A balance phrased the way the shopkeeper would say it out loud, rather than
 * a bare number with a sign the reader has to interpret.
 */
export function useBalanceCopy() {
  const { t } = useTranslation();

  return useCallback(
    (outstanding: number): string => {
      if (outstanding > 0) return formatRupees(outstanding);
      if (outstanding < 0) return t('khata.shopHolds', { amount: formatRupees(Math.abs(outstanding)) });
      return t('khata.nothingOwed');
    },
    [t],
  );
}

export { formatMoney, formatRupees };
