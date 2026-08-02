import type { BillingMode } from '../api/types';

/** Mirrors the backend's `financialYearLabel` — Apr–Mar, so Aug 2026 and Mar 2027 are both "FY27". */
export function financialYearLabel(date: Date): string {
  const fyEndYear = date.getMonth() >= 3 ? date.getFullYear() + 1 : date.getFullYear();
  return `FY${String(fyEndYear).slice(-2)}`;
}

const PREFIX_BY_MODE: Record<BillingMode, string> = {
  GST: 'T',
  NON_GST: 'E',
};

/**
 * A display-only preview of the number the next bill in this mode will get.
 * There is no server endpoint to peek the counter without claiming it, so
 * this estimates from the most recent bill of the same mode and financial
 * year — accurate for the common case, but the number stamped on the actual
 * bill (returned by `POST /bills`) is always the source of truth.
 */
export function previewNextBillNumber(mode: BillingMode, lastSeqThisFy: number | null): string {
  const fy = financialYearLabel(new Date());
  const prefix = PREFIX_BY_MODE[mode];
  const nextSeq = (lastSeqThisFy ?? 0) + 1;
  return `${fy}/${prefix}/${String(nextSeq).padStart(5, '0')}`;
}
