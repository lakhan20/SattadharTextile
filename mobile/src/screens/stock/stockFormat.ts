import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { StockMovementType, Unit } from '../../api/types';
import { colors } from '../../theme';
import { formatQty } from '../../utils/money';

/**
 * Quantities are shown with their unit attached — "12.5 m", "3 pcs" — because
 * a bare number on a stock screen is ambiguous in a shop that sells both by
 * the metre and by the piece.
 */
export function useStockFormat() {
  const { t } = useTranslation();

  const unitLabel = useCallback(
    (unit: Unit) => (unit === 'METER' ? t('stock.unitShortMeter') : t('stock.unitShortPiece')),
    [t],
  );

  const formatStock = useCallback(
    (qty: number, unit: Unit) => `${formatQty(qty)} ${unitLabel(unit)}`,
    [unitLabel],
  );

  /** Ledger rows read "+40 m" / "−3.5 m" — the sign carries the direction. */
  const formatSigned = useCallback(
    (qty: number, unit: Unit) => `${qty > 0 ? '+' : qty < 0 ? '−' : ''}${formatStock(Math.abs(qty), unit)}`,
    [formatStock],
  );

  return { formatStock, formatSigned, unitLabel };
}

interface MovementTone {
  bg: string;
  fg: string;
  /** i18n key for the badge label. */
  labelKey: string;
}

/**
 * Inward green, sales in the brand teal, corrections in mulberry — the accent
 * is doing what it does everywhere else: marking the deliberate human action
 * rather than the routine one.
 */
export const MOVEMENT_TONE: Record<StockMovementType, MovementTone> = {
  OPENING: { bg: colors.primarySoft, fg: colors.primaryInk, labelKey: 'stock.typeOpening' },
  STOCK_IN: { bg: colors.successSoft, fg: colors.successInk, labelKey: 'stock.typeStockIn' },
  SALE: { bg: colors.primarySoft, fg: colors.primaryInk, labelKey: 'stock.typeSale' },
  SALE_RETURN: { bg: colors.successSoft, fg: colors.successInk, labelKey: 'stock.typeSaleReturn' },
  ADJUSTMENT: { bg: colors.accentSoft, fg: colors.accentInk, labelKey: 'stock.typeAdjustment' },
  BILL_CANCELLED: { bg: colors.warningSoft, fg: colors.warningInk, labelKey: 'stock.typeBillCancelled' },
};
