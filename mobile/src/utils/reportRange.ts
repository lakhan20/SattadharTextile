/**
 * Date-range presets for the report screens.
 *
 * These produce plain "YYYY-MM-DD" strings from the *device's* calendar, which
 * for a shop in Gujarat is IST — the same clock the server resolves the range
 * against. A phone left on another timezone could pick a neighbouring day at
 * midnight; the server still interprets whatever date it is sent as IST, so
 * the two never disagree about what a given date *means*, only about which
 * date "today" is on a misconfigured device.
 */

export type RangePreset = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'THIS_FY' | 'CUSTOM';

/** Every preset except CUSTOM, which is not a range so much as the absence of one. */
export type ConcretePreset = Exclude<RangePreset, 'CUSTOM'>;

/** What a report screen offers: periods an owner reconciles against. */
export const REPORT_PRESETS: ConcretePreset[] = ['TODAY', 'THIS_MONTH', 'THIS_FY'];

/**
 * What the bills list offers. Narrower and nearer, because looking up a bill
 * is a counter task — "the one I wrote an hour ago", "the one from yesterday
 * the customer is asking about" — not an accounting one.
 */
export const BILL_PRESETS: ConcretePreset[] = ['TODAY', 'YESTERDAY', 'THIS_WEEK', 'THIS_MONTH'];

export interface DateRange {
  /** Inclusive, "YYYY-MM-DD". */
  from: string;
  /** Inclusive, "YYYY-MM-DD". */
  to: string;
}

const pad = (value: number): string => String(value).padStart(2, '0');

export const toDateKey = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function parseDateKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key.trim());
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  // Rejects 2026-02-31, which the Date constructor would happily roll over.
  return toDateKey(date) === key.trim() ? date : null;
}

/** The Indian financial year runs 1 April → 31 March. */
export function financialYearBounds(now = new Date()): DateRange & { label: string } {
  const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    from: `${startYear}-04-01`,
    to: `${startYear + 1}-03-31`,
    label: `FY${String(startYear + 1).slice(-2)}`,
  };
}

export function rangeForPreset(preset: ConcretePreset, now = new Date()): DateRange {
  if (preset === 'TODAY') {
    const today = toDateKey(now);
    return { from: today, to: today };
  }
  if (preset === 'YESTERDAY') {
    const key = toDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    return { from: key, to: key };
  }
  if (preset === 'THIS_WEEK') {
    // Monday-to-today, not a rolling seven days: a shopkeeper asking for "this
    // week" means the week they are in, and the answer should not change
    // meaning depending on which day they ask.
    const dayOfWeek = (now.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
    return { from: toDateKey(monday), to: toDateKey(now) };
  }
  if (preset === 'THIS_MONTH') {
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: toDateKey(first), to: toDateKey(last) };
  }
  const fy = financialYearBounds(now);
  return { from: fy.from, to: fy.to };
}

/** "01 Aug 2026" — how a range reads in the header of a report screen. */
export function formatDateKey(key: string): string {
  const parsed = parseDateKey(key);
  if (!parsed) return key;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${pad(parsed.getDate())} ${MONTHS[parsed.getMonth()]} ${parsed.getFullYear()}`;
}

/** A single day collapses to one date rather than repeating it either side of a dash. */
export function formatRange(range: DateRange): string {
  return range.from === range.to
    ? formatDateKey(range.from)
    : `${formatDateKey(range.from)} — ${formatDateKey(range.to)}`;
}

/**
 * Which preset a range corresponds to, so the chip row can show it selected.
 *
 * Only the presets a screen actually offers are checked. Otherwise the bills
 * list would report "yesterday" on a report screen that has no such chip, and
 * nothing at all would look selected.
 */
export function detectPreset(
  range: DateRange,
  candidates: ConcretePreset[] = REPORT_PRESETS,
  now = new Date(),
): RangePreset {
  for (const preset of candidates) {
    const candidate = rangeForPreset(preset, now);
    if (candidate.from === range.from && candidate.to === range.to) return preset;
  }
  return 'CUSTOM';
}
