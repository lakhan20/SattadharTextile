import type { Request, Response } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthenticated } from '../../utils/errors';
import { query } from '../../middleware/validate';
import { lastNDaysRange, monthRange, todayRange } from '../reports/reports.period';
import { getAdminDashboard, getStaffDashboard } from '../reports/reports.service';
import { dashboardQuerySchema } from './dashboard.schema';

/**
 * ── One endpoint, two payloads ───────────────────────────────────────────
 *
 * `/dashboard` is open to any signed-in account, but what it returns is
 * decided by the role *before any query runs*. The branch below is not a
 * filter over a shared result — the two payloads are assembled by two separate
 * service functions, so the shop-wide figures are never fetched for a STAFF
 * session in the first place.
 *
 * That matters more than it looks. Had this built one rich object and then
 * deleted keys for staff, every field added later would default to *leaking*
 * until someone remembered to strip it. This way the default is to omit.
 *
 * The client is told which shape it got via `role`, so it never has to guess
 * from the presence of a field.
 */
export const getDashboardController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');

  const input = query(req, dashboardQuerySchema);
  const today = todayRange();

  if (user.role !== Role.ADMIN) {
    const staff = await getStaffDashboard(today, user.id);
    res.status(200).json({ data: staff });
    return;
  }

  const admin = await getAdminDashboard(
    { today, month: monthRange(), trend: lastNDaysRange(input.range === '30D' ? 30 : 7) },
    input.range,
  );
  res.status(200).json({ data: admin });
});
