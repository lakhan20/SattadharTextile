/**
 * Registers the customers behind walk-in bills that predate walk-in
 * registration, and links those bills to them.
 *
 *   npx tsx scripts/backfill-walkin-customers.ts            # dry run (default)
 *   npx tsx scripts/backfill-walkin-customers.ts --apply    # actually write
 *
 * Dry run by default on purpose: this writes customer records and rewrites
 * `bills.customerId` on historical sales, and the right moment to discover
 * that two walk-ins share a number is before the write, not after.
 *
 * What it will NOT do:
 *   · touch a bill that already has a customer;
 *   · touch a walk-in with no phone number — there is nothing to identify;
 *   · create a second customer for a number already on file (it links to the
 *     existing one instead);
 *   · move any money. Balances, ledger entries and dueAmount are untouched,
 *     so a linked credit bill does NOT retroactively appear on a khata.
 *     Linking history is a bookkeeping tidy-up, not a re-posting of the books.
 */
import { AuditAction, PrismaClient } from '@prisma/client';
import { normalisePhone, phoneLookupCandidates } from '../src/utils/phone';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

interface Plan {
  billNumber: string;
  billId: string;
  typedName: string;
  typedPhone: string;
  canonical: string;
  action: 'link-existing' | 'register';
  customerName: string;
  customerId?: string;
}

async function main(): Promise<void> {
  console.log(`\nWalk-in customer backfill — ${APPLY ? 'APPLYING' : 'DRY RUN (pass --apply to write)'}\n`);

  const orphans = await prisma.bill.findMany({
    where: { customerId: null, walkInPhone: { not: null } },
    orderBy: { billDate: 'asc' },
    select: { id: true, billNumber: true, walkInName: true, walkInPhone: true, billDate: true },
  });

  if (orphans.length === 0) {
    console.log('No walk-in bills are missing a customer. Nothing to do.\n');
    return;
  }

  const plans: Plan[] = [];
  // Two bills for the same new number in one run must produce ONE customer,
  // so decisions already made in this pass count as existing.
  const plannedByPhone = new Map<string, string>();

  for (const bill of orphans) {
    const typedPhone = bill.walkInPhone!;
    const canonical = normalisePhone(typedPhone);
    const typedName = bill.walkInName?.trim() || `Walk-in ${canonical}`;

    const existing = await prisma.customer.findFirst({
      where: { deletedAt: null, phone: { in: phoneLookupCandidates(typedPhone) } },
      orderBy: { phone: 'asc' },
    });

    if (existing) {
      plans.push({
        billNumber: bill.billNumber,
        billId: bill.id,
        typedName,
        typedPhone,
        canonical,
        action: 'link-existing',
        customerName: existing.name,
        customerId: existing.id,
      });
      continue;
    }

    const alreadyPlanned = plannedByPhone.get(canonical);
    plans.push({
      billNumber: bill.billNumber,
      billId: bill.id,
      typedName,
      typedPhone,
      canonical,
      action: alreadyPlanned ? 'link-existing' : 'register',
      customerName: alreadyPlanned ?? typedName,
    });
    if (!alreadyPlanned) plannedByPhone.set(canonical, typedName);
  }

  console.log(`${orphans.length} walk-in bill(s) carrying a phone number:\n`);
  for (const p of plans) {
    const verb = p.action === 'register' ? 'REGISTER' : 'link to  ';
    console.log(`  ${p.billNumber.padEnd(14)} ${p.typedPhone.padEnd(14)} → ${verb} ${p.customerName}`);
  }

  const toRegister = plans.filter((p) => p.action === 'register').length;
  console.log(`\n  ${toRegister} customer(s) would be created, ${plans.length} bill(s) linked.`);

  if (!APPLY) {
    console.log('\nDry run — nothing was written. Re-run with --apply to commit.\n');
    return;
  }

  const actor = await prisma.user.findFirst({ where: { role: 'ADMIN', deletedAt: null }, select: { id: true } });

  let created = 0;
  let linked = 0;

  // One transaction per bill: a single odd row cannot strand the whole run.
  for (const p of plans) {
    await prisma.$transaction(async (tx) => {
      let customerId = p.customerId;

      if (!customerId) {
        const existing = await tx.customer.findFirst({
          where: { phone: p.canonical, deletedAt: null },
          select: { id: true },
        });
        if (existing) {
          customerId = existing.id;
        } else {
          const customer = await tx.customer.create({
            data: {
              name: p.typedName,
              phone: p.canonical,
              type: 'RETAIL',
              notes: `Registered from historical counter sale ${p.billNumber}`,
            },
          });
          customerId = customer.id;
          created++;

          await tx.auditLog.create({
            data: {
              userId: actor?.id ?? null,
              action: AuditAction.CREATE,
              entity: 'Customer',
              entityId: customer.id,
              after: { name: customer.name, phone: customer.phone, backfilledFrom: p.billNumber },
            },
          });
        }
      }

      await tx.bill.update({ where: { id: p.billId }, data: { customerId } });
      linked++;
    });
  }

  console.log(`\nDone. ${created} customer(s) created, ${linked} bill(s) linked.`);
  console.log('Balances and ledger entries were not touched.\n');
}

main()
  .catch((err) => {
    console.error('\nBackfill failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
