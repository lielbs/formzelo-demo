import { BarChart3, Building2, Check, ChevronDown, Inbox, LayoutDashboard, Menu, MoreHorizontal, Palette, Plus, Settings, UtensilsCrossed, Workflow, X } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useRepo, useRepoQuery } from '../data/store';
import { PENDING_STATUSES } from '../engine/transitions';
import { Logo } from './Brand';
import { GlassDock, type DockItem } from './GlassDock';
import { ButtonLink, cx, ErrorState, PageLoader, Spinner } from './ui';
import { useToast } from './Toast';
import { runtimeConfiguration } from '../production/runtime';

const NAV = [
  { to: '/app', label: 'לוח בקרה', icon: LayoutDashboard, end: true },
  { to: '/app/workflows', label: 'תהליכים', icon: Workflow },
  { to: '/app/requests', label: 'בקשות', icon: Inbox, badge: true },
  // Formangle Tables needs the real server, so it is not offered in the local demo.
  ...(runtimeConfiguration.mode === 'production' ? [{ to: '/app/tables', label: 'שולחנות', icon: UtensilsCrossed }] : []),
  { to: '/app/brand', label: 'ערכת מותג', icon: Palette },
  { to: '/app/analytics', label: 'אנליטיקה', icon: BarChart3 },
  { to: '/app/settings', label: 'הגדרות', icon: Settings },
];

function WorkspaceSwitcher({ compact }: { compact?: boolean }) {
  const { orgs, activeOrg, switchOrg } = useRepo();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!activeOrg) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`סביבת עבודה: ${activeOrg.name}. החלפה`}
        className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 p-2 text-start text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold" style={{ background: activeOrg.brand.primaryColor }}>
          {activeOrg.name.slice(0, 1)}
        </span>
        {!compact && (
          <>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 break-words text-sm font-semibold leading-tight">{activeOrg.name}</span>
              <span className="block truncate text-xs text-white/50">{[activeOrg.industry, activeOrg.isDemo ? 'דמו' : ''].filter(Boolean).join(' · ') || 'סביבת העבודה שלכם'}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-white/50" aria-hidden />
          </>
        )}
      </button>
      {open && (
        <ul role="listbox" aria-label="סביבות עבודה" className="absolute inset-x-0 top-full z-30 mt-2 min-w-[240px] overflow-hidden rounded-xl border border-cloud-200 bg-white p-1 shadow-lift">
          {orgs.map((o) => (
            <li key={o.id} role="option" aria-selected={o.id === activeOrg.id}>
              <button
                type="button"
                data-fz-leave
                className="flex w-full items-center gap-2.5 rounded-lg p-2 text-start hover:bg-cloud focus-visible:bg-cloud focus-visible:outline-none"
                onClick={async () => {
                  setOpen(false);
                  if (o.id === activeOrg.id) return;
                  await switchOrg(o.id);
                  toast(`עברתם ל-${o.name}`, 'info');
                  navigate('/app');
                }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-semibold text-white" style={{ background: o.brand.primaryColor }}>
                  {o.name.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 break-words text-sm font-medium leading-snug text-ink">{o.name}</span>
                  <span className="block text-xs text-ink-muted">{o.industry}</span>
                </span>
                {o.id === activeOrg.id && <Check className="h-4 w-4 text-teal" aria-hidden />}
              </button>
            </li>
          ))}
          {runtimeConfiguration.mode === 'demo' && (
            <li className="mt-1 border-t border-cloud-200 pt-1">
              <button type="button" data-fz-leave onClick={() => navigate('/demo')} className="flex w-full items-center gap-2 rounded-lg p-2 text-sm text-ink-muted hover:bg-cloud">
                <Building2 className="h-4 w-4" aria-hidden /> כל סביבות הדמו
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * Phone and tablet tab bar: the daily destinations in a glass dock (tap or drag along it), the
 * new-workflow action beside it and everything else under "עוד" (the full menu). Hidden from
 * 1024 px, where the sidebar takes over.
 */
function TabBar({ pending, onMore, moreOpen }: { pending: number; onMore: () => void; moreOpen: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname.replace(/\/+$/, '') || '/';
  // Tables (restaurants) gets its own place where the real server runs; everything else is under "עוד".
  const tables = runtimeConfiguration.mode === 'production';
  const inMore = ['/app/brand', '/app/analytics', '/app/settings', ...(tables ? [] : ['/app/tables'])].some((p) => path.startsWith(p));
  const items: DockItem[] = [
    { key: 'home', label: 'בית', icon: LayoutDashboard, to: '/app' },
    { key: 'requests', label: 'בקשות', icon: Inbox, to: '/app/requests', badge: pending, badgeLabel: `${pending} ממתינות` },
    { key: 'workflows', label: 'תהליכים', icon: Workflow, to: '/app/workflows' },
    ...(tables ? [{ key: 'tables', label: 'שולחנות', icon: UtensilsCrossed, to: '/app/tables' }] : []),
    { key: 'more', label: 'עוד', icon: MoreHorizontal, onSelect: onMore, ariaLabel: 'עוד — התפריט המלא', expanded: moreOpen },
  ];
  const at = (key: string) => items.findIndex((it) => it.key === key);
  const active = moreOpen || inMore ? at('more')
    : path === '/app' ? at('home')
    : path.startsWith('/app/requests') ? at('requests')
    : path.startsWith('/app/tables') ? at('tables')
    : path.startsWith('/app/workflows') && path !== '/app/workflows/new' ? at('workflows') : -1;
  return (
    <GlassDock label="ניווט מהיר" mode="nav" hideFrom="lg" items={items} active={active}
      onChoose={(i) => { const it = items[i]!; if (it.to) navigate(it.to); else it.onSelect?.(); }}
      action={{ label: 'תהליך חדש', icon: Plus, to: '/app/workflows/new' }} />
  );
}

function Sidebar({ onNavigate, pending }: { onNavigate?: () => void; pending: number }) {
  return (
    <div className="flex h-full flex-col gap-6 bg-midnight px-4 py-5">
      <div className="px-1">
        <Logo dark stacked to="/" />
      </div>
      <WorkspaceSwitcher />
      <ButtonLink to="/app/workflows/new" icon={Plus} onClick={onNavigate} className="w-full">
        תהליך חדש
      </ButtonLink>
      <nav aria-label="ניווט ראשי" className="flex flex-col gap-0.5">
        {NAV.map(({ to, label, icon: Icon, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                isActive ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white',
              )
            }
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            <span className="flex-1">{label}</span>
            {badge && pending > 0 && (
              <span className="rounded-full bg-orange-700 px-2 py-0.5 text-[11px] font-semibold text-white" aria-label={`${pending} ממתינות`}>
                {pending}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="mt-auto rounded-xl border border-white/10 p-3 text-xs leading-relaxed text-white/50">
        <p className="font-medium text-white/80">{runtimeConfiguration.mode === 'demo' ? 'דמו מקומי' : 'סביבת עבודה מאובטחת'}</p>
        {runtimeConfiguration.mode === 'demo' ? 'הנתונים נשמרים בדפדפן הזה בלבד ולא מסתנכרנים בין מכשירים.' : 'הנתונים נשמרים ב-Supabase ונגישים רק לחברי הארגון המורשים.'}
      </div>
    </div>
  );
}

export function AppLayout() {
  const { ready, bootError, activeOrg } = useRepo();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const runs = useRepoQuery((r) => (activeOrg ? r.listRuns(activeOrg.id) : Promise.resolve([])), [activeOrg?.id]);
  const pending = runs.data?.filter((r) => PENDING_STATUSES.includes(r.status)).length ?? 0;

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  if (bootError) return <div className="p-6"><ErrorState error={bootError} /></div>;
  if (!ready) return <PageLoader label="טוען סביבת עבודה…" />;
  if (!activeOrg) return <div className="p-6"><ErrorState error={runtimeConfiguration.mode === 'production' ? 'לא נמצאה סביבת עבודה פעילה. פנו ל-RockStack להשלמת ההקמה.' : 'לא נמצאה סביבת דמו.'} /></div>;

  return (
    <div className="fz-app min-h-screen lg:ps-64">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">
        דילוג לתוכן
      </a>
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 lg:block" aria-label="סרגל צד">
        <Sidebar pending={pending} />
      </aside>

      <header className="fz-topbar sticky top-0 z-20 flex items-center justify-between gap-3 px-4 py-2.5 lg:hidden">
        <Logo endorsement={false} to="/app" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="line-clamp-2 min-w-0 max-w-[46vw] break-words text-end text-[13px] font-semibold leading-tight text-ink-muted">{activeOrg.name}</span>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="פתיחת תפריט"
            aria-expanded={mobileOpen}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink/[0.05] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="תפריט">
          <button className="absolute inset-0 bg-midnight/50" aria-label="סגירת תפריט" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-72 max-w-[85vw] animate-fade-up">
            <Sidebar pending={pending} onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="סגירת תפריט"
              className="absolute end-3 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-[calc(var(--fz-tabbar,0px)+1.5rem)] pt-6 sm:px-6 lg:px-10 lg:py-10">
        <Suspense fallback={<Spinner />}>
          {/* Each screen eases in when you move between sections (skipped for reduced motion). */}
          <div key={location.pathname} className="fz-route">
            <Outlet />
          </div>
        </Suspense>
      </main>
      <TabBar pending={pending} moreOpen={mobileOpen} onMore={() => setMobileOpen(true)} />
    </div>
  );
}
