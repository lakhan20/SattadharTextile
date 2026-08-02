import type { ReactNode } from 'react';
import {
  BookOpen,
  FileBarChart,
  LayoutGrid,
  Package,
  Receipt,
  ShieldCheck,
  Users,
  Wallet,
  Warehouse,
} from 'lucide-react-native';
import {
  ADMIN_ONLY_MENU_KEYS,
  STAFF_MENU_KEYS,
  type AdminMenuKey,
  type MenuKey,
  type StaffMenuKey,
} from '../../api/types';
import { ICON_STROKE } from '../../theme';

/**
 * How each menu key is drawn, and what it is called.
 *
 * `STAFF_MENU_KEYS` is the assignable set — the form renders a tick for each.
 * `ADMIN_ONLY_MENU_KEYS` is shown too, but as a fixed, un-tickable list, so an
 * owner can see exactly which areas are never assignable rather than wondering
 * why Reports is missing from the checklist.
 */

const ICONS: Record<MenuKey, (color: string, size: number) => ReactNode> = {
  DASHBOARD: (color, size) => <LayoutGrid size={size} color={color} strokeWidth={ICON_STROKE} />,
  BILLING: (color, size) => <Receipt size={size} color={color} strokeWidth={ICON_STROKE} />,
  PRODUCTS: (color, size) => <Package size={size} color={color} strokeWidth={ICON_STROKE} />,
  CUSTOMERS: (color, size) => <Users size={size} color={color} strokeWidth={ICON_STROKE} />,
  STOCK: (color, size) => <Warehouse size={size} color={color} strokeWidth={ICON_STROKE} />,
  KHATA: (color, size) => <BookOpen size={size} color={color} strokeWidth={ICON_STROKE} />,
  REPORTS: (color, size) => <FileBarChart size={size} color={color} strokeWidth={ICON_STROKE} />,
  OUTSTANDING: (color, size) => <Wallet size={size} color={color} strokeWidth={ICON_STROKE} />,
  STAFF: (color, size) => <ShieldCheck size={size} color={color} strokeWidth={ICON_STROKE} />,
};

export const menuIcon = (key: MenuKey, color: string, size = 18): ReactNode => ICONS[key](color, size);

/** i18n keys, so the labels track the app language like everything else. */
export const menuLabelKey = (key: MenuKey) => `menus.${key}.label` as const;
export const menuHintKey = (key: MenuKey) => `menus.${key}.hint` as const;

/**
 * What this build knows how to draw. The form asks the server which menus are
 * assignable and uses that answer — these are the fallback for a server too old
 * to have `/admin/staff/options`, and the filter that keeps a key this app has
 * no label or icon for from rendering as a blank row.
 */
export const ASSIGNABLE_MENUS: readonly StaffMenuKey[] = STAFF_MENU_KEYS;
export const NEVER_ASSIGNABLE_MENUS: readonly AdminMenuKey[] = ADMIN_ONLY_MENU_KEYS;

const KNOWN_STAFF = new Set<string>(STAFF_MENU_KEYS);
const KNOWN_ADMIN = new Set<string>(ADMIN_ONLY_MENU_KEYS);

/** Keeps the server's list in the app's render order, dropping anything unknown. */
export const knownStaffMenus = (keys: readonly string[]): StaffMenuKey[] =>
  STAFF_MENU_KEYS.filter((key) => keys.includes(key) && KNOWN_STAFF.has(key));

export const knownAdminMenus = (keys: readonly string[]): AdminMenuKey[] =>
  ADMIN_ONLY_MENU_KEYS.filter((key) => keys.includes(key) && KNOWN_ADMIN.has(key));

/**
 * Sorted the way the checklist renders them, so a summary line on a card reads
 * in the same order as the form that produced it.
 */
export const orderMenus = (keys: readonly StaffMenuKey[]): StaffMenuKey[] =>
  STAFF_MENU_KEYS.filter((key) => keys.includes(key));
