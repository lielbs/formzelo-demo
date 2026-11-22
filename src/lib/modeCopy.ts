/**
 * Wording that depends on where the app runs. The public demo keeps everything in the browser and
 * says so; the production app must never tell a paying customer that their data "stays in this
 * browser" (UX audit 2026-11, D7). Use `byMode(demo, live)` for any sentence that is only true in one.
 */
import { runtimeConfiguration } from '../production/runtime';

export const IS_DEMO = runtimeConfiguration.mode === 'demo';

export function byMode<T>(demo: T, live: T, mode: string = runtimeConfiguration.mode): T {
  return mode === 'demo' ? demo : live;
}
