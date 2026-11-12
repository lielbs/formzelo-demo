/**
 * Live shift: tablet-landscape first, usable in portrait and as an emergency phone list.
 * Every inventory action waits for the server; nothing shows as done before it is.
 */
import { ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock, LayoutGrid, List, Plus, RefreshCw, Search, SearchX, SlidersHorizontal, Users, Wifi, WifiOff } from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button, cx, ErrorState, PageLoader } from '../../components/ui';
import { useShiftSync, type Connection } from '../data/useShiftSync';
import { filterCount, inTile, isDone, matchesFilters, matchesQuery, NO_FILTERS, tileCounts, timeline, type ShiftFilters, type SortKey, type TileKey } from '../domain/shiftList';
import { bucketOf, BUCKET_HE, deriveTableStates, type Bucket } from '../domain/status';
import { addDays, currentServiceDate, dateInTz, formatDate, timeInTz } from '../domain/time';
import type { ShiftReservation } from '../domain/types';
import { ThemeButton } from '../theme';
import { Segmented } from '../ui';
import { DetailPanel, type Selection } from './DetailPanel';
import { FilterSheet } from './FilterSheet';
import { FloorView } from './FloorView';
import './host.css';
import { QuickAdd, type QuickAddMode } from './QuickAdd';
import { ReservationRow } from './ReservationRow';
import { ActiveFilters, AddChooser, ShiftDock, ShiftPulse } from './ShiftControls';
import { WaitlistView } from './WaitlistView';

export type View = 'list' | 'floor' | 'waitlist';

function ConnectionBadge({ connection, lastSync }: { connection: Connection; lastSync: Date | null }) {
  const at = lastSync ? lastSync.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';
  const map = {
    live: { cls: 'border-teal-200 bg-teal-50 text-teal-800', text: 'מחובר — מתעדכן בזמן אמת', icon: Wifi },
    connecting: { cls: 'border-cloud-300 bg-white text-ink-muted', text: 'מתחבר…', icon: RefreshCw },
    polling: { cls: 'border-amber-200 bg-amber-50 text-amber-900', text: `מתעדכן כל 30 שניות · עודכן ${at}`, icon: RefreshCw },
    offline: { cls: 'border-red-300 bg-red-50 text-red-800', text: `אין חיבור · עודכן לאחרונה ${at}`, icon: WifiOff },
  }[connection];
  const Icon = map.icon;
  return (
    <span role="status" className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium', map.cls)}>
      <Icon className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">{map.text}</span><span className="sm:hidden">{connection === 'live' ? 'מחובר' : connection === 'offline' ? 'אין חיבור' : 'מתעדכן'}</span>
    </span>
  );
}

export function HostShift() {
  const { venueId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const [now, setNow] = useState(() => new Date());
  const [tz, setTz] = useState('Asia/Jerusalem');
  const date = params.get('date') ?? '';
  const effectiveDate = date || dateInTz(now, tz);
  const { shift, error, connection, lastSync, refetch } = useShiftSync(venueId, effectiveDate);
  const [view, setView] = useState<View>(() => (params.get('view') as View) || 'list');
  const [service, setService] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [tile, setTile] = useState<TileKey>('active');
  const [filters, setFilters] = useState<ShiftFilters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>('time');
  const [filterOpen, setFilterOpen] = useState(false);
  const [chooser, setChooser] = useState(false);
  const [showDone, setShowDone] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [assigning, setAssigning] = useState<ShiftReservation | null>(null);
  const [quickAdd, setQuickAdd] = useState<QuickAddMode | null>(null);
  const [announce, setAnnounce] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Venue timezone and the right service date (cross-midnight aware) once the shift is known.
  useEffect(() => {
    if (!shift) return;
    setTz(shift.venue.timezone);
    if (!date) {
      const sd = currentServiceDate(new Date(), shift.venue.timezone, shift.services);
      if (sd !== shift.serviceDate) setParams((p) => { p.set('date', sd); return p; }, { replace: true });
    }
  }, [shift, date, setParams]);
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { document.title = shift ? `משמרת · ${shift.venue.name}` : 'משמרת'; }, [shift]);

  const setDate = (d: string) => { setSelection(null); setAssigning(null); setParams((p) => { p.set('date', d); return p; }); };
  const done = useCallback((message: string) => { setAnnounce(message); void refetch(); }, [refetch]);

  // The day (one service or all) → tiles; then tile, filters and search → the list.
  const day = useMemo(() => (shift ? shift.reservations.filter((r) => service === 'all' || r.serviceKey === service) : []), [shift, service]);
  const tablesById = useMemo(() => new Map((shift?.tables ?? []).map((t) => [t.id, t])), [shift]);
  const labelsById = useMemo(() => new Map((shift?.tables ?? []).map((t) => [t.id, t.label])), [shift]);
  const tiles = useMemo(() => tileCounts(day, now), [day, now]);
  const narrowed = useMemo(() => day.filter((r) => matchesFilters(r, filters, tablesById) && matchesQuery(r, query, labelsById)), [day, filters, tablesById, query, labelsById]);
  const reservations = useMemo(() => narrowed.filter((r) => tile === 'active' ? true : inTile(r, tile, now)), [narrowed, tile, now]);
  const tableStates = useMemo(() => (shift ? deriveTableStates(shift, now) : new Map()), [shift, now]);
  const pickTile = (t: TileKey) => { setTile(t); if (view !== 'list') setView('list'); };
  const clearAll = () => { setTile('active'); setFilters(NO_FILTERS); setQuery(''); };
  const narrowing = tile !== 'active' || filterCount(filters) > 0 || query.trim() !== '';

  if (error && !shift) return <div className="p-6"><ErrorState error={error} onRetry={refetch} /></div>;
  if (!shift) return <PageLoader label="טוען את המשמרת…" />;
  if (!shift.published) return <div className="p-6"><ErrorState error="המקום עוד לא פורסם. סיימו את ההקמה כדי לפתוח משמרת." /></div>;

  const canAct = shift.role !== 'viewer' && connection !== 'offline';
  const labels = labelsById;
  const selected = selection?.kind === 'reservation' ? shift.reservations.find((r) => r.id === selection.id) ?? null : null;
  const today = dateInTz(now, shift.venue.timezone);
  const closed = shift.closed.find((x) => x.kind === 'closed' && !x.serviceKey);
  const isToday = shift.serviceDate === today;
  const activeRows = tile === 'done' ? reservations : reservations.filter((r) => !isDone(r));
  const doneRows = tile === 'active' ? reservations.filter(isDone) : [];
  const items = timeline(activeRows, now, isToday ? timeInTz(now, shift.venue.timezone) : null);
  const groups = (['attention', 'upcoming', 'arrived', 'seated', 'done'] as Bucket[]).map((b) => ({ b, rows: reservations.filter((r) => bucketOf(r, now) === b) }));
  const nFilters = filterCount(filters);
  const row = (r: ShiftReservation, next = false, order = 0) => (
    <ReservationRow key={r.id} r={r} now={now} labels={labels} next={next} order={order} selected={selection?.kind === 'reservation' && selection.id === r.id}
      canAct={canAct} onSelect={() => setSelection({ kind: 'reservation', id: r.id })} onDone={done}
      onAssign={() => { setAssigning(r); setView('floor'); setSelection({ kind: 'reservation', id: r.id }); }} />
  );
  const switchView = (v: View) => { setView(v); setAssigning(null); };

  return (
    <div className="fz-page flex min-h-screen flex-col bg-[var(--hs-page)]" dir="rtl">
      <a href="#shift-main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">דילוג לרשימת המשמרת</a>
      <header className="sticky top-0 z-30 border-b border-cloud-200 bg-white/95 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          <Link to={shift.role === 'owner' || shift.role === 'manager' ? `/app/tables/${venueId}` : '/app/tables'} aria-label="יציאה מהמשמרת"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cloud-300 text-ink hover:bg-cloud focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold text-ink sm:text-lg">{shift.venue.name}</h1>
            <p className="truncate text-xs text-ink-muted">
              <span className="sr-only">השעה במקום </span><bdi dir="ltr" className="font-medium tabular-nums">{timeInTz(now, shift.venue.timezone)}</bdi>{isToday ? ' · היום' : ''}
            </p>
          </div>
          <ConnectionBadge connection={connection} lastSync={lastSync} />
          <ThemeButton />
          <Button size="lg" icon={Plus} onClick={() => setQuickAdd('phone')} disabled={!canAct} className="hidden h-11 md:inline-flex">הוספה</Button>
        </div>
        <div className="flex items-center gap-1.5 px-3 pb-2 sm:px-4" role="group" aria-label="בחירת תאריך">
          <Button variant="secondary" size="sm" icon={ChevronRight} aria-label="יום קודם" onClick={() => setDate(addDays(shift.serviceDate, -1))} className="h-11 w-11 shrink-0 px-0" />
          <label className="relative flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-cloud-300 bg-white px-3 text-sm font-semibold text-ink hover:bg-cloud sm:max-w-xs sm:flex-none sm:px-4 focus-within:ring-2 focus-within:ring-orange">
            <CalendarDays className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            <span className="truncate">{formatDate(shift.serviceDate, 'he', false)}</span>
            <span className="sr-only">תאריך המשמרת — בחירת תאריך אחר</span>
            <input id="shift-date" type="date" dir="ltr" value={shift.serviceDate} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
          <Button variant="secondary" size="sm" icon={ChevronLeft} aria-label="יום הבא" onClick={() => setDate(addDays(shift.serviceDate, 1))} className="h-11 w-11 shrink-0 px-0" />
          {!isToday && <Button variant="secondary" size="sm" onClick={() => setDate(today)} className="h-11 shrink-0">היום</Button>}
        </div>
        {connection === 'offline' && (
          <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800">
            אין חיבור לאינטרנט. מה שמוצג נכון לשעה <bdi dir="ltr">{lastSync ? timeInTz(lastSync, shift.venue.timezone) : '—'}</bdi>. פעולות מושבתות עד שהחיבור יחזור — שום דבר לא נשלח בינתיים.
          </p>
        )}
        {closed && <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">היום מסומן כסגור להזמנות{closed.note ? ` (${closed.note})` : ''}. הזמנות קיימות מוצגות למטה.</p>}
      </header>

      <div className="grid gap-3 px-3 pt-3 sm:px-4">
        {view === 'list' && <ShiftPulse counts={tiles} tile={tile} onTile={pickTile} />}
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden md:block">
            <Segmented label="תצוגה" size="lg" value={view} onChange={switchView} options={[
              { value: 'list', label: 'רשימה', icon: List },
              { value: 'floor', label: 'מפה', icon: LayoutGrid },
              { value: 'waitlist', label: 'המתנה', icon: ClipboardList, count: shift.waitlist.length },
            ]} />
          </div>
          {shift.services.length > 1 && view !== 'waitlist' && (
            <Segmented label="משמרת" value={service} onChange={setService} options={[{ value: 'all', label: 'הכול' }, ...shift.services.map((s) => ({ value: s.key, label: s.name }))]} />
          )}
          {view === 'list' && (
            <div className="flex min-w-[14rem] flex-1 items-center gap-2 md:max-w-md">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
                <label htmlFor="shift-search" className="sr-only">חיפוש לפי שם, טלפון, שולחן או קוד</label>
                <input id="shift-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש שם, טלפון, שולחן"
                  className="fz-input h-11 w-full rounded-xl border border-cloud-300 bg-white ps-9 pe-3 text-[15px]" />
              </div>
              <button type="button" onClick={() => setFilterOpen(true)} aria-haspopup="dialog"
                aria-label={nFilters ? `סינון וסידור (${nFilters} פעילים)` : 'סינון וסידור'}
                className={cx('relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                  nFilters || sort !== 'time' ? 'border-orange-300 bg-orange-50 text-orange-800' : 'border-cloud-300 bg-white text-ink hover:bg-cloud')}>
                <SlidersHorizontal className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">סינון</span>
                {nFilters > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--hs-accent)] px-1 text-[11px] font-bold text-[var(--hs-on-accent)]" aria-hidden>{nFilters}</span>}
              </button>
            </div>
          )}
        </div>
        {view === 'list' && <ActiveFilters filters={filters} shift={shift} onChange={setFilters} />}
      </div>

      {assigning && (
        <div role="status" className="mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 sm:mx-4">
          בחרו שולחן במפה עבור {assigning.guestName} ({assigning.party} סועדים). שולחנות מתאימים מסומנים במסגרת.
          <Button size="sm" variant="secondary" onClick={() => setAssigning(null)} className="ms-auto h-10">ביטול</Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4 px-3 pb-28 pt-3 sm:px-4 md:pb-6">
        <main id="shift-main" ref={listRef} className={cx('min-w-0 flex-1', selection && 'pb-[45vh] lg:pb-0')} aria-label="המשמרת">
          <div key={view} className="hs-view">
          {view === 'list' && (
            reservations.length === 0 ? (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-cloud-300 bg-white px-6 py-10 text-center">
                <SearchX className="h-9 w-9 text-ink-soft" aria-hidden />
                <p className="mt-3 font-semibold text-ink">{narrowing ? 'אין הזמנות שמתאימות לסינון' : 'אין הזמנות ליום הזה עדיין'}</p>
                <p className="mt-1 max-w-sm text-sm text-ink-muted">
                  {narrowing ? 'נסו לשנות או לנקות את הסינון.' : 'אפשר להוסיף הזמנה טלפונית, אורחים מזדמנים או רשימת המתנה מכפתור ההוספה.'}
                </p>
                {narrowing && <Button variant="secondary" onClick={clearAll} className="mt-4 h-11">ניקוי הסינון</Button>}
              </div>
            ) : sort === 'status' ? (
              <div className="grid gap-5">
                {groups.filter((g) => g.rows.length).map((g) => (
                  <section key={g.b} aria-labelledby={`grp-${g.b}`}>
                    <h2 id={`grp-${g.b}`} className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
                      {g.b === 'attention' && <Clock className="h-4 w-4 text-orange-800" aria-hidden />}
                      {BUCKET_HE[g.b]} <span className="tabular-nums">({g.rows.length})</span>
                    </h2>
                    <ul className="hs-rail">{g.rows.map((r) => row(r))}</ul>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid gap-5">
                {items.length > 0 && (
                  <ul className="hs-rail" aria-label="ההזמנות לפי שעה">
                    {items.map((it) => (
                      <Fragment key={it.key}>
                        {it.kind === 'slot' && (
                          <li className="hs-stop" aria-label={`${it.label}: ${it.count} הזמנות, ${it.covers} סועדים`}>
                            <b dir="ltr">{it.label}</b><span>{it.count === 1 ? 'הזמנה אחת' : `${it.count} הזמנות`} · {it.covers} סועדים</span>
                          </li>
                        )}
                        {it.kind === 'now' && <li className="hs-nowmark" aria-label={`עכשיו ${it.time}`}><span>עכשיו <bdi dir="ltr">{it.time}</bdi></span></li>}
                        {it.kind === 'row' && row(it.r, it.next, items.indexOf(it))}
                      </Fragment>
                    ))}
                  </ul>
                )}
                {doneRows.length > 0 && (
                  <section aria-labelledby="grp-done">
                    <button type="button" id="grp-done" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}
                      className="flex min-h-[44px] w-full items-center gap-2 rounded-xl px-1 text-sm font-semibold text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
                      <ChevronDown className={cx('h-4 w-4 transition-transform', showDone && 'rotate-180')} aria-hidden />
                      {BUCKET_HE.done} <span className="tabular-nums">({doneRows.length})</span>
                    </button>
                    {showDone && <ul className="hs-rail mt-2">{doneRows.map((r) => row(r))}</ul>}
                  </section>
                )}
              </div>
            )
          )}
          {view === 'floor' && (
            <FloorView shift={shift} states={tableStates} now={now} selection={selection} assigning={assigning} canAct={canAct}
              onSelectTable={(id) => setSelection({ kind: 'table', id })} onAssigned={(m) => { setAssigning(null); done(m); }} />
          )}
          {view === 'waitlist' && <WaitlistView shift={shift} now={now} canAct={canAct} onDone={done} onAdd={() => setQuickAdd('waitlist')} labels={labels} />}
          </div>
        </main>
        {selection && (
          <DetailPanel shift={shift} selection={selection} selected={selected} states={tableStates} now={now} canAct={canAct}
            onClose={() => setSelection(null)} onDone={done} onSelect={setSelection}
            onAssign={(r) => { setAssigning(r); setView('floor'); }} />
        )}
      </div>

      {!selection && <ShiftDock view={view} onView={switchView} waiting={shift.waitlist.length} onAdd={() => setChooser(true)} canAdd={canAct} />}
      {chooser && <AddChooser onClose={() => setChooser(false)} onPick={(m) => { setChooser(false); setQuickAdd(m); }} />}
      {filterOpen && (
        <FilterSheet shift={shift} rows={day} filters={filters} sort={sort} onClose={() => setFilterOpen(false)}
          onApply={(f, s) => { setFilters(f); setSort(s); setFilterOpen(false); if (view !== 'list') setView('list'); }} />
      )}
      {quickAdd && <QuickAdd mode={quickAdd} shift={shift} states={tableStates} onClose={() => setQuickAdd(null)} onDone={(m) => { setQuickAdd(null); done(m); }} />}
      <div aria-live="polite" className="sr-only">{announce}</div>
      <p className="px-4 pb-28 text-center text-xs text-ink-muted md:pb-3"><Users className="inline h-3.5 w-3.5" aria-hidden /> הפרטים האישיים של האורחים מיועדים לשירות בלבד.</p>
    </div>
  );
}
