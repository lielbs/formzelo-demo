/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo>/; the workflow sets VITE_BASE accordingly.
export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, '.', '').VITE_BASE || '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: cached across deploys and downloaded in parallel.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\/]node_modules[\/](react|react-dom|scheduler)[\/]/.test(id)) return 'vendor-react';
          if (/[\/]node_modules[\/](react-router|react-router-dom|cookie|set-cookie-parser)[\/]/.test(id)) return 'vendor-router';
          if (/[\/]node_modules[\/]zod[\/]/.test(id)) return 'vendor-zod';
          if (/[\/]node_modules[\/]react-hook-form[\/]/.test(id)) return 'vendor-forms';
          return undefined;
        },
      },
    },
  },
  server: { port: 5173, host: 'localhost' },
  // css.include: the premium-layer test reads premium.css as source (Vitest empties CSS otherwise).
  test: { environment: 'node', include: ['src/**/*.test.ts'], css: { include: [/premium.css/, /signature.css/] } },
}));
