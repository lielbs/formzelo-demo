/**
 * Live shift: tablet-landscape first, usable in portrait and as an emergency phone list.
 * Every inventory action waits for the server; nothing shows as done before it is.
 */
import { ArrowRight, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock, LayoutGrid, List, Plus, RefreshCw, Search, SearchX, SlidersHorizontal, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button, cx, ErrorState, PageLoader } from '../../components/ui';
import { useShiftSync, type Connection } from '../data/useShiftSync';
import { filterCount, inTile, isDone, matchesFilters, matchesQuery, NO_FILTERS, shiftSummary, tileCounts, timeline, type ShiftFilters, type SortKey, type TileKey, type TimelineItem } from '../domain/shiftList';
import { bucketOf, BUCKET_HE, deriveTableStates, type Bucket } from '../domain/status';
import { addDays, currentServiceDate, dateInTz, formatDate, formatDateShort, timeInTz } from '../domain/time';
import type { ShiftReservation } from '../domain/types';
import { ThemeButton } from '../theme';
import { Segmented } from '../ui';
import { DetailPanel, type Selection } from './DetailPanel';
import { FilterSheet } from './FilterSheet';
import { FloorView } from './FloorView';
import './host.css';
import { QuickAdd, type QuickAddMode } from './QuickAdd';
import { ReservationRow } from './ReservationRow';
import { ActiveFilters, AddChooser, ShiftDock, ShiftSummaryBar } from './ShiftControls';
import { WaitlistView } from './WaitlistView';

export type View = 'list' | 'floor' | 'waitlist';

function ConnectionBadge({ connection, lastSync }: { connection: Connection; lastSync: Date | null }) {
  const at = lastSync ? lastSync.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) : '—';
  const map = {
    live: { tone: 'seated', text: 'מחובר — מתעדכן בזמן אמת', short: 'מחובר', icon: Wifi },
    connecting: { tone: 'done', text: 'מתחבר…', short: 'מתחבר', icon: RefreshCw },
    polling: { tone: 'arrived', text: `מתעדכן כל 30 שניות · עודכן ${at}`, short: 'מתעדכן', icon: RefreshCw },
    offline: { tone: 'attention', text: `אין חיבור · עודכן לאחרונה ${at}`, short: 'אין חיבור', icon: WifiOff },
  }[connection];
  const Icon = map.icon;
  return (
    <span role="status" className={cx('hs-conn inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium', `hs-tone-${map.tone}`)}>
      <Icon className="h-3.5 w-3.5" aria-hidden /> <span className="hidden lg:inline">{map.text}</span><span className="lg:hidden">{map.short}</span>
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
  const { shift, error, connection, lastSync, refetch, stale } = useShiftSync(venueId, effectiveDate);
  const [view, setView] = useState<View>(() => (params.get('view') as View) || 'list');
  const [service, setService] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [tile, setTile] = useState<TileKey>('active');
  const [filters, setFilters] = useState<ShiftFilters>(NO_FILTERS);
  const [sort, setSort] = useState<SortKey>('time');
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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
  const summary = useMemo(() => shiftSummary(day, tableStates, now), [day, tableStates, now]);
  const pickTile = (t: TileKey) => { setTile(t); if (view !== 'list') setView('list'); };
  const clearAll = () => { setTile('active'); setFilters(NO_FILTERS); setQuery(''); };
  const narrowing = tile !== 'active' || filterCount(filters) > 0 || query.trim() !== '';

  if (error && !shift) return <div className="p-6"><ErrorState error={error} onRetry={refetch} /></div>;
  if (!shift) return <PageLoader label="טוען את המשמרת…" />;
  if (!shift.published) return <div className="p-6"><ErrorState error="המקום עוד לא פורסם. סיימו את ההקמה כדי לפתוח משמרת." /></div>;

  const canAct = !stale && shift.role !== 'viewer' && connection !== 'offline';
  const labels = labelsById;
  const selected = selection?.kind === 'reservation' ? shift.reservations.find((r) => r.id === selection.id) ?? null : null;
  const today = dateInTz(now, shift.venue.timezone);
  const closed = shift.closed.find((x) => x.kind === 'closed' && !x.serviceKey);
  const shownDate = date || shift.serviceDate;
  const isToday = shownDate === today;
  const activeRows = tile === 'done' ? reservations : reservations.filter((r) => !isDone(r));
  const doneRows = tile === 'active' ? reservations.filter(isDone) : [];
  const items = timeline(activeRows, now, isToday ? timeInTz(now, shift.venue.timezone) : null);
  const groups = (['attention', 'upcoming', 'arrived', 'seated', 'done'] as Bucket[]).map((b) => ({ b, rows: reservations.filter((r) => bucketOf(r, now) === b) }));
  const nFilters = filterCount(filters);
  const row = (r: ShiftReservation, next = false, order = 0) => (
    <ReservationRow key={r.id} r={r} now={now} labels={labels} next={next} order={order} selected={selection?.kind === 'reservation' && selection.id === r.id}
      canAct={canAct} onSelect={() => setSelection({ kind: 'reservation', id: r.id })} onDone={done}
      onAssign={() => startAssign(r)} />
  );
  const switchView = (v: View) => { setView(v); setAssigning(null); };
  // Choosing a table happens on the map. Below the lg breakpoint the details are a bottom sheet that
  // would cover the map, so it closes; on a wide screen the details stay open beside the map.
  const startAssign = (r: ShiftReservation) => {
    setAssigning(r);
    setView('floor');
    setSelection(window.matchMedia('(min-width: 1024px)').matches ? { kind: 'reservation', id: r.id } : null);
  };
  // The reservation as it is now (a realtime update may have changed it since the move began).
  const assigningNow = assigning ? shift.reservations.find((x) => x.id === assigning.id) ?? assigning : null;

  // The time-ordered list as hour sections (with the "now" line between them).
  type Section = { kind: 'now'; key: string; time: string } | { kind: 'slot'; key: string; label: string; count: number; covers: number; rows: Extract<TimelineItem, { kind: 'row' }>[] };
  const sections: Section[] = [];
  for (const it of items) {
    if (it.kind === 'now') sections.push(it);
    else if (it.kind === 'slot') sections.push({ ...it, rows: [] });
    else (sections[sections.length - 1] as Extract<Section, { kind: 'slot' }>).rows.push(it);
  }
  let order = 0;

  return (
    <div className="fz-page flex min-h-screen flex-col bg-[var(--hs-page)]" dir="rtl">
      <a href="#shift-main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">דילוג לרשימת המשמרת</a>
      <header className="fz-topbar sticky top-0 z-30">
        <div className="flex items-center gap-2 px-3 pt-2 sm:gap-3 sm:px-4">
          <Link to={shift.role === 'owner' || shift.role === 'manager' ? `/app/tables/${venueId}` : '/app/tables'} aria-label="יציאה מהמשמרת"
            className="hs-round flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <svg viewBox="0 0 64 64" className="hs-mark hidden h-8 w-8 shrink-0 sm:block" aria-hidden="true"><rect width="64" height="64" rx="16" fill="currentColor" /><path d="M17 14h31l-6 9H26v7h13l-5.5 8H26v12h-9z" fill="var(--hs-mark-ink, #fff)" /><path d="M50 50H34l16-16z" fill="#E96B3D" /></svg>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[16px] font-semibold leading-tight text-[var(--hs-ink)] sm:text-lg">{shift.venue.name}</h1>
            <p className="hs-muted flex items-center gap-2 text-xs">
              <span><span className="sr-only">השעה במקום </span><bdi dir="ltr" className="font-semibold tabular-nums text-[var(--hs-ink)]">{timeInTz(now, shift.venue.timezone)}</bdi></span>
              <ConnectionBadge connection={connection} lastSync={lastSync} />
            </p>
          </div>
          <ThemeButton />
          <Button size="lg" icon={Plus} onClick={() => setQuickAdd('phone')} disabled={!canAct} className="hidden h-11 md:inline-flex">הוספה</Button>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-2 sm:px-4" role="group" aria-label="בחירת תאריך ומשמרת">
          <Button variant="ghost" size="sm" icon={ChevronRight} aria-label="יום קודם" onClick={() => setDate(addDays(shownDate, -1))} className="h-11 w-11 shrink-0 rounded-full px-0" />
          <label className="hs-datepill relative flex h-11 min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-[15px] font-semibold sm:max-w-xs sm:flex-none sm:px-4 focus-within:ring-2 focus-within:ring-orange">
            <CalendarDays className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
            <span className="truncate sm:hidden">{formatDateShort(shownDate)}</span><span className="hidden truncate sm:inline">{formatDate(shownDate, 'he', false)}</span>
            <span className="sr-only">תאריך המשמרת — בחירת תאריך אחר</span>
            <input id="shift-date" type="date" dir="ltr" value={shownDate} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          </label>
          <Button variant="ghost" size="sm" icon={ChevronLeft} aria-label="יום הבא" onClick={() => setDate(addDays(shownDate, 1))} className="h-11 w-11 shrink-0 rounded-full px-0" />
          {!isToday && <Button variant="secondary" size="sm" onClick={() => setDate(today)} className="h-11 shrink-0 rounded-xl px-3">היום</Button>}
          <div className="ms-auto" />
          {shift.services.length > 1 && view !== 'waitlist' && (
            <label className="hs-datepill relative flex h-11 shrink-0 items-center rounded-xl focus-within:ring-2 focus-within:ring-orange">
              <span className="sr-only">משמרת</span>
              <select aria-label="משמרת" value={service} onChange={(e) => setService(e.target.value)} className="hs-select h-11 appearance-none rounded-xl bg-transparent ps-3 pe-8 text-[15px] font-semibold focus:outline-none">
                <option value="all">כל היום</option>
                {shift.services.map((sv) => <option key={sv.key} value={sv.key}>{sv.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute end-2.5 h-4 w-4 text-ink-muted" aria-hidden />
            </label>
          )}
          <div className="hidden md:block">
            <Segmented label="תצוגה" size="lg" value={view} onChange={switchView} options={[
              { value: 'list', label: 'רשימה', icon: List },
              { value: 'floor', label: 'מפה', icon: LayoutGrid },
              { value: 'waitlist', label: 'המתנה', icon: ClipboardList, count: shift.waitlist.length },
            ]} />
          </div>
        </div>
        {connection === 'offline' && (
          <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800">
            אין חיבור לאינטרנט. מה שמוצג נכון לשעה <bdi dir="ltr">{lastSync ? timeInTz(lastSync, shift.venue.timezone) : '—'}</bdi>. פעולות מושבתות עד שהחיבור יחזור — שום דבר לא נשלח בינתיים.
          </p>
        )}
        {stale && <div className="hs-progress" role="progressbar" aria-label="טוען את היום שנבחר" />}
        {closed && !stale && <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">היום מסומן כסגור להזמנות{closed.note ? ` (${closed.note})` : ''}. הזמנות קיימות מוצגות למטה.</p>}
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 px-3 pt-3 sm:px-4">
        {view !== 'waitlist' && <ShiftSummaryBar summary={summary} counts={tiles} tile={tile} onTile={pickTile} showTabs={view === 'list'}
          tools={<>
            <div className="hidden w-60 md:block"><div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
                <label htmlFor="shift-search" className="sr-only">חיפוש לפי שם, טלפון, שולחן או קוד</label>
                <input id="shift-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש שם, טלפון, שולחן"
                  className="fz-input h-11 w-full rounded-xl border border-[var(--hs-line)] bg-[var(--hs-surface)] ps-9 pe-3 text-[15px] text-[var(--hs-ink)]" />
              </div></div>
            <button type="button" onClick={() => setSearchOpen((o) => !o)} aria-expanded={searchOpen || !!query} aria-controls="shift-search-row"
              aria-label="חיפוש" data-phone-only className={cx('hs-toolbtn', (searchOpen || query) && 'is-on')}><Search className="h-5 w-5" aria-hidden /></button>
            <button type="button" onClick={() => setFilterOpen(true)} aria-haspopup="dialog"
              aria-label={nFilters ? `סינון וסידור (${nFilters} פעילים)` : 'סינון וסידור'}
              className={cx('hs-toolbtn relative', (nFilters > 0 || sort !== 'time') && 'is-on')}>
              <SlidersHorizontal className="h-5 w-5" aria-hidden />
              {nFilters > 0 && <span className="absolute -top-1 -end-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--hs-accent)] px-1 text-[11px] font-bold text-[var(--hs-on-accent)]" aria-hidden>{nFilters}</span>}
            </button>
          </>}
          below={(searchOpen || query) ? <div id="shift-search-row" className="flex md:hidden"><div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
                <label htmlFor="shift-search-m" className="sr-only">חיפוש לפי שם, טלפון, שולחן או קוד</label>
                <input id="shift-search-m" type="search" value={query} autoFocus={searchOpen} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש שם, טלפון, שולחן"
                  className="fz-input h-11 w-full rounded-xl border border-[var(--hs-line)] bg-[var(--hs-surface)] ps-9 pe-3 text-[15px] text-[var(--hs-ink)]" />
              </div></div> : null} />}
        {view === 'list' && <ActiveFilters filters={filters} shift={shift} onChange={setFilters} />}
      </div>

      {assigning && (
        <div role="status" className="mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[var(--hs-accent)] bg-[var(--hs-accent-soft)] px-3 py-2 text-sm text-[var(--hs-ink)] sm:mx-4">
          בחרו שולחן במפה עבור {assigning.guestName} ({assigning.party} סועדים). שולחנות מתאימים מסומנים במסגרת.
          <Button size="sm" variant="secondary" onClick={() => setAssigning(null)} className="ms-auto h-10">ביטול</Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4 px-3 pb-28 pt-3 sm:px-4 md:pb-6">
        <main id="shift-main" ref={listRef} className={cx('min-w-0 flex-1 transition-opacity duration-150', stale && 'hs-stale')} aria-busy={stale || undefined} aria-label="המשמרת">
          <div key={view} className="hs-view">
          {view === 'list' && (
            reservations.length === 0 ? (
              <div className="hs-empty">
                <SearchX className="h-8 w-8" aria-hidden />
                <p className="mt-2 font-semibold text-[var(--hs-ink)]">{narrowing ? 'אין הזמנות שמתאימות לסינון' : 'אין הזמנות ליום הזה עדיין'}</p>
                <p className="mt-1 max-w-sm text-sm">
                  {narrowing ? 'נסו לשנות או לנקות את הסינון.' : 'אפשר להוסיף הזמנה טלפונית, אורחים מזדמנים או רשימת המתנה מכפתור ההוספה.'}
                </p>
                {narrowing && <Button variant="secondary" onClick={clearAll} className="mt-4 h-11">ניקוי הסינון</Button>}
              </div>
            ) : sort === 'status' ? (
              <div className="grid gap-3">
                {groups.filter((g) => g.rows.length).map((g) => (
                  <section key={g.b} aria-labelledby={`grp-${g.b}`}>
                    <h2 id={`grp-${g.b}`} className="hs-section-h">
                      {g.b === 'attention' && <Clock className="h-4 w-4 text-[var(--hs-attention)]" aria-hidden />}
                      <span>{BUCKET_HE[g.b]}</span> <span className="tabular-nums">· {g.rows.length}</span>
                    </h2>
                    <ul className="hs-list">{g.rows.map((r) => row(r, false, order++))}</ul>
                  </section>
                ))}
              </div>
            ) : (
              <div className="grid gap-3">
                {sections.map((sec) => sec.kind === 'now' ? (
                  <div key={sec.key} className="hs-nowmark" role="separator" aria-label={`עכשיו ${sec.time}`}><span>עכשיו <bdi dir="ltr">{sec.time}</bdi></span></div>
                ) : (
                  <section key={sec.key} aria-label={`${sec.label}: ${sec.count} הזמנות, ${sec.covers} סועדים`}>
                    <h2 className="hs-section-h"><b dir="ltr">{sec.label}</b><span>{sec.count === 1 ? 'הזמנה אחת' : `${sec.count} הזמנות`} · {sec.covers} סועדים</span></h2>
                    <ul className="hs-list">{sec.rows.map((it) => row(it.r, it.next, order++))}</ul>
                  </section>
                ))}
                {doneRows.length > 0 && (
                  <section aria-labelledby="grp-done">
                    <button type="button" id="grp-done" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)}
                      className="hs-section-h min-h-[44px] w-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
                      <ChevronDown className={cx('h-4 w-4 transition-transform', showDone && 'rotate-180')} aria-hidden />
                      <span>{BUCKET_HE.done}</span> <span className="tabular-nums">· {doneRows.length}</span>
                    </button>
                    {showDone && <ul className="hs-list mt-1">{doneRows.map((r) => row(r, false, order++))}</ul>}
                  </section>
                )}
              </div>
            )
          )}
          {view === 'floor' && (
            <FloorView shift={shift} states={tableStates} now={now} selection={selection} assigning={assigningNow} canAct={canAct}
              onSelectTable={(id) => setSelection({ kind: 'table', id })} onAssigned={(m) => { setAssigning(null); done(m); }} />
          )}
          {view === 'waitlist' && <WaitlistView shift={shift} now={now} canAct={canAct} onDone={done} onAdd={() => setQuickAdd('waitlist')} labels={labels} />}
          </div>
        </main>
        {selection && (
          <DetailPanel shift={shift} selection={selection} selected={selected} states={tableStates} now={now} canAct={canAct}
            onClose={() => setSelection(null)} onDone={done} onSelect={setSelection}
            onAssign={startAssign} />
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
    </div>
  );
}
