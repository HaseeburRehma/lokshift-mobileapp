/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind needs file globs that include every component path that
  // emits className strings; otherwise Tailwind tree-shakes the classes
  // and they render unstyled.
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  // `darkMode: 'class'` lets the theme provider toggle dark mode
  // programmatically via NativeWind's setColorScheme(). System mode is
  // honoured automatically when no explicit override is set.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#0064E0',     // same as webapp
          dark:    '#0050B3',
          light:   '#EAF3FE',
        },
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
}
