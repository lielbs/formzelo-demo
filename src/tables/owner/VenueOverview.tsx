import { BarChart3, BookOpen, CalendarCheck, CalendarX, Copy, Download, ExternalLink, MessageCircle, Palette, Pause, Play, Settings2, Trash2, UserCog } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { confirmAction } from '../../components/Confirm';
import { clearLoadCache } from '../../lib/loadCache';
import { copyText, useToast } from '../../components/Toast';
import { Badge, Button, Card, ErrorState, FieldLabel, Input, Select, Spinner } from '../../components/ui';
import { publicBaseUrl } from '../../lib/links';
import { qrSvg, whatsappShareUrl } from '../../lib/share';
import { assignStaff, deleteVenue, getVenue, listStaff, setException, setVenueStatus } from '../data/client';
import type { TablesError } from '../domain/errors';
import { addDays, dateInTz, formatDate } from '../domain/time';
import { Hint, Ltr, useLoad } from '../ui';
import { GuestPrivacy } from './GuestPrivacy';

const ROLE_OPTIONS: [string, string][] = [['', 'ללא גישה למקום'], ['host', 'מארח/ת — מנהל/ת משמרת'], ['manager', 'מנהל/ת — גם הגדרות'], ['viewer', 'צפייה בנתונים בלבד']];

export const bookingUrl = (slug: string) => `${publicBaseUrl()}/t/${slug}`;

export function VenueOverview() {
  const { venueId = '' } = useParams();
  const [params] = useSearchParams();
  const toast = useToast();
  const { data: venue, error, loading, reload } = useLoad(() => getVenue(venueId), [venueId], 'venue');
  const [busy, setBusy] = useState<string | null>(null);

  if (loading && !venue) return <Spinner label="טוען…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!venue) return null;
  const canManage = venue.role === 'owner' || venue.role === 'manager';
  const url = bookingUrl(venue.slug);
  const waitlistUrl = `${url}/waitlist`;
  const published = venue.published;
  const waitlistPublic = !!published?.snapshot.policy.waitlist?.publicEnabled;

  async function togglePause() {
    if (!venue) return;
    setBusy('pause');
    try {
      await setVenueStatus(venue.id, venue.status === 'paused' ? 'published' : 'paused');
      await reload();
      toast(venue.status === 'paused' ? 'ההזמנות נפתחו מחדש' : 'הזמנות חדשות הושהו. הזמנות קיימות לא השתנו.', 'success');
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to="/app/tables" className="text-sm text-ink-muted hover:text-ink">← כל המקומות</Link>
          <h1 className="mt-1 break-words text-[28px] font-bold leading-tight tracking-tight text-ink">{venue.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Badge tone={venue.status === 'published' ? 'teal' : venue.status === 'paused' ? 'amber' : 'neutral'}>
              {venue.status === 'published' ? 'מקבל הזמנות' : venue.status === 'paused' ? 'הזמנות חדשות מושהות' : 'עוד לא פורסם'}
            </Badge>
            {published && <span>גרסה {published.versionNumber}</span>}
            {venue.hasUnpublishedChanges && published && <Badge tone="amber">יש שינויים שלא פורסמו</Badge>}
          </div>
        </div>
        {published && (
          <Link to={`/app/tables/${venue.id}/live`} className="inline-flex h-12 items-center gap-2 rounded-xl bg-midnight px-5 text-base font-medium text-white hover:bg-midnight-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2">
            <CalendarCheck className="h-5 w-5" aria-hidden /> פתיחת המשמרת
          </Link>
        )}
      </div>

      {params.get('published') && (
        <div role="status" className="mb-6 rounded-2xl border border-teal-200 bg-teal-50 p-5 text-teal-900">
          <p className="text-lg font-semibold">המקום פורסם! אורחים יכולים להזמין עכשיו.</p>
          <p className="mt-1 text-sm">שתפו את הקישור למטה באתר, באינסטגרם או בוואטסאפ, או הדפיסו את הקוד לשולחן הכניסה.</p>
        </div>
      )}

      {!published && (
        <Card className="mb-6 p-5">
          <p className="font-medium">ההקמה עוד לא הסתיימה.</p>
          <Link to={`/app/tables/${venue.id}/setup`} className="mt-2 inline-block text-sm font-medium text-orange-800 hover:underline">להמשך ההקמה ←</Link>
        </Card>
      )}

      {published && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <Card as="section" className="p-5">
            <h2 className="font-semibold">הקישור להזמנות</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input readOnly dir="ltr" value={url} aria-label="קישור ההזמנות" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1" />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" icon={Copy} onClick={async () => toast((await copyText(url)) ? 'הקישור הועתק' : 'לא ניתן להעתיק', 'success')}>העתקה</Button>
              <a className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cloud-300 bg-white px-3 text-sm font-medium text-ink hover:bg-cloud" href={whatsappShareUrl(`להזמנת שולחן ב${venue.name}: ${url}`)} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="h-4 w-4" aria-hidden /> שיתוף בוואטסאפ
              </a>
              <a className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cloud-300 bg-white px-3 text-sm font-medium text-ink hover:bg-cloud" href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden /> צפייה כמו אורח
              </a>
            </div>
            {waitlistPublic && (
              <div className="mt-5 border-t border-cloud-200 pt-4">
                <h3 className="text-sm font-semibold">רשימת המתנה בכניסה</h3>
                <p className="mt-0.5 text-sm text-ink-muted">הדפיסו את הקוד ושימו אותו בדלת: אורחים מצטרפים לרשימה מהטלפון.</p>
                <Input readOnly dir="ltr" value={waitlistUrl} aria-label="קישור רשימת ההמתנה" onFocus={(e) => e.currentTarget.select()} className="mt-2" />
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={Copy} onClick={async () => toast((await copyText(waitlistUrl)) ? 'הקישור הועתק' : 'לא ניתן להעתיק', 'success')}>העתקה</Button>
                  <a download={`qr-waitlist-${venue.slug}.svg`} href={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(waitlistUrl, { size: 1024 }))}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-cloud-300 bg-white px-3 text-sm font-medium text-ink hover:bg-cloud">
                    <Download className="h-4 w-4" aria-hidden /> קוד QR להדפסה
                  </a>
                </div>
              </div>
            )}
            {canManage && (
              <div className="mt-5 flex flex-wrap gap-2 border-t border-cloud-200 pt-4">
                <Link to={`/app/tables/${venue.id}/setup`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-cloud-300 bg-white px-3 text-sm font-medium hover:bg-cloud"><Settings2 className="h-4 w-4" aria-hidden /> שעות, שולחנות וכללים</Link>
                <Link to={`/app/tables/${venue.id}/menus`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-cloud-300 bg-white px-3 text-sm font-medium hover:bg-cloud"><BookOpen className="h-4 w-4" aria-hidden /> תפריטים</Link>
                <Link to={`/app/tables/${venue.id}/design`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-cloud-300 bg-white px-3 text-sm font-medium hover:bg-cloud"><Palette className="h-4 w-4" aria-hidden /> עיצוב דפי ההזמנה</Link>
                <Link to={`/app/tables/${venue.id}/analytics`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-cloud-300 bg-white px-3 text-sm font-medium hover:bg-cloud"><BarChart3 className="h-4 w-4" aria-hidden /> נתונים</Link>
                {venue.role === 'owner' && (
                  <Button size="sm" variant={venue.status === 'paused' ? 'primary' : 'secondary'} icon={venue.status === 'paused' ? Play : Pause} loading={busy === 'pause'} onClick={togglePause} className="h-10">
                    {venue.status === 'paused' ? 'פתיחת ההזמנות מחדש' : 'השהיית הזמנות חדשות'}
                  </Button>
                )}
              </div>
            )}
          </Card>
          <Card className="flex flex-col items-center gap-2 p-4">
            <img src={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(url, { size: 220 }))}`} width={180} height={180} alt={`קוד QR לעמוד ההזמנות של ${venue.name}`} />
            <a download={`qr-${venue.slug}.svg`} href={`data:image/svg+xml;utf8,${encodeURIComponent(qrSvg(url, { size: 1024 }))}`} className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-orange-800 hover:underline">
              <Download className="h-4 w-4" aria-hidden /> הורדת הקוד להדפסה
            </a>
          </Card>
        </div>
      )}

      {published && canManage && <Closures venueId={venue.id} timezone={venue.timezone} />}
      {venue.role === 'owner' && <Team venueId={venue.id} />}
      {venue.role === 'owner' && <GuestPrivacy organizationId={venue.organizationId} />}
      {venue.role === 'owner' && <DeleteVenue venueId={venue.id} name={venue.name} />}
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
    <Card as="section" className="mt-6 p-5">
      <h2 className="flex items-center gap-2 font-semibold"><CalendarX className="h-5 w-5" aria-hidden /> ימים מיוחדים</h2>
      <p className="mt-1 text-sm text-ink-muted">סגירה ליום (חג, אירוע פרטי) או "כל הזמנה באותו יום דורשת אישור". זה חל מיד, בלי לפרסם מחדש, ולא מבטל הזמנות שכבר קיימות.</p>
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
    </Card>
  );
}

function Team({ venueId }: { venueId: string }) {
  const toast = useToast();
  const { data, error, reload, setData } = useLoad(() => listStaff(venueId), [venueId], 'staff');
  if (error) return <div className="mt-6"><ErrorState error={error} onRetry={reload} /></div>;
  return (
    <Card as="section" className="mt-6 p-5">
      <h2 className="flex items-center gap-2 font-semibold"><UserCog className="h-5 w-5" aria-hidden /> מי עובד במקום הזה</h2>
      <p className="mt-1 text-sm text-ink-muted">אנשי צוות מוזמנים מ״הגדרות ← צוות״. כאן בוחרים מה כל אחד יכול לעשות במקום הזה. הסרת גישה חלה מיד.</p>
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
    </Card>
  );
}

/** Owner only. Refused by the server while guests still expect the venue (upcoming bookings, waitlist). */
function DeleteVenue({ venueId, name }: { venueId: string; name: string }) {
  const toast = useToast();
  const navigate = useNavigate();
  return (
    <section className="mt-6 rounded-2xl border border-red-200/80 bg-red-50/40 p-5">
      <h2 className="flex items-center gap-2 font-semibold text-red-900"><Trash2 className="h-5 w-5" aria-hidden /> מחיקת המקום</h2>
      <p className="mt-1 text-sm text-ink-muted [text-wrap:pretty]">
        המקום, המפה, התפריטים ודפי ההזמנה יוסרו, והקישורים יפסיקו לעבוד. אפשר למחוק רק כשאין הזמנות עתידיות ואין אורחים ברשימת ההמתנה.
        רוצים רק לעצור הזמנות? אפשר להשהות למעלה.
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
    </section>
  );
}
