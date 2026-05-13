/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#e6f6fc',
          100: '#cdedf9',
          500: '#1ba6d6',
          600: '#0f95c4',
          700: '#0a78a0'
        }
      }
    }
  },
  plugins: []
}
