# Adding a language

Kotobaseed uses [react-i18next](https://react.i18next.com/). Each
language lives in its own folder under `locales/<code>/` and one JSON
file per namespace. We ship one namespace for now (`common`) and add
more (e.g. `dashboard`, `marketplace`) when individual surfaces grow
big enough to justify the split.

## 1. Translator workflow

Send your translator:

- `locales/en/common.json` — the source-of-truth bundle
- A note: keep the key structure identical; only translate the values

They send back a `<code>/common.json` with the same shape.

## 2. Drop it in

Save the file at `locales/<code>/common.json` (e.g.
`locales/el/common.json` for Greek). Then edit `index.js`:

```js
export const SUPPORTED_LOCALES = ['en', 'el'];

export const LANGUAGE_NAMES = {
  en: 'English',
  el: 'Ελληνικά',
};
```

That's it. The dynamic `loadLocale()` import resolves the new bundle
on demand, the picker appears automatically (it hides when only one
locale is supported), and `useTranslation()` resolves keys for the
active language.

## 3. Plural rules

i18next plural keys follow the format `key_one`, `key_other` (and
others for languages with more plural forms — Arabic, Russian). The
existing `booking.duration_minutes_one` / `booking.duration_minutes_other`
pair is the template.

Polish, Russian, Arabic etc. need extra plural forms — see
[i18next plurals docs](https://www.i18next.com/translation-function/plurals)
for the full set.

## 4. Interpolation

`{{name}}` is the placeholder syntax. Translators must keep them
unchanged:

```json
"greeting": "Hi {{name}}, welcome back!"
```

Becomes:

```json
"greeting": "Geia sou {{name}}, kalos irthes pisso!"
```

## 5. RTL languages

When we add Arabic / Hebrew / Persian, the language picker will need to
set `<html dir="rtl">` on those locales. Hook that into the
`changeLanguage` callback in `LanguagePicker.jsx` then.

## 6. Keys that should NOT be translated

- Brand names: "Kotobaseed", "Stripe", "Daily.co"
- URLs
- Code-mode placeholders like `{{count}}` and `{{name}}`
