import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/**
 * bcryptjs (pure JS) rather than the native `bcrypt` binding: no node-gyp,
 * so the ARM64 Oracle Cloud box builds without a compiler toolchain.
 */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A real hash of a throwaway value. When a username does not exist we still
 * run a comparison against this so the response time does not reveal whether
 * the account is real.
 */
const DUMMY_HASH = bcrypt.hashSync('sattadhar-timing-equaliser', 12);

export async function burnTimingBudget(plain: string): Promise<void> {
  await bcrypt.compare(plain, DUMMY_HASH);
}
