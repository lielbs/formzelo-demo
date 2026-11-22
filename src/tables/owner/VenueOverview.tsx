import { BarChart3, BookOpen, CalendarCheck, Check, Printer, X, CalendarX, ChevronDown, ChevronLeft, Copy, Download, ExternalLink, MessageCircle, Palette, Pause, Play, Settings2, ShieldCheck, Trash2, UserCog, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { confirmAction } from '../../components/Confirm';
import { clearLoadCache } from '../../lib/loadCache';
import { copyText, useToast } from '../../components/Toast';
import { Badge, Button, ButtonLink, Card, ErrorState, FieldLabel, Input, Select, Spinner, cx } from '../../components/ui';
import { publicBaseUrl } from '../../lib/links';
import { qrSvg, whatsappShareUrl } from '../../lib/share';
import { assignStaff, decidePending, deleteVenue, getShift, getVenue, listStaff, setException, setVenueStatus } from '../data/client';
import type { TablesError } from '../domain/errors';
import type { ShiftReservation, VenueDetail } from '../domain/types';
import { addDays, dateInTz, formatDate, timeInTz } from '../domain/time';
import { Hint, Ltr, useLoad } from '../ui';
import { GuestPrivacy } from './GuestPrivacy';

const ROLE_OPTIONS: [string, string][] = [['', 'ללא גישה למקום'], ['host', 'מארח/ת — מנהל/ת משמרת'], ['manager', 'מנהל/ת — גם הגדרות'], ['viewer', 'צפייה בנתונים בלבד']];

export const bookingUrl = (slug: string) => `${publicBaseUrl()}/t/${slug}`;

/**
 * The venue's home. It opens on today (bookings, covers, who is next, what needs a decision) with
 * the shift one tap away; sharing and the venue's sections follow; rarely used settings sit closed
 * at the bottom so the page reads as a place to work, not a settings form.
 */
export function VenueOverview() {
  const { venueId = '' } = useParams();
  const [params] = useSearchParams();
  const { data: venue, error, loading, reload } = useLoad(() => getVenue(venueId), [venueId], 'venue');

  if (loading && !venue) return <Spinner label="טוען…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!venue) return null;
  const canManage = venue.role === 'owner' || venue.role === 'manager';
  const published = venue.published;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-5 min-w-0">
        <Link to="/app/tables" className="text-sm text-ink-muted hover:text-ink">← כל המקומות</Link>
        <h1 className="mt-1 break-words text-[28px] font-bold leading-tight tracking-tight text-ink">{venue.name}</h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <Badge tone={venue.status === 'published' ? 'teal' : venue.status === 'paused' ? 'amber' : 'neutral'}>
            {venue.status === 'published' ? 'מקבל הזמנות' : venue.status === 'paused' ? 'הזמנות חדשות מושהות' : 'עוד לא פורסם'}
          </Badge>
          {venue.hasUnpublishedChanges && published && (
            <Link to={`/app/tables/${venue.id}/setup`} className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
              <Badge tone="amber">יש שינויים שלא פורסמו</Badge>
            </Link>
          )}
        </div>
      </div>

      {params.get('published') && (
        <div role="status" className="mb-5 rounded-2xl border border-teal-200 bg-teal-50 p-5 text-teal-900">
          <p className="text-lg font-semibold">המקום פורסם! אורחים יכולים להזמין עכשיו.</p>
          <p className="mt-1 text-sm">שתפו את הקישור באתר, באינסטגרם או בוואטסאפ, או הדפיסו את הקוד לשולחן הכניסה.</p>
        </div>
      )}

      {!published ? (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-lg font-semibold">ההקמה עוד לא הסתיימה</p>
            <p className="mt-0.5 text-sm text-ink-muted">כשמסיימים ומפרסמים, אורחים יכולים להזמין מהקישור של המקום.</p>
          </div>
          <ButtonLink to={`/app/tables/${venue.id}/setup`} icon={Settings2}>המשך ההקמה</ButtonLink>
        </Card>
      ) : (
        <Today venueId={venue.id} timezone={venue.timezone} />
      )}

      {published && canManage && (
        <nav aria-label="ניהול המקום" className="mt-6">
          <ul className="grid gap-px overflow-hidden rounded-2xl bg-ink/[0.08] shadow-card sm:grid-cols-2">
            {[
              { to: 'setup', icon: Settings2, title: 'שעות, שולחנות וכללים', hint: 'מתי פתוח, המפה ומי מאשר' },
              { to: 'menus', icon: BookOpen, title: 'תפריטים', hint: 'מנות, מחירים ותמונות' },
              { to: 'design', icon: Palette, title: 'עיצוב דפי ההזמנה', hint: 'איך האורחים רואים את המקום' },
              { to: 'analytics', icon: BarChart3, title: 'נתונים', hint: 'הזמנות, סועדים ושעות עומס' },
            ].map(({ to, icon: Icon, title, hint }) => (
              <li key={to} className="bg-white">
                <Link to={`/app/tables/${venue.id}/${to}`} className="flex min-h-[64px] items-center gap-3 px-4 py-3 hover:bg-cloud-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange">
                  <Icon className="h-5 w-5 shrink-0 text-ink-muted" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">{title}</span>
                    <span className="block text-sm text-ink-muted">{hint}</span>
                  </span>
                  <ChevronLeft className="h-4 w-4 shrink-0 text-ink-soft" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {published && <Share venue={venue} onChanged={reload} />}

      {(canManage || venue.role === 'owner') && (
        <section aria-labelledby="venue-more" className="mt-6">
          <h2 id="venue-more" className="mb-2 px-1 text-sm font-semibold text-ink-muted">עוד הגדרות</h2>
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            {published && canManage && (
              <More icon={CalendarX} title="ימים מיוחדים" hint="סגירה ליום או אישור ידני לכל הזמנה">
                <Closures venueId={venue.id} timezone={venue.timezone} />
              </More>
            )}
            {venue.role === 'owner' && (
              <More icon={UserCog} title="מי עובד במקום הזה" hint="מה כל איש צוות יכול לעשות כאן">
                <Team venueId={venue.id} />
              </More>
            )}
            {venue.role === 'owner' && (
              <More icon={ShieldCheck} title="בקשות פרטיות של אורחים" hint="הורדה או מחיקה של פרטי אורח">
                <GuestPrivacy organizationId={venue.organizationId} bare />
              </More>
            )}
            {venue.role === 'owner' && (
              <More icon={Trash2} title="מחיקת המקום" hint="הסרה של המקום והקישורים שלו" danger>
                <DeleteVenue venueId={venue.id} name={venue.name} />
              </More>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** A closed row that opens in place: rarely used settings stay out of the way until needed. */
function More({ icon: Icon, title, hint, danger = false, children }: { icon: LucideIcon; title: string; hint: string; danger?: boolean; children: ReactNode }) {
  return (
    <details className="group border-t border-cloud-200 first:border-t-0">
      <summary className="flex min-h-[64px] cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-cloud-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange [&::-webkit-details-marker]:hidden">
        <Icon className={cx('h-5 w-5 shrink-0', danger ? 'text-red-700' : 'text-ink-muted')} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={cx('block text-[15px] font-semibold', danger ? 'text-red-800' : 'text-ink')}>{title}</span>
          <span className="block text-sm text-ink-muted">{hint}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="px-4 pb-5 sm:px-5">{children}</div>
    </details>
  );
}

const ACTIVE = new Set(['pending_approval', 'confirmed', 'arrived', 'seated']);

/** Today at a glance, from the same shift data the host screen uses (one bounded read). */
export function Today({ venueId, timezone, title }: { venueId: string; timezone: string; title?: string }) {
  const today = dateInTz(new Date(), timezone);
  const { data, error, loading, reload } = useLoad(() => getShift(venueId, today), [venueId, today], 'venue-today');
  const pendingRows = (data?.reservations ?? []).filter((r) => r.status === 'pending_approval').sort((a, b) => a.time.localeCompare(b.time));
  const shiftHref = `/app/tables/${venueId}/live`;
  const now = timeInTz(new Date(), timezone);
  const active = (data?.reservations ?? []).filter((r) => ACTIVE.has(r.status));
  const covers = active.reduce((n, r) => n + r.party, 0);
  const pending = active.filter((r) => r.status === 'pending_approval').length;
  const seatedNow = active.filter((r) => r.status === 'seated').reduce((n, r) => n + r.party, 0);
  const waiting = (data?.waitlist ?? []).filter((w) => w.status === 'waiting' || w.status === 'offered').length;
  const next = active.filter((r) => (r.status === 'confirmed' || r.status === 'pending_approval') && r.time >= now).sort((a, b) => a.time.localeCompare(b.time))[0];
  const closedToday = (data?.closed ?? []).some((c) => c.kind === 'closed' && !c.serviceKey);

  return (
    <section aria-labelledby={`venue-today-${venueId}`} className="overflow-hidden rounded-2xl bg-white shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cloud-200 px-5 py-4">
        <div className="min-w-0">
          <h2 id={`venue-today-${venueId}`} className="text-lg font-semibold text-ink">{title ?? 'היום'}</h2>
          <p className="text-sm text-ink-muted">{formatDate(today, 'he', false)}{closedToday ? ' · סגור להזמנות' : ''}</p>
        </div>
        <ButtonLink to={shiftHref} icon={CalendarCheck} className="h-12 px-5 text-base">פתיחת המשמרת</ButtonLink>
      </div>
      {loading && !data ? (
        <div className="px-5 py-6"><div className="h-14 animate-pulse rounded-xl bg-cloud-100" aria-hidden /><span className="sr-only">טוען את ההזמנות של היום…</span></div>
      ) : error ? (
        <p className="px-5 py-5 text-sm text-ink-muted">לא הצלחנו לטעון את ההזמנות של היום. הן מופיעות במשמרת.</p>
      ) : active.length === 0 && waiting === 0 ? (
        <p className="px-5 py-5 text-[15px] text-ink-muted">עוד אין הזמנות להיום. כשאורחים יזמינו מהקישור, הם יופיעו כאן ובמשמרת.</p>
      ) : (
        <div className="grid gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-end">
          <Figure value={active.length} unit={active.length === 1 ? 'הזמנה' : 'הזמנות'} />
          <Figure value={covers} unit="סועדים" note={seatedNow ? `${seatedNow} יושבים עכשיו` : undefined} />
          <div className="grid gap-1.5 text-[15px] sm:justify-self-end sm:text-end">
            {next && (
              <p className="text-ink">
                <span className="text-ink-muted">הבאים: </span>
                <b className="tabular-nums">{next.time}</b> · {next.guestName} · {next.party} סועדים
              </p>
            )}
            {pending > 0 && <p className="font-semibold text-red-800">{pending === 1 ? 'הזמנה אחת מחכה לאישור שלכם' : `${pending} הזמנות מחכות לאישור שלכם`}</p>}
            {waiting > 0 && <p className="text-ink-muted">{waiting === 1 ? 'אורח אחד ברשימת ההמתנה' : `${waiting} אורחים ברשימת ההמתנה`}</p>}
          </div>
        </div>
      )}
      {/* Decide here, without opening the shift (UX audit A1.1). */}
      {pendingRows.length > 0 && (
        <ul className="grid gap-2 border-t border-cloud-200 px-5 py-4" aria-label="ממתינות לאישור">
          {pendingRows.slice(0, 3).map((r) => <PendingRow key={r.id} r={r} onDone={reload} />)}
          {pendingRows.length > 3 && <li><Link to={shiftHref} className="text-sm font-medium text-orange-800 hover:underline">עוד {pendingRows.length - 3} במשמרת</Link></li>}
        </ul>
      )}
    </section>
  );
}

function PendingRow({ r, onDone }: { r: ShiftReservation; onDone: () => unknown }) {
  const toast = useToast();
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const decide = async (d: 'approve' | 'reject') => {
    if (d === 'reject' && !(await confirmAction({ title: `לדחות את הבקשה של ${r.guestName}?`, message: 'האורח יראה שהבקשה נדחתה. אפשר להתקשר אליו מהמשמרת.', confirmLabel: 'דחייה', destructive: true }))) return;
    setBusy(d);
    try { await decidePending(r.id, d, r.lockVersion); toast(d === 'approve' ? `${r.guestName}: אושרה` : `${r.guestName}: נדחתה`, 'success'); await onDone(); }
    catch (e) { toast((e as TablesError).message, 'error'); await onDone(); }
    finally { setBusy(null); }
  };
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl bg-amber-50 px-3 py-2">
      <span className="min-w-0 flex-1 text-[15px]"><b className="tabular-nums">{r.time}</b> · {r.guestName} · {r.party} סועדים{r.approvalRule && r.approvalRule !== 'venue_default' ? <span className="text-sm text-ink-muted"> · לפי כלל</span> : null}</span>
      <Button size="sm" icon={Check} loading={busy === 'approve'} disabled={!!busy} onClick={() => void decide('approve')} className="h-10">אישור</Button>
      <Button size="sm" variant="ghost" icon={X} loading={busy === 'reject'} disabled={!!busy} onClick={() => void decide('reject')} className="h-10 text-red-700">דחייה</Button>
    </li>
  );
}

/** Opens a printable page with one large QR code per link (A4: three per page; each cuts to A6). */
function printKit(venueName: string, codes: { title: string; url: string }[]) {
  const w = window.open('', '_blank', 'noopener=no,width=820,height=1000');
  if (!w) return;
  const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const cards = codes.map((c) => `<section><h2>${esc(c.title)}</h2>${qrSvg(c.url, { size: 520 })}<p dir="ltr">${esc(c.url.replace(/^https?:\/\//, ''))}</p></section>`).join('');
  w.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${esc(venueName)} · קודים להדפסה</title><style>
    @page { size: A4; margin: 12mm; } body { font-family: system-ui, sans-serif; margin: 0; color: #0F1B2D; }
    header { text-align: center; margin: 4mm 0 6mm; } header h1 { font-size: 26pt; margin: 0; }
    main { display: grid; gap: 8mm; } section { break-inside: avoid; border: 1px dashed #c7cdd6; border-radius: 6mm; padding: 6mm; text-align: center; }
    section h2 { font-size: 22pt; margin: 0 0 3mm; } section svg { width: 62mm; height: 62mm; } section p { font-size: 10pt; color: #5b6678; margin: 2mm 0 0; }
    button { margin: 6mm auto; display: block; font-size: 14pt; padding: 3mm 8mm; } @media print { button { display: none; } }
  </style></head><body><header><h1>${esc(venueName)}</h1></header><main>${cards}</main></body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

function Figure({ value, unit, note }: { value: number; unit: string; note?: string }) {
  return (
    <div>
      <p className="text-ink"><b className="text-[40px] font-bold leading-none tracking-tight tabular-nums">{value}</b> <span className="text-base font-medium text-ink-muted">{unit}</span></p>
      {note && <p className="mt-1 text-sm text-ink-muted">{note}</p>}
    </div>
  );
}

function Share({ venue, onChanged }: { venue: VenueDetail; onChanged: () => unknown }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const url = bookingUrl(venue.slug);
  const waitlistUrl = `${url}/waitlist`;
  const waitlistPublic = !!venue.published?.snapshot.policy.waitlist?.publicEnabled;

  async function togglePause() {
    setBusy(true);
    try {
      await setVenueStatus(venue.id, venue.status === 'paused' ? 'published' : 'paused');
      await onChanged();
      toast(venue.status === 'paused' ? 'ההזמנות נפתחו מחדש' : 'הזמנות חדשות הושהו. הזמנות קיימות לא השתנו.', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <Card as="section" className="p-5">
        <h2 className="font-semibold">הקישור להזמנות</h2>
        <Input readOnly dir="ltr" value={url} aria-label="קישור ההזמנות" onFocus={(e) => e.currentTarget.select()} className="mt-3 min-w-0" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={Copy} onClick={async () => toast((await copyText(url)) ? 'הקישור הועתק' : 'לא ניתן להעתיק', 'success')} className="h-10">העתקה</Button>
          <a className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cloud-300 bg-white px-3 text-sm font-medium text-ink hover:bg-cloud" href={whatsappShareUrl(`להזמנת שולחן ב${venue.name}: ${url}`)} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" aria-hidden /> שיתוף בוואטסאפ
          </a>
          <a className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cloud-300 bg-white px-3 text-sm font-medium text-ink hover:bg-cloud" href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" aria-hidden /> צפייה כמו אורח
          </a>
        </div>
        {waitlistPublic && (
          <div className="mt-5 border-t border-cloud-200 pt-4">
            <h3 className="text-sm font-semibold">רשימת המתנה בכניסה</h3>
            <p className="mt-0.5 text-sm text-ink-muted">הדפיסו את הקוד ושימו אותו בדלת: אורחים מצטרפים לרשימה מהטלפון.</p>
            <Input readOnly dir="ltr" value={waitlistUrl} aria-label="קישור רשימת ההמתנה" onFocus={(e) => e.currentTarget.select()} className="mt-2" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={Copy} onClick={async () => toast((await copyText(waitlistUrl)) ? 'הקישור הועתק' : 'לא ניתן להעתיק', 'success')} className="h-10">העתקה</Button>
              <a download={`qr-waitlist-${venue.slug}.svg`} href={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(waitlistUrl, { size: 1024 }))}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-cloud-300 bg-white px-3 text-sm font-medium text-ink hover:bg-cloud">
                <Download className="h-4 w-4" aria-hidden /> קוד QR להדפסה
              </a>
            </div>
          </div>
        )}
        {venue.role === 'owner' && (
          <div className="mt-5 border-t border-cloud-200 pt-4">
            <Button size="sm" variant={venue.status === 'paused' ? 'primary' : 'secondary'} icon={venue.status === 'paused' ? Play : Pause} loading={busy} onClick={togglePause} className="h-10">
              {venue.status === 'paused' ? 'פתיחת ההזמנות מחדש' : 'השהיית הזמנות חדשות'}
            </Button>
          </div>
        )}
      </Card>
      {/* One print kit (UX audit A1.4): booking, waitlist and menu codes on one page for the door and the tables. */}
      <Card className="flex flex-col items-center gap-2 p-4">
        <img src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(url, { size: 220 }))}`} width={180} height={180} alt={`קוד QR לעמוד ההזמנות של ${venue.name}`} />
        <Button size="sm" variant="secondary" icon={Printer} onClick={() => printKit(venue.name, [
          { title: 'הזמנת שולחן', url },
          ...(waitlistPublic ? [{ title: 'רשימת המתנה', url: waitlistUrl }] : []),
          { title: 'התפריט', url: `${url}/menu` },
        ])} className="h-10">ערכת הדפסה</Button>
        <a download={`qr-${venue.slug}.svg`} href={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(url, { size: 1024 }))}`} className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-orange-800 hover:underline">
          <Download className="h-4 w-4" aria-hidden /> הורדת הקוד כקובץ
        </a>
      </Card>
    </div>
  );
}

function Closures({ venueId, timezone }: { venueId: string; timezone: string }) {
  const toast = useToast();
  const today = dateInTz(new Date(), timezone);
  const [date, setDate] = useState(addDays(today, 1));
  const [kind, setKind] = useState<'closed' | 'manual_approval'>('closed');
  const [note, setNote] = useState('');
  const [list, setList] = useState<{ date: string; kind: string; note: string | null }[] | null>(null);
  const [busy, setBusy] = useState(false);
  async function apply(k: 'closed' | 'manual_approval' | null, d = date) {
    setBusy(true);
    try {
      setList(await setException(venueId, d, k, note || null));
      toast(k ? 'נשמר. הזמנות קיימות לתאריך הזה לא בוטלו — אפשר לראות ולטפל בהן במשמרת.' : 'החריגה הוסרה', 'success');
      setNote('');
    } catch (e) {
      toast((e as TablesError).message, 'error');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p className="text-sm text-ink-muted">סגירה ליום (חג, אירוע פרטי) או "כל הזמנה באותו יום דורשת אישור". זה חל מיד, בלי לפרסם מחדש, ולא מבטל הזמנות שכבר קיימות.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[10rem_14rem_1fr_auto] sm:items-end">
        <div>
          <FieldLabel htmlFor="ex-date">תאריך</FieldLabel>
          <Input id="ex-date" type="date" dir="ltr" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="ex-kind">מה קורה ביום הזה</FieldLabel>
          <Select id="ex-kind" value={kind} onChange={(e) => setKind(e.target.value as 'closed' | 'manual_approval')}>
            <option value="closed">סגור להזמנות</option>
            <option value="manual_approval">כל הזמנה דורשת אישור</option>
          </Select>
        </div>
        <div>
          <FieldLabel htmlFor="ex-note">הערה פנימית (רשות)</FieldLabel>
          <Input id="ex-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="למשל: אירוע סגור" />
        </div>
        <Button onClick={() => void apply(kind)} loading={busy} className="h-11">שמירה</Button>
      </div>
      {list && list.length > 0 && (
        <ul className="mt-4 divide-y divide-cloud-200 text-sm">
          {list.map((x) => (
            <li key={`${x.date}-${x.kind}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{formatDate(x.date)} — {x.kind === 'closed' ? 'סגור' : 'באישור בלבד'}{x.note ? ` (${x.note})` : ''}</span>
              <Button size="sm" variant="ghost" onClick={() => void apply(null, x.date)}>הסרה</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Team({ venueId }: { venueId: string }) {
  const toast = useToast();
  const { data, error, reload, setData } = useLoad(() => listStaff(venueId), [venueId], 'staff');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <div>
      <p className="text-sm text-ink-muted">אנשי צוות מוזמנים מ״הגדרות ← צוות״. כאן בוחרים מה כל אחד יכול לעשות במקום הזה. הסרת גישה חלה מיד.</p>
      {!data ? <Spinner /> : (
        <ul className="mt-3 divide-y divide-cloud-200">
          {data.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <Ltr className="min-w-0 break-all text-sm">{m.email}</Ltr>
              {m.orgRole === 'owner' ? <Badge tone="dark">בעלים — גישה מלאה</Badge> : (
                <div className="w-full sm:w-64">
                  <label className="sr-only" htmlFor={`role-${m.userId}`}>הרשאה של {m.email}</label>
                  <Select id={`role-${m.userId}`} value={m.venueRole ?? ''} onChange={async (e) => {
                    try {
                      setData(await assignStaff(venueId, m.userId, e.target.value || null));
                      toast('ההרשאה עודכנה', 'success');
                    } catch (err) {
                      toast((err as Error).message, 'error');
                    }
                  }}>
                    {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && data.length === 1 && <div className="mt-3"><Hint>עוד אין אנשי צוות בעסק. הזמינו אותם מ״הגדרות ← צוות״, ואז תוכלו לתת להם גישה כאן.</Hint></div>}
    </div>
  );
}

/** Owner only. Refused by the server while guests still expect the venue (upcoming bookings, waitlist). */
function DeleteVenue({ venueId, name }: { venueId: string; name: string }) {
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <div>
      <p className="text-sm text-ink-muted [text-wrap:pretty]">
        המקום, המפה, התפריטים ודפי ההזמנה יוסרו, והקישורים יפסיקו לעבוד. אפשר למחוק רק כשאין הזמנות עתידיות ואין אורחים ברשימת ההמתנה.
        רוצים רק לעצור הזמנות? אפשר להשהות ליד הקישור להזמנות.
      </p>
      <Button variant="danger" icon={Trash2} className="mt-4"
        onClick={() => void confirmAction({
          title: `למחוק את ${name}?`,
          message: 'המקום ייעלם מהרשימה, כל הקישורים שלו יפסיקו לעבוד ואי אפשר יהיה לשחזר אותו.',
          confirmLabel: 'מחיקת המקום',
          destructive: true,
          typeToConfirm: name,
          action: async () => {
            try {
              await deleteVenue(venueId, name);
            } catch (e) {
              const err = e as TablesError;
              const d = err.detail as { upcoming?: number; waiting?: number } | undefined;
              if (err.code === 'venue_has_guests' && d) {
                const parts = [
                  d.upcoming ? (d.upcoming === 1 ? 'הזמנה עתידית אחת' : `${d.upcoming} הזמנות עתידיות`) : '',
                  d.waiting ? (d.waiting === 1 ? 'אורח אחד ברשימת ההמתנה' : `${d.waiting} אורחים ברשימת ההמתנה`) : '',
                ].filter(Boolean).join(' ו־');
                throw new Error(`עדיין יש ${parts}. סגרו אותם במשמרת, ואז אפשר למחוק. רוצים רק לעצור הזמנות חדשות? אפשר להשהות.`);
              }
              throw e;
            }
          },
        }).then((ok) => { if (ok) { clearLoadCache(); toast('המקום נמחק', 'success'); navigate('/app/tables'); } })}>
        מחיקת המקום
      </Button>
    </div>
  );
}
