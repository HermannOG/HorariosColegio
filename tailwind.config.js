/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          50: '#f3f5f8',
          100: '#e4e8ef',
          200: '#c7d0de',
          300: '#9fadc4',
          400: '#6f82a3',
          500: '#4d5f85',
          600: '#37456b',
          700: '#2a3457',
          800: '#1f2745',
          900: '#161c34',
          950: '#0e1224',
        },
        sage: {
          50: '#f1f6f0',
          100: '#dfeada',
          200: '#bfd5b6',
          300: '#98ba8a',
          400: '#719f60',
          500: '#557f45',
          600: '#436435',
          700: '#374f2c',
          800: '#2d4024',
          900: '#26351f',
        },
        clay: {
          50: '#fcf3ec',
          100: '#f8e3d1',
          200: '#f0c4a0',
          300: '#e7a268',
          400: '#dd8240',
          500: '#c4682a',
          600: '#9f5121',
          700: '#7d3f1c',
          800: '#5f311a',
          900: '#4a2716',
        },
        paper: '#f7f4ee',
      },
      fontFamily: {
        display: ['"Fraunces"', 'Georgia', 'serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
}
