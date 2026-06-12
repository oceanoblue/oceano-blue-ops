import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#bae0fd',
          300: '#7cc6fc',
          400: '#36a8f8',
          500: '#0c8de9',
          600: '#006fc7',
          700: '#0159a1',
          800: '#064b85',
          900: '#0b406e',
          950: '#072849',
        },
        // Bold-editorial ink — the brand's deep blue-black.
        ink: {
          50: '#f4f6f8',
          100: '#e6eaee',
          200: '#c9d2da',
          300: '#a0afbd',
          400: '#708698',
          500: '#50677c',
          600: '#3d5266',
          700: '#324354',
          800: '#2b3947',
          900: '#1d2935',
          950: '#0c1620',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 1px 2px rgb(12 22 32 / 0.04), 0 4px 12px rgb(12 22 32 / 0.05)',
        lift: '0 2px 4px rgb(12 22 32 / 0.06), 0 12px 28px rgb(12 22 32 / 0.10)',
        glow: '0 0 0 1px rgb(12 141 233 / 0.18), 0 8px 30px rgb(12 141 233 / 0.18)',
      },
      transitionTimingFunction: {
        // Swift settle — the default motion voice of the app.
        swift: 'cubic-bezier(0.22, 1, 0.36, 1)',
        // Playful overshoot for small elements (checks, pills, toasts).
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        rise: {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          from: { backgroundPosition: '200% 0' },
          to: { backgroundPosition: '-200% 0' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        rise: 'rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.4s ease-out both',
        'scale-in': 'scale-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 2.2s linear infinite',
        'float-slow': 'float-slow 7s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
