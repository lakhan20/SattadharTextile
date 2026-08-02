import { Prisma, PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from './logger';

export const prisma = new PrismaClient({
  log: env.isProduction ? ['warn', 'error'] : ['warn', 'error'],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}

/**
 * Anything that accepts either the root client or an interactive-transaction
 * client. Lets helpers such as writeAudit() join a caller's transaction.
 */
export type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;
