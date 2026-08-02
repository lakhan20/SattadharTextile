import { randomUUID } from 'node:crypto';
import { BillingMode } from '@prisma/client';
import type { PrismaClientOrTx } from '../../config/prisma';

/** Indian financial year: Apr–Mar. Aug 2026 and Mar 2027 are both "FY27". */
export function financialYearLabel(date: Date): string {
  const fyEndYear = date.getMonth() >= 3 /* April */ ? date.getFullYear() + 1 : date.getFullYear();
  return `FY${String(fyEndYear).slice(-2)}`;
}

const PREFIX_BY_MODE: Record<BillingMode, string> = {
  [BillingMode.GST]: 'T',
  [BillingMode.NON_GST]: 'E',
};

export interface NextBillNumber {
  fy: string;
  seq: number;
  billNumber: string;
}

/**
 * Atomically claims the next sequence number for (fy, billingMode).
 *
 * INSERT ... ON CONFLICT DO UPDATE is a single statement, so concurrent
 * callers serialize on the row's unique index instead of racing a
 * read-then-write — two staff billing at the same instant can never receive
 * the same number. Must run inside the caller's bill-creation transaction.
 */
export async function nextBillNumber(tx: PrismaClientOrTx, billingMode: BillingMode): Promise<NextBillNumber> {
  const fy = financialYearLabel(new Date());
  const prefix = PREFIX_BY_MODE[billingMode];
  const id = randomUUID();

  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO number_series (id, fy, "billingMode", prefix, "lastNumber", "createdAt", "updatedAt")
    VALUES (${id}, ${fy}, ${billingMode}::"BillingMode", ${prefix}, 1, now(), now())
    ON CONFLICT (fy, "billingMode")
    DO UPDATE SET "lastNumber" = number_series."lastNumber" + 1, "updatedAt" = now()
    RETURNING "lastNumber"
  `;

  const seq = rows[0]!.lastNumber;
  const billNumber = `${fy}/${prefix}/${String(seq).padStart(5, '0')}`;
  return { fy, seq, billNumber };
}
