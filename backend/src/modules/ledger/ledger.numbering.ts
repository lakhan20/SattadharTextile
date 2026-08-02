import { randomUUID } from 'node:crypto';
import type { PrismaClientOrTx } from '../../config/prisma';
import { financialYearLabel } from '../bills/bills.numbering';

/** RCPT/FY27/00001 · CN/FY27/00001 · DN/FY27/00001 */
export type DocKind = 'RCPT' | 'CN' | 'DN';

/**
 * Atomically claims the next number for (kind, fy), by exactly the mechanism
 * `nextBillNumber` uses: INSERT … ON CONFLICT DO UPDATE is a single statement,
 * so concurrent callers serialize on the unique index instead of racing a
 * read-then-write. Two staff writing a receipt at the same instant can never
 * be handed the same receipt number.
 *
 * Must run inside the caller's transaction — if the payment rolls back, so
 * must the number, or the series grows a permanent gap.
 */
export async function nextDocNumber(tx: PrismaClientOrTx, kind: DocKind): Promise<string> {
  const fy = financialYearLabel(new Date());

  const rows = await tx.$queryRaw<{ lastNumber: number }[]>`
    INSERT INTO doc_series (id, kind, fy, "lastNumber", "createdAt", "updatedAt")
    VALUES (${randomUUID()}, ${kind}, ${fy}, 1, now(), now())
    ON CONFLICT (kind, fy)
    DO UPDATE SET "lastNumber" = doc_series."lastNumber" + 1, "updatedAt" = now()
    RETURNING "lastNumber"
  `;

  return `${kind}/${fy}/${String(rows[0]!.lastNumber).padStart(5, '0')}`;
}
