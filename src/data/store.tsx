import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Organization } from '../domain/schema';
import { LocalStorageRepository } from './localRepository';
import type { FormzeloRepository } from './repository';

interface RepoState {
  repo: FormzeloRepository;
  /** Increments on every write (this tab or another) so queries refetch. */
  revision: number;
  ready: boolean;
  bootError: string | null;
  orgs: Organization[];
  activeOrg: Organization | null;
  switchOrg: (orgId: string) => Promise<void>;
}

const RepoContext = createContext<RepoState | null>(null);

// Single repository instance for the app. Swap this line for a SupabaseRepository later.
const repository: FormzeloRepository = new LocalStorageRepository();

export function RepoProvider({ children }: { children: ReactNode }) {
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = repository.subscribe(() => setRevision((r) => r + 1));
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await repository.init();
        const [list, active] = await Promise.all([repository.listOrganizations(), repository.getActiveOrgId()]);
        if (cancelled) return;
        setOrgs(list);
        setActiveOrgId(active ?? list[0]?.id ?? null);
        setReady(true);
      } catch (err) {
        console.error('[formzelo] boot failed', err);
        if (!cancelled) setBootError(err instanceof Error ? err.message : 'שגיאה בטעינת הנתונים המקומיים');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const switchOrg = useCallback(async (orgId: string) => {
    await repository.setActiveOrgId(orgId);
    setActiveOrgId(orgId);
  }, []);

  const value = useMemo<RepoState>(
    () => ({
      repo: repository,
      revision,
      ready,
      bootError,
      orgs,
      activeOrg: orgs.find((o) => o.id === activeOrgId) ?? null,
      switchOrg,
    }),
    [revision, ready, bootError, orgs, activeOrgId, switchOrg],
  );
  return <RepoContext.Provider value={value}>{children}</RepoContext.Provider>;
}

export function useRepo(): RepoState {
  const ctx = useContext(RepoContext);
  if (!ctx) throw new Error('useRepo must be used inside RepoProvider');
  return ctx;
}

/** Active workspace for /app pages — guaranteed by AppLayout before children render. */
export function useActiveOrg(): Organization {
  const { activeOrg } = useRepo();
  if (!activeOrg) throw new Error('No active workspace');
  return activeOrg;
}

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/** Minimal async query hook. Refetches on any repository write and when deps change. */
export function useRepoQuery<T>(fn: (repo: FormzeloRepository) => Promise<T>, deps: unknown[]): QueryState<T> {
  const { repo, revision } = useRepo();
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: Error | null }>({
    data: undefined,
    loading: true,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const depsKey = JSON.stringify(deps);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Show a loading state only when the query identity changes; writes refetch silently.
    if (lastKey.current !== depsKey) {
      lastKey.current = depsKey;
      setState({ data: undefined, loading: true, error: null });
    }
    fnRef
      .current(repo)
      .then((data) => !cancelled && setState({ data, loading: false, error: null }))
      .catch((error: unknown) => {
        console.error('[formzelo] query failed', error);
        if (!cancelled) setState({ data: undefined, loading: false, error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => {
      cancelled = true;
    };
  }, [repo, revision, nonce, depsKey]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}
