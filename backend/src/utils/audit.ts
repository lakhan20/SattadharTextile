import { Prisma, type AuditAction } from '@prisma/client';
import type { Request } from 'express';
import { prisma, type PrismaClientOrTx } from '../config/prisma';
import { logger } from '../config/logger';

/** Keys never written to the audit trail, at any nesting depth. */
const SECRET_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'secret',
  'authorization',
]);

function sanitise(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value ?? null;
  if (value instanceof Date) return value.toISOString();
  if (Prisma.Decimal.isDecimal(value)) return value.toString();
  if (Array.isArray(value)) return value.map((item) => sanitise(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_KEYS.has(key.toLowerCase()) ? '[redacted]' : sanitise(val, depth + 1);
    }
    return out;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

const toJson = (value: unknown): Prisma.InputJsonValue | undefined =>
  value === undefined ? undefined : (sanitise(value) as Prisma.InputJsonValue);

export interface AuditInput {
  /** Null for anonymous events such as a failed login on an unknown username. */
  userId: string | null;
  action: AuditAction;
  /** Model name: "User", "Bill", "Product", … */
  entity: string;
  entityId?: string | null;
  /** State before the change. Omit on create. */
  before?: unknown;
  /** State after the change. Omit on delete. */
  after?: unknown;
  /** Supplies ip + userAgent, and userId when not passed explicitly. */
  req?: Request;
  /** Join the caller's interactive transaction so the log commits atomically. */
  tx?: PrismaClientOrTx;
}

/**
 * Appends one row to `audit_logs`.
 *
 * Never throws: a failed audit write is logged loudly but must not turn a
 * successful business operation into a 500 for the user at the counter.
 * Pass `tx` when the audit must roll back with the operation it describes.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  const client = input.tx ?? prisma;
  const userId = input.userId ?? input.req?.user?.id ?? null;

  try {
    await client.auditLog.create({
      data: {
        userId,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        before: toJson(input.before),
        after: toJson(input.after),
        ip: input.req?.ip ?? null,
        userAgent: input.req?.get('user-agent')?.slice(0, 500) ?? null,
      },
    });
  } catch (err) {
    logger.error(
      { err, action: input.action, entity: input.entity, entityId: input.entityId, userId },
      'Failed to write audit log',
    );
  }
}
