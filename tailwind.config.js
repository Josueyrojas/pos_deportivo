/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink:    '#0E1726',
        ink2:   '#16213A',
        brand:  { DEFAULT: '#EA580C', dark: '#C2410C', light: '#FB923C' },
        money:  { DEFAULT: '#059669', dark: '#047857' },
      },
      fontFamily: {
        display: ['Barlow', 'system-ui', 'sans-serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
