import type { AuthUser } from './auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth. Absent on public routes. */
      user?: AuthUser;
      /**
       * Set by an access guard (publicRoute / authenticated / requireRole /
       * requirePermission). The RBAC sentinel refuses to let a response leave
       * the API router unless one of them ran — default-deny.
       */
      rbac?: { checked: true; policy: string };
      /** Output of the zod validation middleware. Controllers read this, not req.body. */
      valid?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
