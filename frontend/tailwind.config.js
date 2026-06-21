/** @type {import('tailwindcss').Config} */
// Colours are CSS-variable-backed so tutor themes can re-skin the public
// site at runtime. The values are set in src/themes.css (one block per
// theme-* class). The :root block holds the platform default, so any
// surface not inside a theme- container looks identical to the previous
// hard-coded palette.
//
// New design-system tokens (fonts, radii, shadows, transitions) are
// additive — they extend Tailwind's defaults rather than replacing
// anything, so existing pages keep their current look while modernised
// pages opt in by referencing the new tokens directly.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    // Static chrome template — single source of truth for the apex
    // signed-out Navbar + Footer (also consumed by the news-chrome-rewriter
    // sidecar that skins /news with the same chrome). Tailwind needs to
    // scan it so the classes used here end up in the compiled bundle.
    "./src/components/apex_chrome.signed_out.html",
  ],
  theme: {
    extend: {
      colors: {
        'kotoba-primary': 'rgb(var(--kotoba-primary-rgb) / <alpha-value>)',
        'kotoba-secondary': 'rgb(var(--kotoba-secondary-rgb) / <alpha-value>)',
        'kotoba-secondary-dark': 'rgb(var(--kotoba-secondary-dark-rgb) / <alpha-value>)',
        'kotoba-accent': 'rgb(var(--kotoba-accent-rgb) / <alpha-value>)',
        'kotoba-background': 'rgb(var(--kotoba-background-rgb) / <alpha-value>)',
        'kotoba-text': 'rgb(var(--kotoba-text-rgb) / <alpha-value>)',
      },
      fontFamily: {
        // Sans default — humanist + warm. Looks friendly without going
        // childish. Falls back through the system stack so we keep
        // working before/while Google Fonts loads.
        sans: [
          'Quicksand',
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        // Display serif used sparingly — hero headlines, section
        // titles. Fraunces is warm + flexible (humanist serif with
        // optical sizing). Lora is the fallback.
        display: ['Fraunces', 'Lora', 'Georgia', 'serif'],
      },
      borderRadius: {
        // Boutique rounded language — most surfaces use 2xl–3xl.
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        // Soft, layered shadows — warmer than Tailwind's default
        // greyscale drops. Used on cards + hovers.
        'soft': '0 1px 2px rgba(64, 60, 50, 0.04), 0 8px 24px rgba(64, 60, 50, 0.06)',
        'soft-lg': '0 4px 8px rgba(64, 60, 50, 0.05), 0 18px 40px rgba(64, 60, 50, 0.10)',
        'soft-glow': '0 0 0 1px rgba(64, 60, 50, 0.04), 0 8px 24px rgba(64, 60, 50, 0.06), 0 0 24px rgba(214, 164, 47, 0.18)',
      },
      transitionTimingFunction: {
        // Friendly motion — slight overshoot on enter, easy on exit.
        'soft': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      keyframes: {
        // Gentle fade-up used on hero copy + cards as they enter the
        // viewport. Kept short so it doesn't feel theatrical.
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both',
      },
    },
  },
  plugins: [],
}
