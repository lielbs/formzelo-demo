/**
 * End-to-end tests of the production build path against the disposable local Supabase stack.
 * Run (after `supabase start` and `supabase functions serve` with FORMANGLE_APP_ORIGIN=http://localhost:5174):
 *   E2E_SUPABASE_PUBLISHABLE_KEY=... E2E_SUPABASE_SERVICE_KEY=... npx playwright test
 * The dev server only accepts the local stack in this mode; production builds never do.
 */
import { defineConfig, devices } from '@playwright/test';

const publishableKey = process.env.E2E_SUPABASE_PUBLISHABLE_KEY ?? '';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    channel: process.env.E2E_BROWSER_CHANNEL ?? 'msedge',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Edge'], viewport: { width: 1280, height: 860 } } }],
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      VITE_FORMANGLE_MODE: 'production',
      VITE_FORMANGLE_LOCAL_STACK: 'true',
      VITE_SUPABASE_PROJECT_REF: 'ppgdbqhwbzlgzwsjmkor',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    },
  },
});
