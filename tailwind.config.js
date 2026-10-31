/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        midnight: { DEFAULT: '#18212D', 700: '#243142', 600: '#334357' },
        // 700 / 800 carry white text and small orange text at WCAG AA (≥4.5:1); DEFAULT is the brand accent for marks and large display.
        orange: { DEFAULT: '#E96B3D', 600: '#D35A2E', 700: '#BF4F28', 800: '#A6431F', 50: '#FDF0EB', 100: '#FADFD4' },
        cloud: { DEFAULT: '#F5F6F8', 200: '#E8EAEE', 300: '#D9DDE3' },
        teal: { DEFAULT: '#3A8A78', 600: '#2F7263', 50: '#EAF4F1' },
        ink: { DEFAULT: '#1E2935', muted: '#5B6675', soft: '#8A94A3' },
      },
      fontFamily: {
        sans: ['Rubik', 'system-ui', '-apple-system', '"Segoe UI"', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(24,33,45,0.04), 0 4px 16px rgba(24,33,45,0.06)',
        lift: '0 12px 40px rgba(24,33,45,0.12)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-up': 'fade-up .25s ease-out both' },
    },
  },
  plugins: [],
};
