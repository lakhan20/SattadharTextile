import type { Request, Response } from 'express';
import { ADMIN_ONLY_MENUS, DEFAULT_STAFF_MENUS, STAFF_ELIGIBLE_MENUS } from '../../config/menus';
import { PERMISSIONS } from '../../config/permissions';
import { body, params, query } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthenticated } from '../../utils/errors';
import {
  createStaffSchema,
  listStaffQuerySchema,
  resetStaffPasswordSchema,
  staffIdParamsSchema,
  updateStaffSchema,
} from './staff.schema';
import * as staffService from './staff.service';

/** Every handler here sits behind `requireRole(ADMIN)` — see staff.routes.ts. */
const actorOf = (req: Request) => {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  return { id: user.id };
};

export const listStaffController = asyncHandler(async (req: Request, res: Response) => {
  const result = await staffService.listStaff(query(req, listStaffQuerySchema));
  res.status(200).json({ data: result });
});

/**
 * What the staff form is allowed to offer.
 *
 * Served rather than hardcoded in the app so the two can never disagree about
 * which screens are assignable — and so `adminOnly` can be shown as the fixed,
 * un-tickable list it is, rather than simply being absent with no explanation.
 */
export const staffOptionsController = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({
    data: {
      assignableMenus: STAFF_ELIGIBLE_MENUS,
      adminOnlyMenus: ADMIN_ONLY_MENUS,
      defaultMenus: DEFAULT_STAFF_MENUS,
      permissions: PERMISSIONS,
    },
  });
});

export const getStaffController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = params(req, staffIdParamsSchema);
  res.status(200).json({ data: await staffService.getStaffById(id) });
});

export const createStaffController = asyncHandler(async (req: Request, res: Response) => {
  const staff = await staffService.createStaff(body(req, createStaffSchema), actorOf(req), req);
  res.status(201).json({ data: staff });
});

export const updateStaffController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = params(req, staffIdParamsSchema);
  const staff = await staffService.updateStaff(id, body(req, updateStaffSchema), actorOf(req), req);
  res.status(200).json({ data: staff });
});

export const deactivateStaffController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = params(req, staffIdParamsSchema);
  const result = await staffService.deactivateStaff(id, actorOf(req), req);
  res.status(200).json({ data: result });
});

export const activateStaffController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = params(req, staffIdParamsSchema);
  res.status(200).json({ data: { staff: await staffService.activateStaff(id, actorOf(req), req) } });
});

export const unlockStaffController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = params(req, staffIdParamsSchema);
  res.status(200).json({ data: { staff: await staffService.unlockStaff(id, actorOf(req), req) } });
});

export const resetStaffPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const { id } = params(req, staffIdParamsSchema);
  const { newPassword } = body(req, resetStaffPasswordSchema);
  const result = await staffService.resetStaffPassword(id, newPassword, actorOf(req), req);
  res.status(200).json({ data: result });
});

/**
 * The signed-in account's own menu. Not owner-only: it returns nothing about
 * the shop and nothing about anyone else, and the app needs it to know which
 * tabs to draw. Hiding a tab is not what keeps a staffer out of Reports — the
 * 403 on `/reports/*` is.
 */
export const myMenuController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  const { role, menu } = await staffService.getMenuForUser(user.id);
  res.status(200).json({ data: { role, menu } });
});
