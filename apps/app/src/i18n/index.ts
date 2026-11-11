import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next, useTranslation } from "react-i18next";
import { create } from "zustand";
import { kvGet, kvSet } from "../security/kv";
import { en } from "./locales/en";
import { pt } from "./locales/pt";
import {
  FALLBACK_LANGUAGE,
  isLanguagePreference,
  type Language,
  type LanguagePreference,
  resolveLanguage,
} from "./resolve";

const KEY = "wallt.language";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof en };
  }
}

function deviceLocales(): string[] {
  try {
    return getLocales().map((l) => l.languageTag);
  } catch {
    return [];
  }
}

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, pt: { translation: pt } },
  lng: FALLBACK_LANGUAGE, // the real language is applied after mount (hydrate) so static HTML and hydration agree
  fallbackLng: FALLBACK_LANGUAGE,
  interpolation: { escapeValue: false }, // React escapes
  returnNull: false,
});

interface LanguageState {
  preference: LanguagePreference;
  setPreference: (p: LanguagePreference) => void;
  hydrate: () => Promise<void>;
}

function apply(preference: LanguagePreference): Language {
  const lang = resolveLanguage(preference, deviceLocales());
  void i18n.changeLanguage(lang);
  return lang;
}

export const useLanguageStore = create<LanguageState>((set) => ({
  preference: "system",
  setPreference: (preference) => {
    set({ preference });
    apply(preference);
    void kvSet(KEY, preference);
  },
  hydrate: async () => {
    const stored = await kvGet(KEY);
    const preference = isLanguagePreference(stored) ? stored : "system";
    set({ preference });
    apply(preference);
  },
}));

export { i18n, useTranslation };
