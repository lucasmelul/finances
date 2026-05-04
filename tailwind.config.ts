import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tokens semánticos del DESIGN_BRIEF (paleta dark-first)
        bg: {
          base: 'hsl(var(--bg-base) / <alpha-value>)',
          surface: 'hsl(var(--bg-surface) / <alpha-value>)',
          elevated: 'hsl(var(--bg-elevated) / <alpha-value>)',
        },
        border: {
          subtle: 'hsl(var(--border-subtle) / <alpha-value>)',
          hover: 'hsl(var(--border-hover) / <alpha-value>)',
        },
        text: {
          primary: 'hsl(var(--text-primary) / <alpha-value>)',
          secondary: 'hsl(var(--text-secondary) / <alpha-value>)',
          muted: 'hsl(var(--text-muted) / <alpha-value>)',
        },
        accent: 'hsl(var(--accent) / <alpha-value>)',
        positive: 'hsl(var(--positive) / <alpha-value>)',
        negative: 'hsl(var(--negative) / <alpha-value>)',
        warning: 'hsl(var(--warning) / <alpha-value>)',
        info: 'hsl(var(--info) / <alpha-value>)',
        // Buckets — colores asignados por el diseño (Design Canvas)
        bucket: {
          corto: '#22D3EE',
          medio: '#A78BFA',
          largo: '#34D399',
          trade: '#FB923C',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"SF Mono"', 'ui-monospace', 'Menlo', 'monospace'],
      },
      fontSize: {
        display: ['2.5rem', { lineHeight: '1.1', fontWeight: '600' }],
        micro: ['0.625rem', { lineHeight: '1rem', fontWeight: '500' }],
      },
      borderRadius: {
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
      },
      keyframes: {
        'flash-positive': {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'hsl(var(--positive) / 0.15)' },
        },
        'flash-negative': {
          '0%, 100%': { backgroundColor: 'transparent' },
          '50%': { backgroundColor: 'hsl(var(--negative) / 0.15)' },
        },
        'pulse-dot': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        'flash-positive': 'flash-positive 600ms ease-out',
        'flash-negative': 'flash-negative 600ms ease-out',
        'pulse-dot': 'pulse-dot 1.2s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
