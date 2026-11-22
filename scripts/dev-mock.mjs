#!/usr/bin/env node
// The production app (Tables included) against a local address nothing listens on. Open it with
// `npm run shots:tables`, or from Playwright with e2e/mock/tables-mock.mjs, which answers every call
// with a fictional venue. No real project, key or account is involved.
//   npm run dev:mock            → http://localhost:5198
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const port = process.argv[2] ?? process.env.PORT ?? '5198';
const env = {
  ...process.env,
  VITE_FORMANGLE_MODE: 'production',
  VITE_FORMANGLE_LOCAL_STACK: 'true',
  VITE_SUPABASE_PROJECT_REF: 'ppgdbqhwbzlgzwsjmkor',
  VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mock_key_for_ui_test',
};
const child = spawn('npx', ['vite', '--config', 'scripts/vite.mock.config.mjs', '--port', port, '--strictPort'], { stdio: 'inherit', shell: true, env, cwd: fileURLToPath(new URL('..', import.meta.url)) });
child.on('exit', (code) => process.exit(code ?? 0));
