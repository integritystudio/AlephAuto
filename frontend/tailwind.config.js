/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        emerald: {
          50: '#f0fdf4',
          500: '#10b981',
        },
        amber: {
          50: '#fffbeb',
          500: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
};
