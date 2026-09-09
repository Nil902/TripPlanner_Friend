/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        terracotta: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#ea580c',
          600: '#c2410c',
          700: '#9a3412',
          DEFAULT: '#CC5500',
        },
        'warm-gray': '#FDFCFB',
      },
    },
  },
  plugins: [],
}
