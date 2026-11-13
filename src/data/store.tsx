import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Organization } from '../domain/schema';
import { LocalStorageRepository } from './localRepository';
import type { FormangleRepository } from './repository';
import { runtimeConfiguration } from '../production/runtime';
import { createProductionRepository } from '../production/productionRepository';
import { getProductionSupabaseClient } from '../production/supabaseClient';
import { useAuth } from '../auth/AuthProvider';
import { PageLoader } from '../components/ui';
import { onClearLoadCache } from '../lib/loadCache';

interface RepoState {
  repo: FormangleRepository;
  /** Increments on every write (this tab or another) so queries refetch. */
  revision: number;
  ready: boolean;
  bootError: string | null;
  orgs: Organization[];
  activeOrg: Organization | null;
  switchOrg: (orgId: string) => Promise<void>;
}

const RepoContext = createContext<RepoState | null>(null);

let repositoryPromise: Promise<FormangleRepository> | null = null;
function getRepository() {
  repositoryPromise ??= runtimeConfiguration.mode === 'demo'
    ? Promise.resolve(new LocalStorageRepository())
    : getProductionSupabaseClient().then(createProductionRepository);
  return repositoryPromise;
}

/** Set while the document unloads, when the browser aborts in-flight requests. */
let pageUnloading = false;
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => (pageUnloading = true));
  window.addEventListener('pageshow', () => (pageUnloading = false));
}

export function RepoProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [repository, setRepository] = useState<FormangleRepository | null>(null);
  const [revision, setRevision] = useState(0);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const signedInAccess = auth.state.kind === 'authenticated' ? auth.state : null;

  useEffect(() => {
    let active = true;
    getRepository().then((repo) => active && setRepository(repo)).catch(() => active && setBootError('לא ניתן לאתחל את חיבור הייצור המאובטח.'));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!repository) return;
    const unsubscribe = repository.subscribe(() => setRevision((r) => r + 1));
    return () => {
      unsubscribe();
    };
  }, [repository]);

  useEffect(() => {
    let cancelled = false;
    if (!repository) return;
    if (runtimeConfiguration.mode === 'production' && auth.state.kind !== 'authenticated') {
      setReady(false);
      setOrgs([]);
      setActiveOrgId(null);
      return;
    }
    (async () => {
      try {
        await repository.init();
        const [list, active] = await Promise.all([repository.listOrganizations(), repository.getActiveOrgId()]);
        if (cancelled) return;
        setOrgs(list);
        setActiveOrgId(active ?? list[0]?.id ?? null);
        setReady(true);
      } catch (err) {
        console.error('[formangle] boot failed', err);
        if (!cancelled) setBootError(err instanceof Error ? err.message : 'שגיאה בטעינת הנתונים המקומיים');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Re-boot when the signed-in access changes (another account, or memberships changed after an
    // invitation); a background re-check of the same session keeps the same state object.
  }, [repository, revision, auth.state.kind, signedInAccess]);

  const switchOrg = useCallback(async (orgId: string) => {
    if (!repository) throw new Error('Repository is not ready');
    await repository.setActiveOrgId(orgId);
    setActiveOrgId(orgId);
  }, [repository]);

  const value = useMemo<RepoState>(
    () => ({
      repo: repository!,
      revision,
      ready,
      bootError,
      orgs,
      activeOrg: orgs.find((o) => o.id === activeOrgId) ?? null,
      switchOrg,
    }),
    [repository, revision, ready, bootError, orgs, activeOrgId, switchOrg],
  );
  if (!repository) return bootError ? <div role="alert">{bootError}</div> : <PageLoader />;
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
/**
 * Last result of each query (per repository, per call site and arguments). Returning to a screen
 * shows what it showed last time at once and refreshes underneath, so moving around feels instant.
 */
let queryCache = new WeakMap<FormangleRepository, Map<string, unknown>>();
onClearLoadCache(() => { queryCache = new WeakMap(); });
const cacheFor = (repo: FormangleRepository) => {
  let m = queryCache.get(repo);
  if (!m) { m = new Map(); queryCache.set(repo, m); }
  return m;
};

export function useRepoQuery<T>(fn: (repo: FormangleRepository) => Promise<T>, deps: unknown[]): QueryState<T> {
  const { repo, revision } = useRepo();
  const cacheKey = fn.toString() + '|' + JSON.stringify(deps);
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: Error | null }>(() => {
    const cached = cacheFor(repo).get(cacheKey) as T | undefined;
    return { data: cached, loading: cached === undefined, error: null };
  });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const depsKey = JSON.stringify(deps);
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Show a loading state only when the query identity changes; writes refetch silently.
    if (lastKey.current !== null && lastKey.current !== depsKey) {
      const cached = cacheFor(repo).get(cacheKey) as T | undefined;
      setState({ data: cached, loading: cached === undefined, error: null });
    }
    lastKey.current = depsKey;
    fnRef
      .current(repo)
      .then((data) => {
        cacheFor(repo).set(cacheKey, data);
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        // A request cut off by leaving the page or the screen is not a failure.
        if (cancelled || pageUnloading) return;
        console.error('[formangle] query failed', error);
        setState({ data: undefined, loading: false, error: error instanceof Error ? error : new Error(String(error)) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo, revision, nonce, depsKey]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}
