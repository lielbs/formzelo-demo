import type { SupabaseClient } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Database } from '../production/database.generated';
import { runtimeConfiguration } from '../production/runtime';
import { getProductionSupabaseClient } from '../production/supabaseClient';
import { resolveWorkforceAccess, type WorkforceAccess } from './session';

type AuthState =
  | { kind: 'demo' }
  | { kind: 'loading' }
  | WorkforceAccess
  | { kind: 'error'; message: string };

interface AuthContextValue {
  state: AuthState;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient<Database> | null>(null);
  const [state, setState] = useState<AuthState>(runtimeConfiguration.mode === 'demo' ? { kind: 'demo' } : { kind: 'loading' });
  const refreshGeneration = useRef(0);

  useEffect(() => {
    if (runtimeConfiguration.mode === 'demo') return;
    let active = true;
    getProductionSupabaseClient()
      .then((productionClient) => {
        if (!active) return;
        setClient(productionClient);
      })
      .catch(() => {
        if (active) setState({ kind: 'error', message: 'לא ניתן לטעון את רכיב ההזדהות.' });
      });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!client) {
      setState({ kind: 'demo' });
      return;
    }

    const generation = ++refreshGeneration.current;
    setState({ kind: 'loading' });
    try {
      const { data: claimsData, error: claimsError } = await client.auth.getClaims();
      if (generation !== refreshGeneration.current) return;
      if (claimsError || !claimsData?.claims?.sub) {
        setState({ kind: 'unauthenticated' });
        return;
      }

      const { data: memberships, error: membershipError } = await client
        .from('organization_memberships')
        .select('organization_id, role, status');
      if (generation !== refreshGeneration.current) return;
      if (membershipError) throw membershipError;

      setState(resolveWorkforceAccess(claimsData.claims, memberships ?? []));
    } catch {
      if (generation === refreshGeneration.current) {
        setState({ kind: 'error', message: 'לא ניתן לאמת את ההרשאה כרגע. נסו שוב.' });
      }
    }
  }, [client]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!client) return 'שירות ההזדהות עדיין נטען.';
    const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) return 'פרטי הכניסה אינם תקינים או שהחשבון אינו פעיל.';
    await refresh();
    return null;
  }, [client, refresh]);

  useEffect(() => {
    if (!client) return;
    void refresh();
    const { data: { subscription } } = client.auth.onAuthStateChange(() => {
      // Run outside the auth callback to avoid awaiting another Supabase call while
      // the auth client is updating its internal session lock.
      window.setTimeout(() => void refresh(), 0);
    });
    return () => subscription.unsubscribe();
  }, [client, refresh]);

  const signOut = useCallback(async () => {
    if (!client) return;
    refreshGeneration.current += 1;
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) {
      setState({ kind: 'error', message: 'ההתנתקות נכשלה. נסו שוב.' });
      return;
    }
    setState({ kind: 'unauthenticated' });
  }, [client]);

  const value = useMemo(() => ({ state, refresh, signIn, signOut }), [state, refresh, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
