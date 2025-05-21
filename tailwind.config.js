/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bitcoin: {
          orange: '#F7931A',
          light: '#FAB959',
          dark: '#D87B0A',
        },
        primary: {
          50: '#F6F7FF',
          100: '#EDF0FE',
          200: '#D6DCFC',
          300: '#B3BEFA',
          400: '#8C9EF7',
          500: '#667EF5',
          600: '#3A5FF3',
          700: '#1A43E4',
          800: '#1537BE',
          900: '#112C95',
        },
        accent: {
          500: '#F7931A',
          600: '#FFB547',
          700: '#D87B0A',
        },
        surface: {
          900: '#181A20',
          800: '#23272F',
          700: '#2C313A',
        },
        success: {
          50: '#ECFDF5',
          500: '#10B981',
          700: '#047857',
        },
        warning: {
          50: '#FFFBEB',
          500: '#F59E0B',
          700: '#B45309',
        },
        error: {
          50: '#FEF2F2',
          500: '#EF4444',
          700: '#B91C1C',
        },
        gray: {
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
        },
      },
      animation: {
        'bounce-slow': 'bounce 3s ease-in-out infinite',
        'pulse-slow': 'pulse 4s ease-in-out infinite',
      },
      boxShadow: {
        'inner-lg': 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
      },
    },
  },
  plugins: [],
};