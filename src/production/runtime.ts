import { z } from 'zod';

export const FORMANGLE_SUPABASE_PROJECT_REF = 'ppgdbqhwbzlgzwsjmkor' as const;

const Mode = z.enum(['demo', 'production']);
const ProjectRef = z.literal(FORMANGLE_SUPABASE_PROJECT_REF);
const PublishableKey = z.string().min(24).refine(
  (value) => value.startsWith('sb_publishable_'),
  'Use a Supabase publishable key; browser builds must never receive secret, service-role, or legacy JWT keys',
);

export type RuntimeConfiguration =
  | { mode: 'demo' }
  | {
      mode: 'production';
      projectRef: typeof FORMANGLE_SUPABASE_PROJECT_REF;
      supabaseUrl: string;
      publishableKey: string;
    };

type Environment = Readonly<Record<string, unknown>>;

/**
 * Browser-safe runtime configuration. Production is pinned to the dedicated
 * Formangle project reference so a display-name mix-up can never select RAVO.
 */
export function readRuntimeConfiguration(environment: Environment): RuntimeConfiguration {
  const mode = Mode.parse(environment.VITE_FORMANGLE_MODE ?? 'demo');
  if (mode === 'demo') return { mode };

  const url = z.url().parse(environment.VITE_SUPABASE_URL);
  const parsedUrl = new URL(url);
  // The disposable local stack, for end-to-end tests on the dev server only. Builds never accept it.
  if (environment.DEV === true && environment.VITE_FORMANGLE_LOCAL_STACK === 'true') {
    if (parsedUrl.origin !== 'http://127.0.0.1:54321') throw new Error('The local stack must be the disposable Supabase on 127.0.0.1:54321');
    return { mode, projectRef: FORMANGLE_SUPABASE_PROJECT_REF, supabaseUrl: parsedUrl.origin, publishableKey: PublishableKey.parse(environment.VITE_SUPABASE_PUBLISHABLE_KEY) };
  }
  const projectRef = ProjectRef.parse(environment.VITE_SUPABASE_PROJECT_REF);
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== `${projectRef}.supabase.co` || parsedUrl.pathname !== '/') {
    throw new Error('Production Supabase URL must match the dedicated Formangle project');
  }

  return {
    mode,
    projectRef,
    supabaseUrl: parsedUrl.origin,
    publishableKey: PublishableKey.parse(environment.VITE_SUPABASE_PUBLISHABLE_KEY),
  };
}

export const runtimeConfiguration = readRuntimeConfiguration(import.meta.env);
