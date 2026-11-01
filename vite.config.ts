/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Routes that get their own static entry (`<route>.html`, a copy of index.html). Static hosts
 * that map extensionless URLs to .html (GitHub Pages, Cloudflare Pages, Netlify) then answer
 * these deep links with 200 instead of the 404.html fallback — better for link previews and
 * crawlers. Any other path still works through 404.html (copied in the deploy workflow).
 */
export const STATIC_ROUTES = ['demo', 'pricing', 'themes', 'tour', 'privacy', 'app', 'f/bloom-flowers', 'f/autocare-repairs', 'f/urban-table-events', 'f/urban-table-booking', 'f/valley-run'];

/**
 * Content-Security-Policy for the built site (static hosting cannot send headers). Everything
 * is self-hosted; data:/blob: cover uploaded images, QR previews and downloads. Not applied to
 * the dev server, whose HMR client needs inline scripts and websockets.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function site(siteUrl: string): Plugin {
  return {
    name: 'formangle-site',
    enforce: 'post',
    transformIndexHtml: {
      order: 'pre',
      handler: (html, ctx) => {
        let out = html.replace(/__SITE_URL__/g, siteUrl);
        if (!ctx.server) out = out.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
        return out;
      },
    },
    // Runs after Vite has emitted the final index.html, so each copy is byte-identical.
    generateBundle(_, bundle) {
      const html = bundle['index.html'];
      if (html?.type !== 'asset') return;
      for (const route of STATIC_ROUTES) this.emitFile({ type: 'asset', fileName: `${route}.html`, source: html.source });
    },
  };
}

// GitHub Pages serves the site from /<repo>/; the workflow sets VITE_BASE accordingly.
// VITE_SITE_URL: the public address (a future custom domain); defaults to the Pages URL for og:image.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const base = env.VITE_BASE || '/';
  const siteUrl = (env.VITE_SITE_URL || 'https://lielbs.github.io/formzelo-demo').replace(/\/$/, '');
  return {
    base,
    plugins: [react(), site(siteUrl)],
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
    test: { environment: 'node', include: ['src/**/*.test.ts'], css: { include: [/premium.css/, /signature.css/, /media.css/] } },
  };
});
