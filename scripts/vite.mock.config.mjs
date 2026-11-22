// Dev-server config for `npm run dev:mock`: the project config, plus permission to serve files
// from node_modules when it is a link to another checkout (a git worktree sharing one install).
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mergeConfig, searchForWorkspaceRoot } from 'vite';
import base from '../vite.config.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
export default (env) => mergeConfig(typeof base === 'function' ? base(env) : base, {
  server: { fs: { allow: [searchForWorkspaceRoot(root), realpathSync(new URL('../node_modules', import.meta.url))] } },
});
