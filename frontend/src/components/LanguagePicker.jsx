import React from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_NAMES, SUPPORTED_LOCALES, loadLocale } from '../i18n';

// Drop-in language switcher. Renders nothing if only one language is
// available so we don't clutter the UI pre-translation.

const LanguagePicker = ({ className = '' }) => {
  const { i18n } = useTranslation();

  if (SUPPORTED_LOCALES.length <= 1) return null;

  const current = (i18n.resolvedLanguage || 'en').split('-')[0];

  return (
    <select
      value={current}
      onChange={async (e) => {
        const next = e.target.value;
        await loadLocale(next);
        i18n.changeLanguage(next);
      }}
      className={`px-2 py-1 border border-kotoba-text/20 rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-kotoba-primary ${className}`}
      aria-label="Language"
    >
      {SUPPORTED_LOCALES.map((code) => (
        <option key={code} value={code}>
          {LANGUAGE_NAMES[code] || code}
        </option>
      ))}
    </select>
  );
};

export default LanguagePicker;
