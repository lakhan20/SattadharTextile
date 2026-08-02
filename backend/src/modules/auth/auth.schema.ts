import { z } from 'zod';

/**
 * bcrypt only reads the first 72 bytes of a password, so anything longer is
 * silently truncated. Reject it instead of pretending it was accepted.
 */
export const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(72, 'Password must be 72 characters or fewer.')
  .refine((v) => /[A-Za-z]/.test(v), 'Password must include at least one letter.')
  .refine((v) => /\d/.test(v), 'Password must include at least one number.');

export const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Username must be at least 3 characters.')
  .max(50, 'Username must be 50 characters or fewer.')
  .regex(/^[a-z0-9._-]+$/, 'Username can use letters, numbers, dot, underscore and hyphen only.');

export const loginSchema = z.object({
  username: usernameField,
  // Not `passwordField` — an existing password must be accepted as-is,
  // whatever rules were in force when it was set.
  password: z.string().min(1, 'Enter your password.').max(72),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(20, 'Refresh token is missing or malformed.'),
});

export const logoutSchema = z.object({
  /** Optional — defaults to the session behind the access token. */
  refreshToken: z.string().min(20).optional(),
  /** Sign out everywhere, not just this device. */
  allDevices: z.boolean().optional().default(false),
});

export const adminResetPasswordSchema = z.object({
  userId: z.string().uuid('Pick a valid user.'),
  newPassword: passwordField,
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
