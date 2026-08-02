import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultBaseUrl, normaliseBaseUrl } from '../api/config';
import { deviceLanguage, setLanguage, type AppLanguage } from '../i18n';

interface SettingsState {
  /** Origin only — no /api/v1. The client appends the prefix. */
  baseUrl: string;
  language: AppLanguage;
  /** True once the persisted values have been read from disk. */
  hydrated: boolean;

  setBaseUrl: (url: string) => void;
  setLanguage: (language: AppLanguage) => void;
  toggleLanguage: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      baseUrl: defaultBaseUrl(),
      language: deviceLanguage(),
      hydrated: false,

      setBaseUrl: (url) => set({ baseUrl: normaliseBaseUrl(url) }),

      setLanguage: (language) => {
        setLanguage(language);
        set({ language });
      },

      toggleLanguage: () => {
        const next: AppLanguage = get().language === 'en' ? 'gu' : 'en';
        setLanguage(next);
        set({ language: next });
      },
    }),
    {
      name: 'sattadhar.settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ baseUrl: state.baseUrl, language: state.language }),
      onRehydrateStorage: () => (state) => {
        // Apply the saved language to i18next as soon as it comes back.
        if (state?.language) setLanguage(state.language);
        useSettingsStore.setState({ hydrated: true });
      },
    },
  ),
);

/** Read outside React — the axios interceptor needs it synchronously. */
export const currentBaseUrl = (): string => useSettingsStore.getState().baseUrl;
