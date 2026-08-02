import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { unauthenticated } from '../../utils/errors';
import { body } from '../../middleware/validate';
import {
  adminResetPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
} from './auth.schema';
import * as authService from './auth.service';

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const input = body(req, loginSchema);
  const result = await authService.login(input, req);
  res.status(200).json({ data: result });
});

export const refreshController = asyncHandler(async (req: Request, res: Response) => {
  const input = body(req, refreshSchema);
  const result = await authService.refresh(input);
  res.status(200).json({ data: result });
});

export const logoutController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  const input = body(req, logoutSchema);
  const result = await authService.logout(input, { id: user.id, jti: user.jti }, req);
  res.status(200).json({ data: { signedOut: true, ...result } });
});

export const adminResetPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  const input = body(req, adminResetPasswordSchema);
  const result = await authService.adminResetPassword(input, { id: user.id }, req);
  res.status(200).json({ data: { passwordReset: true, ...result } });
});

export const meController = asyncHandler(async (req: Request, res: Response) => {
  const user = req.user;
  if (!user) throw unauthenticated('Sign in to continue.');
  const me = await authService.getMe(user.id);
  res.status(200).json({ data: me });
});
