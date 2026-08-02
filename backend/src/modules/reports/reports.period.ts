import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * ── The shop's clock ─────────────────────────────────────────────────────
 *
 * `billDate` is a `timestamptz`, so every instant is stored in UTC. A
 * shopkeeper in Gujarat does not think in UTC: "today" is the IST calendar
 * day, and a bill written at 11:40 pm on the 31st belongs to that month, not
 * the next one. Every range in this file is therefore built by taking an IST
 * *calendar date*, then converting its midnight back to the UTC instant the
 * database compares against.
 *
 * Ranges are half-open — `from` inclusive, `to` EXCLUSIVE. That is the only
 * way consecutive periods can neither double-count a bill on the boundary nor
 * drop one written in the last second of a day (`<= 23:59:59` silently loses
 * 23:59:59.500).
 */

export const SHOP_TIME_ZONE = 'Asia/Kolkata';

export interface ShopRange {
  /** Inclusive lower bound, as a UTC instant. */
  from: Date;
  /** EXCLUSIVE upper bound, as a UTC instant. */
  to: Date;
  /** IST calendar date of `from`, e.g. "2026-08-01" — for report headers. */
  fromLabel: string;
  /** IST calendar date of the LAST day in range (i.e. `to` minus one day). */
  toLabel: string;
}

/** The IST calendar date an instant falls on, as "yyyy-MM-dd". */
export function istDateKey(instant: Date): string {
  return formatInTimeZone(instant, SHOP_TIME_ZONE, 'yyyy-MM-dd');
}

/** Midnight IST on the day `instant` falls on, as a UTC instant. */
export function shopDayStart(instant: Date = new Date()): Date {
  return fromZonedTime(`${istDateKey(instant)}T00:00:00.000`, SHOP_TIME_ZONE);
}

/**
 * Shifts a UTC instant by whole IST calendar days.
 *
 * Adding 24h of milliseconds would be wrong in a zone with daylight saving.
 * India has none today, but re-deriving the calendar date keeps this correct
 * regardless — and costs nothing.
 */
function addShopDays(instant: Date, days: number): Date {
  const [year, month, day] = istDateKey(instant).split('-').map(Number);
  // Date.UTC normalises overflow (Aug 32 → Sep 1) and underflow for us.
  const shifted = new Date(Date.UTC(year!, month! - 1, day! + days));
  return fromZonedTime(`${shifted.toISOString().slice(0, 10)}T00:00:00.000`, SHOP_TIME_ZONE);
}

function labelRange(from: Date, to: Date): ShopRange {
  return {
    from,
    to,
    fromLabel: istDateKey(from),
    // `to` is exclusive, so the last day actually covered is the day before it.
    toLabel: istDateKey(addShopDays(to, -1)),
  };
}

/** Midnight IST today → midnight IST tomorrow. */
export function todayRange(now: Date = new Date()): ShopRange {
  const start = shopDayStart(now);
  return labelRange(start, addShopDays(start, 1));
}

/** The 1st of the current IST month → the 1st of the next. */
export function monthRange(now: Date = new Date()): ShopRange {
  const [year, month] = istDateKey(now).split('-').map(Number);
  const start = fromZonedTime(
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01T00:00:00.000`,
    SHOP_TIME_ZONE,
  );
  const nextMonth = month === 12 ? 1 : month! + 1;
  const nextYear = month === 12 ? year! + 1 : year!;
  const end = fromZonedTime(
    `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000`,
    SHOP_TIME_ZONE,
  );
  return labelRange(start, end);
}

/**
 * The Indian financial year: 1 April → 31 March. Label matches
 * `bills.numbering.financialYearLabel`, so "FY27" on a report and "FY27" in an
 * invoice number mean the same twelve months.
 */
export function financialYearRange(now: Date = new Date()): ShopRange & { label: string } {
  const [year, month] = istDateKey(now).split('-').map(Number);
  const startYear = month! >= 4 ? year! : year! - 1;
  const start = fromZonedTime(`${startYear}-04-01T00:00:00.000`, SHOP_TIME_ZONE);
  const end = fromZonedTime(`${startYear + 1}-04-01T00:00:00.000`, SHOP_TIME_ZONE);
  return { ...labelRange(start, end), label: `FY${String(startYear + 1).slice(-2)}` };
}

/**
 * The last `days` whole IST days, today included — `lastNDays(7)` on a Saturday
 * runs from midnight the previous Sunday to midnight tonight.
 */
export function lastNDaysRange(days: number, now: Date = new Date()): ShopRange {
  const endExclusive = addShopDays(shopDayStart(now), 1);
  return labelRange(addShopDays(endExclusive, -days), endExclusive);
}

/**
 * Turns the `?from=&to=` a client sent into a shop range.
 *
 * Both are read as IST *calendar dates* and `to` is treated as INCLUSIVE, the
 * way a shopkeeper means it — "1st to 31st" covers the whole 31st — so the
 * exclusive bound stored on the range is the following midnight. With neither
 * supplied the range is the current month, which is what every report screen
 * opens on.
 */
export function resolveRange(from?: Date, to?: Date, now: Date = new Date()): ShopRange {
  if (!from && !to) return monthRange(now);

  const start = shopDayStart(from ?? to ?? now);
  const endInclusiveDay = shopDayStart(to ?? from ?? now);
  const end = addShopDays(endInclusiveDay, 1);

  // A reversed range (from after to) is a client bug, not something to error
  // on — read it in the order the user plainly meant.
  return start <= end ? labelRange(start, end) : labelRange(end, addShopDays(start, 1));
}

/** Every IST calendar date in the range, ascending — used to zero-fill trends. */
export function eachShopDay(range: ShopRange): string[] {
  const days: string[] = [];
  let cursor = range.from;
  // Guard against a pathological range producing an unbounded array.
  while (cursor < range.to && days.length < 400) {
    days.push(istDateKey(cursor));
    cursor = addShopDays(cursor, 1);
  }
  return days;
}

/** "01 Aug 2026" — how a date is printed on an exported report. */
export function formatShopDate(instant: Date): string {
  return formatInTimeZone(instant, SHOP_TIME_ZONE, 'dd MMM yyyy');
}

/** "01 Aug 2026, 6:42 pm" — the "generated at" line on an export. */
export function formatShopDateTime(instant: Date): string {
  return formatInTimeZone(instant, SHOP_TIME_ZONE, "dd MMM yyyy, h:mm a");
}

/** Turns "2026-08-01" (as SQL groups it) into "01 Aug 2026" for display. */
export function formatDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(day).padStart(2, '0')} ${MONTHS[month! - 1]} ${year}`;
}
