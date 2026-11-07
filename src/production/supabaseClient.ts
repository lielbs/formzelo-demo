import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.generated';
import { runtimeConfiguration } from './runtime';

let clientPromise: Promise<SupabaseClient<Database>> | null = null;

/** One browser client owns session refresh for both Auth and the production repository. */
export function getProductionSupabaseClient(): Promise<SupabaseClient<Database>> {
  if (runtimeConfiguration.mode !== 'production') {
    return Promise.reject(new Error('Production Supabase is unavailable in demo mode'));
  }
  const configuration = runtimeConfiguration;
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient<Database>(configuration.supabaseUrl, configuration.publishableKey, {
      auth: { autoRefreshToken: true, detectSessionInUrl: true, persistSession: true },
    }),
  );
  return clientPromise;
}
