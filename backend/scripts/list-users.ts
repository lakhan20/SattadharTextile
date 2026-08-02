/* eslint-disable no-console */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Quick "who can sign in?" check. Prints usernames and roles — never hashes.
 *   npx tsx scripts/list-users.ts
 */
const prisma = new PrismaClient();

prisma.user
  .findMany({
    select: { username: true, name: true, role: true, isActive: true, lockedUntil: true },
    orderBy: [{ role: 'asc' }, { username: 'asc' }],
  })
  .then((users) => {
    if (users.length === 0) {
      console.log('\nNo accounts yet. Run:  npm run seed\n');
      return;
    }
    console.log(`\n${users.length} account${users.length === 1 ? '' : 's'}:\n`);
    for (const u of users) {
      const locked = u.lockedUntil && u.lockedUntil > new Date() ? '  [LOCKED]' : '';
      const inactive = u.isActive ? '' : '  [DEACTIVATED]';
      console.log(`  ${u.username.padEnd(12)} ${u.role.padEnd(6)}  ${u.name}${locked}${inactive}`);
    }
    console.log('');
  })
  .catch((error: Error) => {
    console.error('\nCould not read the database:', error.message, '\n');
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
