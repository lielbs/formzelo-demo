/** Colours, type family and corner radii come from CSS variables (src/theme/tokens.css). */
const v = (name) => `rgb(var(--fz-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: { DEFAULT: v('midnight'), 700: v('midnight-700'), 600: v('midnight-600') },
        // 700 / 800 carry white text and small orange text at WCAG AA (≥4.5:1); DEFAULT is the brand accent for marks and large display.
        orange: { DEFAULT: v('orange'), 600: v('orange-600'), 700: v('orange-700'), 800: v('orange-800'), 50: v('orange-50'), 100: v('orange-100') },
        // Warm paper neutrals: the same surface family as the Formangle splash, Tables and guest pages.
        cloud: { DEFAULT: v('cloud'), 100: v('cloud-100'), 200: v('cloud-200'), 300: v('cloud-300') },
        teal: { DEFAULT: '#3A8A78', 600: '#2F7263', 50: '#EAF4F1' },
        ink: { DEFAULT: v('ink'), muted: v('ink-muted'), soft: v('ink-soft') },
      },
      borderRadius: { lg: 'var(--fz-r-lg)', xl: 'var(--fz-r-xl)', '2xl': 'var(--fz-r-2xl)' },
      fontFamily: {
        sans: ['var(--fz-font)', 'Rubik', 'system-ui', '-apple-system', '"Segoe UI"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        // Surfaces sit on the paper background with a hairline, not a floating shadow (calm, precise).
        card: '0 0 0 1px rgb(var(--fz-hairline) / var(--fz-hairline-a)), 0 1px 1px rgb(var(--fz-hairline) / 0.03)',
        lift: '0 0 0 1px rgba(24,33,45,0.05), 0 18px 48px -12px rgba(24,33,45,0.22)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-up': 'fade-up .25s ease-out both' },
    },
  },
  plugins: [],
};
