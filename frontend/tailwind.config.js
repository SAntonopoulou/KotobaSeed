/** @type {import('tailwindcss').Config} */
// Colours are CSS-variable-backed so tutor themes can re-skin the public
// site at runtime. The values are set in src/themes.css (one block per
// theme-* class). The :root block holds the platform default, so any
// surface not inside a theme- container looks identical to the previous
// hard-coded palette.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
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
    },
  },
  plugins: [],
}
