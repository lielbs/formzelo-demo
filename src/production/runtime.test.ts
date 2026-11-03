import { describe, expect, it } from 'vitest';
import { FORMANGLE_SUPABASE_PROJECT_REF, readRuntimeConfiguration } from './runtime';

const production = {
  VITE_FORMANGLE_MODE: 'production',
  VITE_SUPABASE_PROJECT_REF: FORMANGLE_SUPABASE_PROJECT_REF,
  VITE_SUPABASE_URL: `https://${FORMANGLE_SUPABASE_PROJECT_REF}.supabase.co`,
  VITE_SUPABASE_PUBLISHABLE_KEY: `sb_publishable_${'a'.repeat(32)}`,
} as const;

describe('readRuntimeConfiguration', () => {
  it('preserves the existing demo as the default without cloud credentials', () => {
    expect(readRuntimeConfiguration({})).toEqual({ mode: 'demo' });
  });

  it('accepts only the exact dedicated Formangle project in production', () => {
    expect(readRuntimeConfiguration(production)).toEqual({
      mode: 'production',
      projectRef: FORMANGLE_SUPABASE_PROJECT_REF,
      supabaseUrl: `https://${FORMANGLE_SUPABASE_PROJECT_REF}.supabase.co`,
      publishableKey: production.VITE_SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it('rejects another project URL even if the configured reference is Formangle', () => {
    expect(() => readRuntimeConfiguration({
      ...production,
      VITE_SUPABASE_URL: 'https://fmwvqefoizhtuxgaryem.supabase.co',
    })).toThrow('dedicated Formangle project');
  });

  it.each(['sb_secret_never_in_browser', 'eyJhbGciOiJIUzI1NiJ9.legacy.jwt', 'service-role-key'])(
    'rejects non-publishable browser key %s',
    (key) => {
      expect(() => readRuntimeConfiguration({ ...production, VITE_SUPABASE_PUBLISHABLE_KEY: key })).toThrow();
    },
  );
});
