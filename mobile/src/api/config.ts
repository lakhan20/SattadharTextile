import Constants from 'expo-constants';

/** The port the Express API listens on. */
export const API_PORT = 4000;
export const API_PREFIX = '/api/v1';

/**
 * Production default — the shop's live API on Oracle Cloud. Normally the build
 * sets EXPO_PUBLIC_API_URL (see mobile/eas.json) and this is never read; it is
 * the fallback for a release build made without that variable, so it must be a
 * real address rather than a placeholder. More → Server settings still wins.
 */
export const PRODUCTION_BASE_URL = 'https://130.210.50.78.nip.io';

/**
 * While developing, the phone is on the same Wi-Fi as the laptop, so
 * `localhost` points at the phone itself and nothing answers. Expo tells us
 * the laptop's LAN address in `hostUri` ("192.168.1.5:8081") — reuse that host
 * with the API port so a device running Expo Go connects with no typing.
 */
export function detectedLanBaseUrl(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost ?? null;
  const host = hostUri?.split(':')[0]?.trim();
  if (!host || !isPrivateIpv4(host)) return null;
  return `http://${host}:${API_PORT}`;
}

/**
 * Only a private LAN address is worth guessing from. Under `expo start --tunnel`
 * the host is something like `xyz.exp.direct`, and the API is certainly not
 * sitting on port 4000 of that — better to fall back than to guess wrong.
 */
function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map(Number);
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a = 0, b = 0] = octets;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

export function defaultBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);
  if (__DEV__) return detectedLanBaseUrl() ?? `http://localhost:${API_PORT}`;
  return PRODUCTION_BASE_URL;
}

export const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

/** Accepts "shop.example.com" and fills in https:// so people can type less. */
export function normaliseBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return stripTrailingSlash(withScheme);
}

export function isValidBaseUrl(raw: string): boolean {
  try {
    const url = new URL(normaliseBaseUrl(raw));
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Product images come back as a path relative to the API origin (e.g.
 * `/uploads/products/xyz.jpg`), served outside `/api/v1`. `baseUrl` is
 * required rather than read here, since the caller already has it from the
 * settings store and this stays a pure function either way.
 */
export function resolveMediaUrl(path: string | null | undefined, baseUrl: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  return `${stripTrailingSlash(baseUrl)}${path.startsWith('/') ? path : `/${path}`}`;
}
