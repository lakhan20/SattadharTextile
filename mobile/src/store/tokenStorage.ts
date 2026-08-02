import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Tokens live in the device keystore/keychain, not in AsyncStorage.
 * SecureStore has no web implementation, so the web target falls back —
 * acceptable because the shop runs on Android.
 */

const ACCESS_KEY = 'sattadhar.accessToken';
const REFRESH_KEY = 'sattadhar.refreshToken';

const secureAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

async function readItem(key: string): Promise<string | null> {
  try {
    return secureAvailable ? await SecureStore.getItemAsync(key) : await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function writeItem(key: string, value: string): Promise<void> {
  try {
    if (secureAvailable) await SecureStore.setItemAsync(key, value);
    else await AsyncStorage.setItem(key, value);
  } catch {
    // A device with no keystore still needs to work; the user simply signs in again.
  }
}

async function removeItem(key: string): Promise<void> {
  try {
    if (secureAvailable) await SecureStore.deleteItemAsync(key);
    else await AsyncStorage.removeItem(key);
  } catch {
    /* nothing useful to do */
  }
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * Kept in memory as well as on disk. The axios interceptor reads it on every
 * request and must not await storage each time.
 */
let cache: Partial<TokenPair> = {};

export const tokenStorage = {
  getAccess: (): string | undefined => cache.accessToken,
  getRefresh: (): string | undefined => cache.refreshToken,

  async load(): Promise<Partial<TokenPair>> {
    const [accessToken, refreshToken] = await Promise.all([readItem(ACCESS_KEY), readItem(REFRESH_KEY)]);
    cache = { accessToken: accessToken ?? undefined, refreshToken: refreshToken ?? undefined };
    return cache;
  },

  async save(tokens: TokenPair): Promise<void> {
    cache = { ...tokens };
    await Promise.all([writeItem(ACCESS_KEY, tokens.accessToken), writeItem(REFRESH_KEY, tokens.refreshToken)]);
  },

  async saveAccess(accessToken: string): Promise<void> {
    cache.accessToken = accessToken;
    await writeItem(ACCESS_KEY, accessToken);
  },

  async clear(): Promise<void> {
    cache = {};
    await Promise.all([removeItem(ACCESS_KEY), removeItem(REFRESH_KEY)]);
  },
};
