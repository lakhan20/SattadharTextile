import { create } from 'zustand';
import { authApi } from '../api/auth';
import { ApiError, setSessionEndedHandler } from '../api/client';
import type { ApiErrorCode, PermissionKey, PublicUser } from '../api/types';
import { fromServerLanguage } from '../i18n';
import { useSettingsStore } from './settingsStore';
import { tokenStorage } from './tokenStorage';

export type AuthStatus = 'restoring' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: PublicUser | null;
  /** Set when a session ends on its own — shown once on the login screen. */
  endedReason: ApiErrorCode | null;

  bootstrap: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: (allDevices?: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
  clearEndedReason: () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  status: 'restoring',
  user: null,
  endedReason: null,

  /**
   * Runs once at launch. Tokens come off the keystore; the user is re-read
   * from the server rather than cached, so a role change, a new discount cap
   * or a deactivation is picked up the moment the app opens.
   */
  bootstrap: async () => {
    const { accessToken, refreshToken } = await tokenStorage.load();
    if (!accessToken || !refreshToken) {
      set({ status: 'signedOut', user: null });
      return;
    }
    try {
      const user = await authApi.me();
      useSettingsStore.getState().setLanguage(fromServerLanguage(user.preferredLang));
      set({ status: 'signedIn', user, endedReason: null });
    } catch (error) {
      const apiError = error instanceof ApiError ? error : null;
      // Offline at launch is not a reason to throw someone out — keep the
      // tokens and let them retry. Anything else means the session is dead.
      if (apiError?.isOffline) {
        set({ status: 'signedOut', user: null, endedReason: apiError.code });
        return;
      }
      await tokenStorage.clear();
      set({ status: 'signedOut', user: null, endedReason: apiError?.code ?? 'UNAUTHENTICATED' });
    }
  },

  signIn: async (username, password) => {
    const result = await authApi.login(username, password);
    await tokenStorage.save({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    // The account's own language preference wins over the device default.
    useSettingsStore.getState().setLanguage(fromServerLanguage(result.user.preferredLang));
    set({ status: 'signedIn', user: result.user, endedReason: null });
  },

  signOut: async (allDevices = false) => {
    try {
      await authApi.logout(allDevices);
    } catch {
      // Even if the server cannot be reached, the device must forget the tokens.
    }
    await tokenStorage.clear();
    set({ status: 'signedOut', user: null, endedReason: null });
  },

  refreshUser: async () => {
    if (get().status !== 'signedIn') return;
    try {
      set({ user: await authApi.me() });
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
  useAuthStore.setState({ status: 'signedOut', user: null, endedReason: reason });
});

// ── Selectors ────────────────────────────────────────────────
export const useCurrentUser = (): PublicUser | null => useAuthStore((s) => s.user);
export const useIsAdmin = (): boolean => useAuthStore((s) => s.user?.role === 'ADMIN');

/** ADMIN holds every permission implicitly, exactly as the server treats it. */
export function useHasPermission(permission: PermissionKey): boolean {
  return useAuthStore((s) => {
    if (!s.user) return false;
    if (s.user.role === 'ADMIN') return true;
    return s.user.permissions?.[permission] === true;
  });
}
