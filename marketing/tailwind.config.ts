import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Core editorial palette
        ink: '#0B0B0E',        // near-black
        paper: '#F3EFE6',      // warm off-white
        bone: '#E7E1D4',       // slightly deeper paper
        // Brand ocean
        ocean: {
          DEFAULT: '#1452F0',  // electric blue
          deep: '#0A1E46',     // deep navy
          mid: '#0C3FB0',
          soft: '#9EC1FF',
        },
        // Editorial accent
        coral: '#FF5A36',
        sand: '#E8C36B',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        grotesk: ['var(--font-grotesk)', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        // Fluid editorial display sizes
        'mega': ['clamp(3rem, 13vw, 12rem)', { lineHeight: '0.86', letterSpacing: '-0.03em' }],
        'giant': ['clamp(2.5rem, 8vw, 7rem)', { lineHeight: '0.9', letterSpacing: '-0.02em' }],
        'huge': ['clamp(2rem, 5vw, 4.5rem)', { lineHeight: '0.95', letterSpacing: '-0.02em' }],
      },
      letterSpacing: {
        kicker: '0.28em',
      },
      maxWidth: {
        edge: '1680px',
      },
      transitionTimingFunction: {
        editorial: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(28px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'grain': {
          '0%,100%': { transform: 'translate(0,0)' },
          '10%': { transform: 'translate(-5%,-5%)' },
          '30%': { transform: 'translate(3%,-8%)' },
          '50%': { transform: 'translate(-4%,6%)' },
          '70%': { transform: 'translate(6%,3%)' },
          '90%': { transform: 'translate(-3%,4%)' },
        },
      },
      animation: {
        marquee: 'marquee 38s linear infinite',
        'marquee-slow': 'marquee 60s linear infinite',
        grain: 'grain 8s steps(6) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
