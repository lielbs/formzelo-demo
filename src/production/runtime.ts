export const FORMANGLE_SUPABASE_PROJECT_REF = 'ppgdbqhwbzlgzwsjmkor' as const;

// Plain checks instead of a schema library: this file is in every page's start-up code, and these
// four rules are all it needs (UX audit D3). Every rule is the same as before and is tested.
const fail = (message: string): never => { throw new Error(message); };
const Mode = {
  parse: (v: unknown): 'demo' | 'production' => (v === 'demo' || v === 'production' ? v : fail('VITE_FORMANGLE_MODE must be "demo" or "production"')),
};
const ProjectRef = {
  parse: (v: unknown): typeof FORMANGLE_SUPABASE_PROJECT_REF => (v === FORMANGLE_SUPABASE_PROJECT_REF ? v : fail('VITE_SUPABASE_PROJECT_REF must be the dedicated Formangle project')),
};
const PublishableKey = {
  parse: (v: unknown): string => (typeof v === 'string' && v.length >= 24 && v.startsWith('sb_publishable_') ? v
    : fail('Use a Supabase publishable key; browser builds must never receive secret, service-role, or legacy JWT keys')),
};
const parseUrl = (v: unknown): string => {
  if (typeof v !== 'string') return fail('VITE_SUPABASE_URL must be a URL');
  try { return new URL(v).href; } catch { return fail('VITE_SUPABASE_URL must be a URL'); }
};

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

  const url = parseUrl(environment.VITE_SUPABASE_URL);
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
