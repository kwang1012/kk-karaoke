/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      textColor: {
        primary: '#cc3363',
      },
      backgroundColor: {
        primary: '#cc3363',
      },
      boxShadow: {
        5: '0 3px 8px rgba(0, 0, 0, 0.24)',
        app: '0 4px 12px rgba(0,0,0,0.1)',
      },
    },
  },
  plugins: [],
};
