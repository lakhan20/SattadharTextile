import { request } from './client';
import type {
  AgeingReport,
  KhataStatement,
  OutstandingReport,
  PaymentReminder,
  RecordNoteInput,
  RecordNoteResult,
  RecordPaymentInput,
  RecordPaymentResult,
} from './types';

export interface StatementParams {
  page?: number;
  pageSize?: number;
  /** `desc` (newest first) is the server default. */
  sort?: 'asc' | 'desc';
  from?: string;
  to?: string;
}

function toQuery<T extends object>(params: T): Record<string, string> {
  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(params) as [string, string | number | boolean | undefined][]) {
    if (value === undefined) continue;
    query[key] = String(value);
  }
  return query;
}

export const ledgerApi = {
  /** Staff may record a payment if the owner has left `payment.record` on. */
  recordPayment: (input: RecordPaymentInput) =>
    request<RecordPaymentResult>({ method: 'POST', url: '/ledger/payment', data: input }),

  /** ADMIN only — a STAFF token gets a 403 from the server, by design. */
  recordNote: (input: RecordNoteInput) =>
    request<RecordNoteResult>({ method: 'POST', url: '/ledger/note', data: input }),

  statement: (customerId: string, params: StatementParams = {}) =>
    request<KhataStatement>({ method: 'GET', url: `/ledger/customer/${customerId}`, params: toQuery(params) }),

  /** ADMIN only — the shop-wide debtor book. */
  outstanding: () => request<OutstandingReport>({ method: 'GET', url: '/ledger/outstanding' }),

  /** ADMIN only. */
  ageing: () => request<AgeingReport>({ method: 'GET', url: '/ledger/ageing' }),

  /**
   * Builds the reminder; it does not send it. The caller opens the returned
   * `whatsappUrl` and decides whether to press send.
   */
  reminder: (customerId: string) =>
    request<PaymentReminder>({ method: 'POST', url: `/ledger/reminder/${customerId}` }),
};
