// i18n bootstrap. Lazy-loads locale bundles and falls through to English
// when a key or language is missing.
//
// Adding a new language:
//   1. Create src/i18n/locales/<code>/common.json (and any other namespaces)
//   2. Add the code to SUPPORTED_LOCALES below
//   3. Optionally update LANGUAGE_NAMES so the picker shows the native label
//
// We deliberately ship every locale chunk as a separate import() so an EN
// visitor doesn't download Greek strings they'll never use.

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';

// Supported languages — extend as translators land bundles. Keys are
// IETF BCP-47 codes; the resolver collapses regional variants
// (en-GB → en) by default.
export const SUPPORTED_LOCALES = ['en'];

// Native names for the picker. Translator hands you back a string for
// their language, you drop it here.
export const LANGUAGE_NAMES = {
  en: 'English',
  // el: 'Ελληνικά',
  // es: 'Español',
  // it: 'Italiano',
  // ja: '日本語',
};

// Resources used at boot. English is bundled so the initial render never
// has to wait on a network fetch. Other locales lazy-load via
// `loadLocale()` below.
const RESOURCES = {
  en: {
    common: enCommon,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: RESOURCES,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LOCALES,
    nonExplicitSupportedLngs: true, // 'en-US' → 'en'
    defaultNS: 'common',
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      // Order matters: explicit user choice wins, then browser, then HTML.
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'kotobaseed:lang',
      caches: ['localStorage'],
    },
    react: {
      useSuspense: false,
    },
  });

/**
 * Dynamically load + register a locale's bundles after first paint.
 * Returns a promise that resolves once i18next knows about the locale.
 * Safe to call repeatedly — i18next dedupes resource adds.
 */
export async function loadLocale(code) {
  if (code === 'en' || !SUPPORTED_LOCALES.includes(code)) return;
  try {
    const common = await import(`./locales/${code}/common.json`);
    i18n.addResourceBundle(code, 'common', common.default, true, true);
  } catch (err) {
    // Bundle doesn't exist yet — that's fine; i18next will keep falling
    // through to English.
    console.warn(`i18n: locale bundle ${code}/common not found`, err);
  }
}

export default i18n;
