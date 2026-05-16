/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#e6f6ff',
          100: '#bfe6fb',
          300: '#5cc8f0',
          500: '#1ba6d6',
          600: '#0a78a0',
          700: '#075b7a'
        },
        navy: {
          900: '#0a1628',
          800: '#0f1f38',
          700: '#142747',
          600: '#1c3360'
        }
      }
    }
  },
  plugins: []
}
