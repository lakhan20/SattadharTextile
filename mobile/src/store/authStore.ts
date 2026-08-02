import { create } from 'zustand';
import { authApi } from '../api/auth';
import { ApiError, setSessionEndedHandler } from '../api/client';
import type { ApiErrorCode, MenuKey, PermissionKey, PublicUser } from '../api/types';
import { fromServerLanguage } from '../i18n';
import { useSettingsStore } from './settingsStore';
import { tokenStorage } from './tokenStorage';

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  /**
   * Which screens this session may see, from `GET /me/menu`. The navigators
   * read it to decide which tabs and stacks to register at all.
   *
   * It is convenience, not security: the server refuses an owner-only endpoint
   * for a staff token whatever is in here, and would still refuse it if this
   * array were tampered with on the device.
   */
  menu: MenuKey[];
  /** Set when a session ends on its own — shown once on the login screen. */
  endedReason: ApiErrorCode | null;

  bootstrap: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: (allDevices?: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearEndedReason: () => void;
}

/**
 * A session whose menu could not be fetched still has to be usable, so fall
 * back to the narrowest sensible set rather than an app with no tabs. The owner
 * gets everything back on the next successful call; nothing here can widen what
 * the server allows.
 */
const FALLBACK_MENU: MenuKey[] = ['DASHBOARD', 'BILLING', 'CUSTOMERS'];

async function loadMenu(role: PublicUser['role']): Promise<MenuKey[]> {
  try {
    return (await authApi.menu()).menu;
  } catch {
    return role === 'ADMIN'
      ? ['DASHBOARD', 'BILLING', 'PRODUCTS', 'CUSTOMERS', 'STOCK', 'KHATA', 'REPORTS', 'OUTSTANDING', 'STAFF']
      : FALLBACK_MENU;
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'restoring',
  user: null,
  menu: [],
  endedReason: null,

  /**
   * Runs once at launch. Tokens come off the keystore; the user is re-read
   * from the server rather than cached, so a role change, a new discount cap
   * or a deactivation is picked up the moment the app opens.
   */
  bootstrap: async () => {
    const { accessToken, refreshToken } = await tokenStorage.load();
    if (!accessToken || !refreshToken) {
      set({ status: 'signedOut', user: null, menu: [] });
      return;
    }
    try {
      const user = await authApi.me();
      // Read alongside the user, so a menu the owner changed overnight is in
      // force the moment the app opens — same reasoning as re-reading the role.
      const menu = await loadMenu(user.role);
      useSettingsStore.getState().setLanguage(fromServerLanguage(user.preferredLang));
      set({ status: 'signedIn', user, menu, endedReason: null });
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      // Offline at launch is not a reason to throw someone out — keep the
      // tokens and let them retry. Anything else means the session is dead.
      if (apiError?.isOffline) {
        set({ status: 'signedOut', user: null, menu: [], endedReason: apiError.code });
        return;
      }
      await tokenStorage.clear();
      set({ status: 'signedOut', user: null, menu: [], endedReason: apiError?.code ?? 'UNAUTHENTICATED' });
    }
  },

  signIn: async (username, password) => {
    const result = await authApi.login(username, password);
    await tokenStorage.save({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    // The account's own language preference wins over the device default.
    useSettingsStore.getState().setLanguage(fromServerLanguage(result.user.preferredLang));
    // Fetched before the app is marked signed-in, so the navigator is built
    // once with the right tabs rather than flashing a full set and dropping
    // some of them a moment later.
    const menu = await loadMenu(result.user.role);
    set({ status: 'signedIn', user: result.user, menu, endedReason: null });
  },

  signOut: async (allDevices = false) => {
    try {
      await authApi.logout(allDevices);
    } catch {
      // Even if the server cannot be reached, the device must forget the tokens.
    }
    await tokenStorage.clear();
    set({ status: 'signedOut', user: null, menu: [], endedReason: null });
  },

  /**
   * Re-reads the profile AND the menu. Called after the owner edits an account
   * — including their own — so a changed assignment shows up without a restart.
   */
  refreshUser: async () => {
    if (get().status !== 'signedIn') return;
    try {
      const user = await authApi.me();
      set({ user, menu: await loadMenu(user.role) });
    } catch {
      // A failed refresh of the profile is not worth interrupting anyone over.
    }
  },

  clearEndedReason: () => set({ endedReason: null }),
}));

/**
 * The axios layer discovers a dead session before any screen does — revoked
 * token, deactivated account, failed refresh. Drop the tokens and send the
 * user back to sign-in with a reason.
 */
setSessionEndedHandler((reason) => {
  if (useAuthStore.getState().status === 'signedOut') return;
  void tokenStorage.clear();
  useAuthStore.setState({ status: 'signedOut', user: null, menu: [], endedReason: reason });
});

// ── Selectors ────────────────────────────────────────────────
export const useCurrentUser = (): PublicUser | null => useAuthStore((s) => s.user);
export const useIsAdmin = (): boolean => useAuthStore((s) => s.user?.role === 'ADMIN');

/** The screens this session may see. Used by the navigators, nowhere else. */
export const useMenu = (): MenuKey[] => useAuthStore((s) => s.menu);

/**
 * Whether a screen is on this session's menu.
 *
 * For deciding what to RENDER only. Never treat a `true` from this as
 * permission to do anything — the server decides that, and it decides it again
 * on every request.
 */
export const useHasMenu = (key: MenuKey): boolean => useAuthStore((s) => s.menu.includes(key));

/** ADMIN holds every permission implicitly, exactly as the server treats it. */
export function useHasPermission(permission: PermissionKey): boolean {
  return useAuthStore((s) => {
    if (!s.user) return false;
    if (s.user.role === 'ADMIN') return true;
    return s.user.permissions?.[permission] === true;
  });
}
