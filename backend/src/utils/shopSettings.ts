import { Language, type ShopSetting } from '@prisma/client';
import { prisma, type PrismaClientOrTx } from '../config/prisma';
import { env } from '../config/env';

const SHOP_SETTING_ID = 'shop';

/**
 * The settings module (ADMIN-editable shop profile) hasn't been built yet, so
 * this is the only place shop_settings is read or created. Self-heals: if the
 * singleton row is missing, it is created from env defaults on first read.
 */
export async function getShopSettings(client: PrismaClientOrTx = prisma): Promise<ShopSetting> {
  const existing = await client.shopSetting.findUnique({ where: { id: SHOP_SETTING_ID } });
  if (existing) return existing;

  return client.shopSetting.create({
    data: {
      id: SHOP_SETTING_ID,
      legalName: env.SHOP_NAME,
      displayName: env.SHOP_NAME.toUpperCase(),
      gstin: env.SHOP_GSTIN ?? null,
      state: env.SHOP_STATE,
      phone: env.SHOP_PHONE ?? null,
      defaultLanguage: env.DEFAULT_LANGUAGE === 'GU' ? Language.GU : Language.EN,
    },
  });
}
