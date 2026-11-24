import type { Config } from 'tailwindcss';
// Colores leídos de variables CSS: la identidad gráfica se edita desde el panel
// (tabla site_settings.brand) sin recompilar.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          dark: 'rgb(var(--brand-dark) / <alpha-value>)',
          accent: 'rgb(var(--accent) / <alpha-value>)',
        },
        ink: 'rgb(var(--ink) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'], display: ['var(--font-display)', 'system-ui', 'sans-serif'] },
      maxWidth: { site: '1240px' },
    },
  },
  plugins: [],
} satisfies Config;
