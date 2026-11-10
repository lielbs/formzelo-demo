/**
 * Live shift: tablet-landscape first, usable in portrait and as an emergency phone list.
 * Every inventory action waits for the server; nothing shows as done before it is.
 */
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Clock, LayoutGrid, List, Plus, RefreshCw, Search, Users, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Button, cx, ErrorState, Spinner } from '../../components/ui';
import { useShiftSync, type Connection } from '../data/useShiftSync';
import { bucketOf, BUCKET_HE, counters, deriveTableStates, type Bucket } from '../domain/status';
import { addDays, currentServiceDate, dateInTz, formatDate, timeInTz } from '../domain/time';
import type { ShiftReservation } from '../domain/types';
import { ThemeButton } from '../theme';
import { Segmented } from '../ui';
import { DetailPanel, type Selection } from './DetailPanel';
import { FloorView } from './FloorView';
import { QuickAdd, type QuickAddMode } from './QuickAdd';
import { ReservationRow } from './ReservationRow';
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

  const reservations = useMemo(() => {
    if (!shift) return [];
    const q = query.trim().toLowerCase();
    return shift.reservations.filter((r) =>
      (service === 'all' || r.serviceKey === service)
      && (!q || r.guestName.toLowerCase().includes(q) || r.reference.toLowerCase().includes(q) || (r.guestPhone ?? '').includes(q.replace(/\D/g, '') || '~')
        || r.tableIds.some((id) => shift.tables.find((t) => t.id === id)?.label.toLowerCase() === q)));
  }, [shift, service, query]);
  const tableStates = useMemo(() => (shift ? deriveTableStates(shift, now) : new Map()), [shift, now]);
  const c = useMemo(() => counters(shift?.reservations ?? [], now), [shift, now]);

  if (error && !shift) return <div className="p-6"><ErrorState error={error} onRetry={refetch} /></div>;
  if (!shift) return <Spinner label="טוען את המשמרת…" />;
  if (!shift.published) return <div className="p-6"><ErrorState error="המקום עוד לא פורסם. סיימו את ההקמה כדי לפתוח משמרת." /></div>;

  const canAct = shift.role !== 'viewer' && connection !== 'offline';
  const labels = new Map(shift.tables.map((t) => [t.id, t.label]));
  const groups = (['attention', 'upcoming', 'arrived', 'seated', 'done'] as Bucket[]).map((b) => ({ b, rows: reservations.filter((r) => bucketOf(r, now) === b) }));
  const selected = selection?.kind === 'reservation' ? shift.reservations.find((r) => r.id === selection.id) ?? null : null;
  const today = dateInTz(now, shift.venue.timezone);
  const closed = shift.closed.find((x) => x.kind === 'closed' && !x.serviceKey);

  return (
    <div className="fz-page flex min-h-screen flex-col bg-cloud" dir="rtl">
      <a href="#shift-main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">דילוג לרשימת המשמרת</a>
      <header className="sticky top-0 z-30 border-b border-cloud-200 bg-white/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 sm:px-4">
          <Link to={shift.role === 'owner' || shift.role === 'manager' ? `/app/tables/${venueId}` : '/app/tables'} aria-label="יציאה מהמשמרת"
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-cloud-300 text-ink hover:bg-cloud focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <div className="min-w-0 w-[calc(100%-3.5rem)] sm:w-auto sm:flex-1">
            <h1 className="truncate text-base font-semibold text-ink sm:text-lg">{shift.venue.name}</h1>
            <p className="truncate text-xs text-ink-muted">
              {formatDate(shift.serviceDate, 'he', false)}{shift.serviceDate === today ? ' · היום' : ''} · השעה במקום <bdi dir="ltr">{timeInTz(now, shift.venue.timezone)}</bdi>
            </p>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="בחירת תאריך">
            <Button variant="secondary" size="sm" icon={ChevronRight} aria-label="יום קודם" onClick={() => setDate(addDays(shift.serviceDate, -1))} className="h-11 w-11 px-0" />
            <label className="sr-only" htmlFor="shift-date">תאריך המשמרת</label>
            <input id="shift-date" type="date" dir="ltr" value={shift.serviceDate} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="fz-input hidden h-11 rounded-xl border border-cloud-300 bg-white px-2 text-sm md:block" />
            {shift.serviceDate !== today && <Button variant="secondary" size="sm" icon={CalendarDays} onClick={() => setDate(today)} className="h-11">היום</Button>}
            <Button variant="secondary" size="sm" icon={ChevronLeft} aria-label="יום הבא" onClick={() => setDate(addDays(shift.serviceDate, 1))} className="h-11 w-11 px-0" />
          </div>
          <ConnectionBadge connection={connection} lastSync={lastSync} />
          <ThemeButton />
          <Button size="lg" icon={Plus} onClick={() => setQuickAdd('phone')} disabled={!canAct} className="h-11">הוספה</Button>
        </div>
        <dl tabIndex={0} className="flex gap-2 overflow-x-auto px-3 pb-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange sm:px-4" aria-label="סיכום המשמרת">
          {[
            ['ממתינים לאישור', c.pending, c.pending > 0 ? 'border-amber-300 bg-amber-50 text-amber-900' : ''],
            ['מאחרים', c.late, c.late > 0 ? 'border-orange-300 bg-orange-50 text-orange-800' : ''],
            ['בלי שולחן', c.unassigned, c.unassigned > 0 ? 'border-red-200 bg-red-50 text-red-800' : ''],
            ['צפויים', c.upcoming, ''],
            ['הגיעו', c.arrived, ''],
            ['יושבים', `${c.seated} · ${c.covers} סועדים`, ''],
            ['בהמתנה', shift.waitlist.length, ''],
          ].map(([label, value, cls]) => (
            <div key={label as string} className={cx('flex shrink-0 items-baseline gap-1.5 rounded-lg border border-cloud-200 bg-white px-2.5 py-1', cls as string)}>
              <dt className="text-xs">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
        {connection === 'offline' && (
          <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-800">
            אין חיבור לאינטרנט. מה שמוצג נכון לשעה <bdi dir="ltr">{lastSync ? timeInTz(lastSync, shift.venue.timezone) : '—'}</bdi>. פעולות מושבתות עד שהחיבור יחזור — שום דבר לא נשלח בינתיים.
          </p>
        )}
        {closed && <p className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">היום מסומן כסגור להזמנות{closed.note ? ` (${closed.note})` : ''}. הזמנות קיימות מוצגות למטה.</p>}
      </header>

      <div className="flex flex-wrap items-center gap-2 px-3 py-3 sm:px-4">
        <Segmented label="תצוגה" size="lg" value={view} onChange={(v) => { setView(v); setAssigning(null); }} options={[
          { value: 'list', label: 'רשימה', icon: List },
          { value: 'floor', label: 'מפה', icon: LayoutGrid },
          { value: 'waitlist', label: 'המתנה', icon: ClipboardList, count: shift.waitlist.length },
        ]} />
        {shift.services.length > 1 && view !== 'waitlist' && (
          <Segmented label="משמרת" value={service} onChange={setService} options={[{ value: 'all', label: 'הכול' }, ...shift.services.map((s) => ({ value: s.key, label: s.name }))]} />
        )}
        {view === 'list' && (
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" aria-hidden />
            <label htmlFor="shift-search" className="sr-only">חיפוש לפי שם, טלפון, שולחן או קוד</label>
            <input id="shift-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש שם, טלפון, שולחן"
              className="fz-input h-11 w-full rounded-xl border border-cloud-300 bg-white ps-9 pe-3 text-[15px]" />
          </div>
        )}
      </div>

      {assigning && (
        <div role="status" className="mx-3 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 sm:mx-4">
          בחרו שולחן במפה עבור {assigning.guestName} ({assigning.party} סועדים). שולחנות מתאימים מסומנים במסגרת.
          <Button size="sm" variant="secondary" onClick={() => setAssigning(null)} className="ms-auto h-10">ביטול</Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 gap-4 px-3 pb-4 sm:px-4">
        <main id="shift-main" ref={listRef} className={cx('min-w-0 flex-1', selection && 'pb-[45vh] lg:pb-0')} aria-label="המשמרת">
          {view === 'list' && (
            reservations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-cloud-300 bg-white p-8 text-center text-sm text-ink-muted">
                {query ? 'אין תוצאות לחיפוש.' : 'אין הזמנות ליום הזה עדיין. אפשר להוסיף הזמנה טלפונית או אורחים מזדמנים מ״הוספה״.'}
              </div>
            ) : (
              <div className="grid gap-4">
                {groups.filter((g) => g.rows.length).map((g) => (
                  <section key={g.b} aria-labelledby={`grp-${g.b}`}>
                    <h2 id={`grp-${g.b}`} className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink-muted">
                      {g.b === 'attention' && <Clock className="h-4 w-4 text-orange-800" aria-hidden />}
                      {BUCKET_HE[g.b]} <span className="tabular-nums">({g.rows.length})</span>
                    </h2>
                    <ul className="grid gap-2">
                      {g.rows.map((r) => (
                        <ReservationRow key={r.id} r={r} now={now} labels={labels} selected={selection?.kind === 'reservation' && selection.id === r.id}
                          canAct={canAct} onSelect={() => setSelection({ kind: 'reservation', id: r.id })} onDone={done}
                          onAssign={() => { setAssigning(r); setView('floor'); setSelection({ kind: 'reservation', id: r.id }); }} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )
          )}
          {view === 'floor' && (
            <FloorView shift={shift} states={tableStates} now={now} selection={selection} assigning={assigning} canAct={canAct}
              onSelectTable={(id) => setSelection({ kind: 'table', id })} onAssigned={(m) => { setAssigning(null); done(m); }} />
          )}
          {view === 'waitlist' && <WaitlistView shift={shift} now={now} canAct={canAct} onDone={done} onAdd={() => setQuickAdd('waitlist')} labels={labels} />}
        </main>
        {selection && (
          <DetailPanel shift={shift} selection={selection} selected={selected} states={tableStates} now={now} canAct={canAct}
            onClose={() => setSelection(null)} onDone={done} onSelect={setSelection}
            onAssign={(r) => { setAssigning(r); setView('floor'); }} />
        )}
      </div>

      {quickAdd && <QuickAdd mode={quickAdd} shift={shift} states={tableStates} onClose={() => setQuickAdd(null)} onDone={(m) => { setQuickAdd(null); done(m); }} />}
      <div aria-live="polite" className="sr-only">{announce}</div>
      <p className="px-4 pb-3 text-center text-xs text-ink-muted"><Users className="inline h-3.5 w-3.5" aria-hidden /> הפרטים האישיים של האורחים מיועדים לשירות בלבד.</p>
    </div>
  );
}
