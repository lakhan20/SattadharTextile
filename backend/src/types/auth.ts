import type { Language, Role } from '@prisma/client';
import type { Permission } from '../config/permissions';

/** The authenticated principal, loaded fresh from the database on every request. */
export interface AuthUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  language: Language;
  permissions: Record<Permission, boolean>;
  maxDiscountPercent: number;
  /** Session id from the access token — also the refresh-token row's primary key. */
  jti: string;
}

/** Shape returned by /auth/me and nested in the login response. Never carries a hash. */
export interface PublicUser {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: Role;
  preferredLang: Language;
  permissions: Record<Permission, boolean>;
  maxDiscountPercent: number;
  isActive: boolean;
  lastLoginAt: string | null;
}
