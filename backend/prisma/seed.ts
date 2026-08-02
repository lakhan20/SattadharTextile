/* eslint-disable no-console */
import {
  CustomerType,
  Language,
  LedgerEntryType,
  PrismaClient,
  Role,
  StockMovementType,
  Unit,
} from '@prisma/client';
import { DEFAULT_STAFF_MENUS, type StaffMenuKey } from '../src/config/menus';
import { postLedgerEntry } from '../src/modules/ledger/ledger.posting';
import bcrypt from 'bcryptjs';
import 'dotenv/config';

/**
 * Idempotent seed for MODULE 1 (auth + RBAC): one ADMIN and three STAFF.
 *
 * Safe to run repeatedly. An account that already exists is left completely
 * untouched — passwords, permissions and discount caps are never overwritten,
 * so re-seeding a live shop cannot reset someone's credentials.
 *
 *   npm run seed
 */

const prisma = new PrismaClient();

const ROUNDS = Number(process.env['BCRYPT_ROUNDS'] ?? 12);
const ADMIN_USERNAME = (process.env['SEED_ADMIN_USERNAME'] ?? 'admin').toLowerCase();
const ADMIN_PASSWORD = process.env['SEED_ADMIN_PASSWORD'] ?? 'ChangeMe@123';
const ADMIN_NAME = process.env['SEED_ADMIN_NAME'] ?? 'Shop Owner';
const STAFF_PASSWORD = process.env['SEED_STAFF_PASSWORD'] ?? 'Staff@123';

interface SeedUser {
  username: string;
  name: string;
  password: string;
  role: Role;
  phone?: string;
  language?: Language;
  maxDiscountPercent?: number;
  permissions?: Record<string, boolean>;
  /**
   * Which screens this account sees. Visibility only — never a permission, and
   * never able to name an owner-only area. See `src/config/menus.ts`.
   */
  menuAccess?: StaffMenuKey[];
}

const users: SeedUser[] = [
  {
    username: ADMIN_USERNAME,
    name: ADMIN_NAME,
    password: ADMIN_PASSWORD,
    role: Role.ADMIN,
    language: Language.EN,
    maxDiscountPercent: 100,
    permissions: {},
  },
  {
    username: 'kirti',
    name: 'Kirti Patel',
    password: STAFF_PASSWORD,
    role: Role.STAFF,
    phone: '+919000000001',
    language: Language.GU,
    maxDiscountPercent: 5,
    permissions: {
      'customer.create': true,
      'customer.update': true,
      'payment.record': true,
      'ledger.view': true,
    },
    // Takes money on the khata, so she needs the book she takes it in.
    menuAccess: ['DASHBOARD', 'BILLING', 'CUSTOMERS', 'KHATA'],
  },
  {
    username: 'jignesh',
    name: 'Jignesh Shah',
    password: STAFF_PASSWORD,
    role: Role.STAFF,
    phone: '+919000000002',
    language: Language.GU,
    maxDiscountPercent: 10,
    permissions: {
      'customer.create': true,
      'customer.update': true,
      'payment.record': true,
      'ledger.view': true,
      'stock.in': true,
    },
    // He books goods in, so he gets the shelf and the catalog as well.
    menuAccess: ['DASHBOARD', 'BILLING', 'PRODUCTS', 'CUSTOMERS', 'STOCK', 'KHATA'],
  },
  {
    username: 'meera',
    name: 'Meera Joshi',
    password: STAFF_PASSWORD,
    role: Role.STAFF,
    phone: '+919000000003',
    language: Language.EN,
    maxDiscountPercent: 2,
    permissions: {
      'customer.create': true,
      'payment.record': true,
    },
    // Counter only. Deliberately the narrowest account in the shop — this is
    // what a staffer sees when the owner assigns almost nothing.
    menuAccess: ['BILLING', 'CUSTOMERS'],
  },
];

// ── MODULES 2–4 (categories / sub-categories / products) ──────────────────

interface SeedCategory {
  name: string;
  code: string;
  description?: string;
}

const categories: SeedCategory[] = [
  { name: 'Cotton', code: 'COT', description: 'Cotton shirting and suiting fabrics.' },
  { name: 'Silk', code: 'SIL', description: 'Pure and blended silk fabrics.' },
  { name: 'Saree', code: 'SAR', description: 'Ready sarees — wedding and daily wear.' },
];

interface SeedSubCategory {
  categoryCode: string;
  name: string;
}

const subCategories: SeedSubCategory[] = [
  { categoryCode: 'COT', name: 'Cotton Shirting' },
  { categoryCode: 'COT', name: 'Cotton Suiting' },
  { categoryCode: 'SIL', name: 'Silk Saree Fabric' },
  { categoryCode: 'SAR', name: 'Wedding Saree' },
  { categoryCode: 'SAR', name: 'Casual Saree' },
];

interface SeedProduct {
  sku: string;
  name: string;
  categoryCode: string;
  subCategoryName?: string;
  unit: Unit;
  hsnCode?: string;
  retailRate: number;
  wholesaleRate: number;
  costPrice: number;
  gstPercent?: number;
  colour?: string;
  width?: string;
  gsm?: number;
  openingStock: number;
  reorderLevel: number;
}

const products: SeedProduct[] = [
  {
    sku: 'COT-SHIRT-WHT-001',
    name: 'Premium Cotton Shirting — White',
    categoryCode: 'COT',
    subCategoryName: 'Cotton Shirting',
    unit: Unit.METER,
    hsnCode: '5208',
    retailRate: 250,
    wholesaleRate: 200,
    costPrice: 150,
    colour: 'White',
    width: '44 inch',
    gsm: 120,
    openingStock: 500,
    reorderLevel: 50,
  },
  {
    sku: 'COT-SUIT-NVY-002',
    name: 'Cotton Suiting — Navy',
    categoryCode: 'COT',
    subCategoryName: 'Cotton Suiting',
    unit: Unit.METER,
    hsnCode: '5208',
    retailRate: 320,
    wholesaleRate: 260,
    costPrice: 190,
    colour: 'Navy',
    width: '58 inch',
    gsm: 180,
    openingStock: 300,
    reorderLevel: 40,
  },
  {
    sku: 'SIL-SAREE-RED-001',
    name: 'Pure Silk Saree Fabric — Red',
    categoryCode: 'SIL',
    subCategoryName: 'Silk Saree Fabric',
    unit: Unit.METER,
    hsnCode: '5007',
    retailRate: 950,
    wholesaleRate: 800,
    costPrice: 600,
    colour: 'Red',
    width: '44 inch',
    gsm: 80,
    openingStock: 150,
    reorderLevel: 20,
  },
  {
    sku: 'SAR-WED-MRN-001',
    name: 'Banarasi Wedding Saree — Maroon',
    categoryCode: 'SAR',
    subCategoryName: 'Wedding Saree',
    unit: Unit.PIECE,
    hsnCode: '6204',
    retailRate: 4500,
    wholesaleRate: 3800,
    costPrice: 2800,
    colour: 'Maroon',
    openingStock: 25,
    reorderLevel: 5,
  },
  {
    sku: 'SAR-CAS-BLU-001',
    name: 'Printed Casual Saree — Blue Floral',
    categoryCode: 'SAR',
    subCategoryName: 'Casual Saree',
    unit: Unit.PIECE,
    hsnCode: '6204',
    retailRate: 1200,
    wholesaleRate: 950,
    costPrice: 700,
    colour: 'Blue',
    openingStock: 60,
    reorderLevel: 10,
  },
  // Deliberately seeded below its reorder level so the low-stock screen and the
  // reorder alert have something to show on a fresh database.
  {
    sku: 'COT-SHIRT-SKY-003',
    name: 'Cotton Shirting — Sky Blue',
    categoryCode: 'COT',
    subCategoryName: 'Cotton Shirting',
    unit: Unit.METER,
    hsnCode: '5208',
    retailRate: 270,
    wholesaleRate: 215,
    costPrice: 160,
    colour: 'Sky Blue',
    width: '44 inch',
    gsm: 120,
    openingStock: 12.5,
    reorderLevel: 40,
  },
];

/**
 * Idempotent seed for MODULES 2–4 (masters). Existing rows — matched by the
 * same natural keys the API enforces (category code/name, sub-category name
 * within its category, product SKU) — are left completely untouched.
 */
async function seedMasters(adminUserId: string): Promise<void> {
  console.log('Seeding master data — categories, sub-categories, products\n');

  const categoryIdByCode = new Map<string, string>();
  let categoriesCreated = 0;
  let categoriesSkipped = 0;

  for (const c of categories) {
    const existing = await prisma.category.findFirst({
      where: { deletedAt: null, OR: [{ code: c.code }, { name: c.name }] },
    });
    if (existing) {
      categoryIdByCode.set(c.code, existing.id);
      categoriesSkipped++;
      continue;
    }
    const created = await prisma.category.create({
      data: { name: c.name, code: c.code, description: c.description ?? null },
    });
    categoryIdByCode.set(c.code, created.id);
    categoriesCreated++;
  }

  const subCategoryIdByKey = new Map<string, string>();
  let subCategoriesCreated = 0;
  let subCategoriesSkipped = 0;

  for (const s of subCategories) {
    const categoryId = categoryIdByCode.get(s.categoryCode);
    if (!categoryId) continue;
    const existing = await prisma.subCategory.findFirst({ where: { categoryId, name: s.name, deletedAt: null } });
    if (existing) {
      subCategoryIdByKey.set(`${s.categoryCode}:${s.name}`, existing.id);
      subCategoriesSkipped++;
      continue;
    }
    const created = await prisma.subCategory.create({ data: { categoryId, name: s.name } });
    subCategoryIdByKey.set(`${s.categoryCode}:${s.name}`, created.id);
    subCategoriesCreated++;
  }

  let productsCreated = 0;
  let productsSkipped = 0;

  for (const p of products) {
    const existing = await prisma.product.findUnique({ where: { sku: p.sku } });
    if (existing) {
      productsSkipped++;
      continue;
    }
    const categoryId = categoryIdByCode.get(p.categoryCode);
    if (!categoryId) continue;
    const subCategoryId = p.subCategoryName ? subCategoryIdByKey.get(`${p.categoryCode}:${p.subCategoryName}`) : undefined;

    await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name: p.name,
          sku: p.sku,
          categoryId,
          subCategoryId: subCategoryId ?? null,
          hsnCode: p.hsnCode ?? null,
          unit: p.unit,
          retailRate: p.retailRate,
          wholesaleRate: p.wholesaleRate,
          costPrice: p.costPrice,
          gstPercent: p.gstPercent ?? 5,
          colour: p.colour ?? null,
          width: p.width ?? null,
          gsm: p.gsm ?? null,
          openingStock: p.openingStock,
          currentStock: p.openingStock,
          reorderLevel: p.reorderLevel,
        },
      });

      if (p.openingStock > 0) {
        await tx.stockMovement.create({
          data: {
            productId: created.id,
            type: StockMovementType.OPENING,
            qty: p.openingStock,
            balanceAfter: p.openingStock,
            rate: p.costPrice,
            reason: 'Opening stock (seed)',
            createdById: adminUserId,
          },
        });
      }
    });

    productsCreated++;
  }

  console.log(`Categories: ${categoriesCreated} created, ${categoriesSkipped} already present.`);
  console.log(`Sub-categories: ${subCategoriesCreated} created, ${subCategoriesSkipped} already present.`);
  console.log(`Products: ${productsCreated} created, ${productsSkipped} already present.\n`);
}

// ── SHOP SETTINGS + sample customers (billing module) ─────────────────────

async function seedShopSettings(): Promise<void> {
  const existing = await prisma.shopSetting.findUnique({ where: { id: 'shop' } });
  if (existing) {
    console.log('Shop settings already present, left untouched.\n');
    return;
  }

  const shopName = process.env['SHOP_NAME'] ?? 'Sattadhar Textile';
  const shopState = process.env['SHOP_STATE'] ?? 'Gujarat';
  const language = (process.env['DEFAULT_LANGUAGE'] ?? 'EN').toUpperCase() === 'GU' ? Language.GU : Language.EN;

  await prisma.shopSetting.create({
    data: {
      id: 'shop',
      legalName: shopName,
      displayName: shopName.toUpperCase(),
      gstin: process.env['SHOP_GSTIN'] ?? null,
      state: shopState,
      phone: process.env['SHOP_PHONE'] ?? null,
      defaultLanguage: language,
    },
  });
  console.log(`Shop settings created (${shopName}, ${shopState}).\n`);
}

interface SeedCustomer {
  name: string;
  phone: string;
  gstin?: string;
  addressLine?: string;
  city: string;
  state: string;
  pincode?: string;
  type: CustomerType;
  /** 0 means "no limit set" — see `checkCreditLimit`. */
  creditLimit: number;
  /**
   * Money already owed when the shop started using the app. Posted as an
   * OPENING ledger entry rather than written straight onto `outstanding`, so
   * the khata is complete from its very first line.
   */
  openingBalance?: number;
}

// One in Gujarat (same state as the shop → CGST+SGST) and one outside
// (different state → IGST), so both tax paths can be tested immediately.
// The third carries a balance from before the app, so the khata screens have
// something to show without billing anything first.
const customers: SeedCustomer[] = [
  {
    name: 'Chirag Mehta Textiles',
    phone: '+919820000001',
    gstin: '24AAAAA0000A1Z5',
    addressLine: 'Ring Road, Behind Jain Derasar',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380001',
    type: CustomerType.WHOLESALE,
    creditLimit: 100000,
  },
  {
    name: 'Rohan Traders',
    phone: '+919820000002',
    addressLine: 'Lamington Road',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400007',
    type: CustomerType.RETAIL,
    // Deliberately small: a couple of ordinary credit sales will trip the
    // limit, so CREDIT_LIMIT_EXCEEDED is reachable without contriving one.
    creditLimit: 5000,
  },
  {
    name: 'Vasant Silk House',
    phone: '+919820000003',
    addressLine: 'Panchkuva Cloth Market',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380002',
    type: CustomerType.WHOLESALE,
    creditLimit: 50000,
    openingBalance: 12500,
  },
];

async function seedCustomers(): Promise<void> {
  let created = 0;
  let skipped = 0;
  let limitsBackfilled = 0;

  for (const c of customers) {
    const existing = await prisma.customer.findFirst({ where: { phone: c.phone, deletedAt: null } });
    if (existing) {
      // The customer predates this seed, so it keeps its own data — but a
      // credit limit of 0 means nothing was ever set, and the khata module
      // needs one to be testable.
      if (Number(existing.creditLimit) === 0 && c.creditLimit > 0) {
        await prisma.customer.update({ where: { id: existing.id }, data: { creditLimit: c.creditLimit } });
        limitsBackfilled++;
      }
      skipped++;
      continue;
    }

    const customer = await prisma.customer.create({
      data: {
        name: c.name,
        phone: c.phone,
        gstin: c.gstin ?? null,
        addressLine: c.addressLine ?? null,
        city: c.city,
        state: c.state,
        pincode: c.pincode ?? null,
        type: c.type,
        creditLimit: c.creditLimit,
        openingBalance: c.openingBalance ?? 0,
      },
    });

    // Through the same posting helper every other entry uses, so `outstanding`
    // and the ledger cannot start out already disagreeing.
    if (c.openingBalance && c.openingBalance > 0) {
      await prisma.$transaction((tx) =>
        postLedgerEntry(tx, {
          customerId: customer.id,
          type: LedgerEntryType.OPENING,
          amount: c.openingBalance!,
          narration: 'Opening balance carried into the app',
          createdById: null,
        }),
      );
    }

    created++;
  }

  console.log(
    `Customers: ${created} created, ${skipped} already present` +
      `${limitsBackfilled > 0 ? `, ${limitsBackfilled} credit limit(s) backfilled` : ''}.\n`,
  );
}

async function main(): Promise<void> {
  console.log('\nSeeding Sattadhar Textile — auth accounts\n');

  const created: Array<{ username: string; role: Role; password: string }> = [];
  const skipped: string[] = [];

  for (const seed of users) {
    const existing = await prisma.user.findUnique({
      where: { username: seed.username },
      select: { id: true, role: true },
    });

    if (existing) {
      skipped.push(`${seed.username} (${existing.role})`);
      continue;
    }

    const passwordHash = await bcrypt.hash(seed.password, ROUNDS);
    await prisma.user.create({
      data: {
        username: seed.username,
        name: seed.name,
        phone: seed.phone ?? null,
        passwordHash,
        role: seed.role,
        language: seed.language ?? Language.EN,
        maxDiscountPercent: seed.maxDiscountPercent ?? 0,
        permissions: seed.permissions ?? {},
        // An owner's menu comes from the role, never from the column.
        menuAccess: seed.role === Role.ADMIN ? [] : (seed.menuAccess ?? DEFAULT_STAFF_MENUS),
        isActive: true,
        passwordChangedAt: new Date(),
      },
    });

    created.push({ username: seed.username, role: seed.role, password: seed.password });
  }

  if (created.length > 0) {
    console.log('Created accounts:');
    console.log('  ┌────────────┬────────┬──────────────────────┐');
    console.log('  │ username   │ role   │ password             │');
    console.log('  ├────────────┼────────┼──────────────────────┤');
    for (const c of created) {
      console.log(`  │ ${c.username.padEnd(10)} │ ${c.role.padEnd(6)} │ ${c.password.padEnd(20)} │`);
    }
    console.log('  └────────────┴────────┴──────────────────────┘');
    console.log('\n  Change these passwords before the shop goes live.\n');
  }

  if (skipped.length > 0) {
    console.log(`Already present, left untouched: ${skipped.join(', ')}\n`);
  }

  const adminUser = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME }, select: { id: true } });
  if (adminUser) {
    await seedMasters(adminUser.id);
  }

  await seedShopSettings();
  await seedCustomers();

  const total = await prisma.user.count({ where: { deletedAt: null } });
  console.log(`Done. ${total} active account${total === 1 ? '' : 's'} in the database.\n`);
}

main()
  .catch((err) => {
    console.error('\nSeed failed:', err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
