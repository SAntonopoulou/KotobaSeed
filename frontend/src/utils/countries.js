// Stripe Connect Express supported countries (ISO-3166 alpha-2).
// Source: Stripe Connect docs as of 2026. Used by the tutor signup
// country picker so we never send Stripe a country it can't open an
// Express account in.
//
// Kept as a flat array of [code, label] tuples so the picker can render
// it directly. Sorted by label so the dropdown isn't accidentally
// ordered "AE, AT, AU…".
export const STRIPE_CONNECT_COUNTRIES = [
  ['AE', 'United Arab Emirates'],
  ['AT', 'Austria'],
  ['AU', 'Australia'],
  ['BE', 'Belgium'],
  ['BG', 'Bulgaria'],
  ['BR', 'Brazil'],
  ['CA', 'Canada'],
  ['CH', 'Switzerland'],
  ['CY', 'Cyprus'],
  ['CZ', 'Czechia'],
  ['DE', 'Germany'],
  ['DK', 'Denmark'],
  ['EE', 'Estonia'],
  ['ES', 'Spain'],
  ['FI', 'Finland'],
  ['FR', 'France'],
  ['GB', 'United Kingdom'],
  ['GI', 'Gibraltar'],
  ['GR', 'Greece'],
  ['HK', 'Hong Kong'],
  ['HR', 'Croatia'],
  ['HU', 'Hungary'],
  ['IE', 'Ireland'],
  ['IN', 'India'],
  ['IT', 'Italy'],
  ['JP', 'Japan'],
  ['LI', 'Liechtenstein'],
  ['LT', 'Lithuania'],
  ['LU', 'Luxembourg'],
  ['LV', 'Latvia'],
  ['MT', 'Malta'],
  ['MX', 'Mexico'],
  ['MY', 'Malaysia'],
  ['NL', 'Netherlands'],
  ['NO', 'Norway'],
  ['NZ', 'New Zealand'],
  ['PL', 'Poland'],
  ['PT', 'Portugal'],
  ['RO', 'Romania'],
  ['SE', 'Sweden'],
  ['SG', 'Singapore'],
  ['SI', 'Slovenia'],
  ['SK', 'Slovakia'],
  ['TH', 'Thailand'],
  ['US', 'United States'],
].sort((a, b) => a[1].localeCompare(b[1]));

// Map IANA timezone region to ISO country code so we can guess sensibly
// when the user hasn't picked one yet. Not exhaustive — only the
// regions we see on Kotobaseed today. Falls back to GR if no match (we
// won't be wrong often, since this app started in Greece).
const TIMEZONE_TO_COUNTRY = {
  'Europe/Athens': 'GR',
  'Europe/London': 'GB',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE',
  'Europe/Lisbon': 'PT',
  'Europe/Dublin': 'IE',
  'Europe/Warsaw': 'PL',
  'Europe/Prague': 'CZ',
  'Europe/Vienna': 'AT',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK',
  'Europe/Helsinki': 'FI',
  'Europe/Budapest': 'HU',
  'Europe/Bucharest': 'RO',
  'Europe/Sofia': 'BG',
  'Europe/Zagreb': 'HR',
  'Europe/Vilnius': 'LT',
  'Europe/Riga': 'LV',
  'Europe/Tallinn': 'EE',
  'Europe/Ljubljana': 'SI',
  'Europe/Bratislava': 'SK',
  'Europe/Luxembourg': 'LU',
  'Europe/Malta': 'MT',
  'Europe/Nicosia': 'CY',
  'Europe/Zurich': 'CH',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Mexico_City': 'MX',
  'America/Sao_Paulo': 'BR',
  'Asia/Tokyo': 'JP',
  'Asia/Hong_Kong': 'HK',
  'Asia/Singapore': 'SG',
  'Asia/Bangkok': 'TH',
  'Asia/Kolkata': 'IN',
  'Asia/Dubai': 'AE',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Pacific/Auckland': 'NZ',
};

// Best guess at the user's country from their browser timezone.
// Used as the default value in the picker; the user can override.
export const guessCountryFromBrowser = () => {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return TIMEZONE_TO_COUNTRY[tz] || null;
  } catch {
    return null;
  }
};

// Best guess at the user's IANA timezone — used as the default in the
// "Timezone" field on tutor signup.
export const guessTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
};
