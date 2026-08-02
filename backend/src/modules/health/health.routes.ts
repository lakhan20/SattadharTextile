import { Router, type Request, type Response } from 'express';
import { prisma } from '../../config/prisma';
import { publicRoute } from '../../middleware/rbac';
import { asyncHandler } from '../../utils/asyncHandler';

export const healthRouter = Router();

const startedAt = Date.now();

/**
 * Liveness + database readiness. Used by PM2, Nginx and the mobile app's
 * "test connection" button in Settings.
 */
healthRouter.get(
  '/',
  publicRoute(),
  asyncHandler(async (_req: Request, res: Response) => {
    let database: 'up' | 'down' = 'up';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }

    res.status(database === 'up' ? 200 : 503).json({
      data: {
        status: database === 'up' ? 'ok' : 'degraded',
        service: 'sattadhar-textile-api',
        database,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        timestamp: new Date().toISOString(),
      },
    });
  }),
);
