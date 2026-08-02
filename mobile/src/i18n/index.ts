import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import en from './locales/en.json';
import gu from './locales/gu.json';

export const LANGUAGES = ['en', 'gu'] as const;
export type AppLanguage = (typeof LANGUAGES)[number];

export const LANGUAGE_LABEL: Record<AppLanguage, string> = {
  en: 'English',
  gu: 'ગુજરાતી',
};

/** Short label for the header toggle. */
export const LANGUAGE_SHORT: Record<AppLanguage, string> = {
  en: 'EN',
  gu: 'ગુ',
};

export const isAppLanguage = (value: unknown): value is AppLanguage =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);

/** The device language, when we can honour it. Falls back to English. */
export function deviceLanguage(): AppLanguage {
  const code = getLocales()[0]?.languageCode;
  return code === 'gu' ? 'gu' : 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    gu: { translation: gu },
  },
  lng: deviceLanguage(),
  fallbackLng: 'en',
  // Digits, currency and quantities stay Western in both languages — money on
  // an invoice must read the same way to everyone at the counter.
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(language: AppLanguage): void {
  void i18n.changeLanguage(language);
}

/** Maps the server's Language enum onto the app's codes. */
export const fromServerLanguage = (value: 'EN' | 'GU'): AppLanguage => (value === 'GU' ? 'gu' : 'en');
export const toServerLanguage = (value: AppLanguage): 'EN' | 'GU' => (value === 'gu' ? 'GU' : 'EN');

export default i18n;
