/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo>/; the workflow sets VITE_BASE accordingly.
export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, '.', '').VITE_BASE || '/',
  plugins: [react()],
  server: { port: 5173, host: 'localhost' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));
