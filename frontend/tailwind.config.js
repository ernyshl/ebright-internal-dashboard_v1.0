/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#b91c1c',
          light: '#fef2f2',
          dark: '#7f1d1d',
        },
      },
    },
  },
  plugins: [],
}
