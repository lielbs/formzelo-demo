/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: { DEFAULT: '#18212D', 700: '#243142', 600: '#334357' },
        // 700 / 800 carry white text and small orange text at WCAG AA (≥4.5:1); DEFAULT is the brand accent for marks and large display.
        orange: { DEFAULT: '#E96B3D', 600: '#D35A2E', 700: '#BF4F28', 800: '#A6431F', 50: '#FDF0EB', 100: '#FADFD4' },
        // Warm paper neutrals: the same surface family as the Formangle splash, Tables and guest pages.
        cloud: { DEFAULT: '#F5F3EF', 100: '#FAF9F6', 200: '#EAE6DF', 300: '#D9D3C9' },
        teal: { DEFAULT: '#3A8A78', 600: '#2F7263', 50: '#EAF4F1' },
        ink: { DEFAULT: '#1E2935', muted: '#5B6675', soft: '#8A94A3' },
      },
      fontFamily: {
        sans: ['Rubik', 'system-ui', '-apple-system', '"Segoe UI"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        // Surfaces sit on the paper background with a hairline, not a floating shadow (calm, precise).
        card: '0 0 0 1px rgba(24,33,45,0.08), 0 1px 1px rgba(24,33,45,0.03)',
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
