/**
 * What the signed-in person may open in a workspace: everything, only Formangle (processes and
 * requests) or only Tables. The server enforces it; the app only hides what would be refused.
 */
import { useEffect, useState } from 'react';
import { loadCache, onClearLoadCache } from '../lib/loadCache';
import { runtimeConfiguration } from './runtime';
import { getProductionSupabaseClient } from './supabaseClient';

export type Access = 'all' | 'formangle' | 'tables';
export const ACCESS_HE: Record<Access, string> = { all: 'הכול', formangle: 'רק טפסים ותהליכים', tables: 'רק שולחנות' };

let pending: Promise<Record<string, Access>> | null = null;
onClearLoadCache(() => { pending = null; });

async function fetchAccess(): Promise<Record<string, Access>> {
  const client = await getProductionSupabaseClient();
  const { data, error } = await client.rpc('my_access' as never);
  if (error) throw error;
  const rows = (data ?? []) as { organization_id: string; access: Access }[];
  return Object.fromEntries(rows.map((r) => [r.organization_id, r.access]));
}

/** 'all' in the demo and while unknown (the server still refuses anything out of scope). */
export function useAccess(orgId: string | undefined): Access {
  const cached = orgId ? (loadCache.get(`access:${orgId}`) as Access | undefined) : undefined;
  const [access, setAccess] = useState<Access>(cached ?? 'all');
  useEffect(() => {
    if (runtimeConfiguration.mode !== 'production' || !orgId) return;
    let alive = true;
    pending ??= fetchAccess();
    pending.then((map) => {
      const a = map[orgId] ?? 'all';
      loadCache.set(`access:${orgId}`, a);
      if (alive) setAccess(a);
    }).catch(() => { pending = null; });
    return () => { alive = false; };
  }, [orgId]);
  return access;
}
