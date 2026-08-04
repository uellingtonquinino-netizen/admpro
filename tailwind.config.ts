import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/renderer/**/*.{ts,tsx,html}',
    './src/web/**/*.{ts,tsx,html}',
  ],
  darkMode: 'class',

  theme: {
    extend: {

      // ── Paleta brand ──────────────────────────────────
      colors: {
        brand: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#2f7ff5',
          600: '#1c64e8',
          700: '#1650c2',
          800: '#173f92',
          900: '#173872',
          950: '#0f2249',
        },
        surface: {
          DEFAULT: '#1e293b',
          card:    '#262624',
          hover:   '#2a374d',
          border:  '#3d4d68',
        },
        gray: {
          50:  '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#a3b1c6',
          500: '#8996ac',
          600: '#6b7890',
          700: '#4f5b70',
          800: '#374357',
          900: '#232c3d',
          950: '#161d29',
        },
      },

      // ── Tipografia ────────────────────────────────────
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },

      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },

      // ── Sombras ───────────────────────────────────────
      boxShadow: {
        card:   '0 1px 3px 0 rgb(0 0 0 / 0.4), 0 1px 2px -1px rgb(0 0 0 / 0.4)',
        glow:   '0 0 20px rgb(47 127 245 / 0.35)',
        'glow-sm': '0 0 10px rgb(47 127 245 / 0.25)',
      },

      // ── Border radius ─────────────────────────────────
      borderRadius: {
        '4xl': '2rem',
      },

      // ── Animações ─────────────────────────────────────
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)'   },
        },
        'slide-in': {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)'     },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)'    },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
      },

      animation: {
        'fade-in':  'fade-in 0.2s ease-out',
        'slide-in': 'slide-in 0.25s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
        shimmer:    'shimmer 1.5s infinite linear',
      },

      // ── Transitions ───────────────────────────────────
      transitionDuration: {
        '250': '250ms',
      },
    },
  },

  plugins: [],
} satisfies Config
