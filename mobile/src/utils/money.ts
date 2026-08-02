/** Money is always shown to 2dp with grouping, so columns of tabular figures line up. */
export function formatMoney(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export const formatRupees = (value: number): string => `₹${formatMoney(value)}`;

/**
 * METER quantities carry up to 3 decimals but trailing zeros read as noise on
 * a bill line, so 3.500 shows as "3.5" and 4.000 as "4".
 */
export function formatQty(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
