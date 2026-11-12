import { ArrowLeft, CalendarCheck, LayoutGrid, Lock, Plus, Store, UtensilsCrossed } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, ErrorState, FieldLabel, Input, PageHeader, Spinner } from '../../components/ui';
import { useActiveOrg } from '../../data/store';
import { BASE_PATH } from '../../lib/links';
import { createVenue, listVenues } from '../data/client';
import { newDraft } from '../domain/draft';
import { saveDraft } from '../data/client';
import type { TablesError } from '../domain/errors';
import type { VenueSummary } from '../domain/types';
import { Ltr, useLoad } from '../ui';

const ROLE_HE: Record<string, string> = { owner: 'בעלים', manager: 'מנהל/ת', host: 'מארח/ת', viewer: 'צפייה' };

/** Latin web address from a name; Hebrew-only names get a short random address. */
export function suggestSlug(name: string): string {
  const latin = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return latin.length >= 3 ? latin : `table-${Math.random().toString(36).slice(2, 7)}`;
}

function VenueCard({ v }: { v: VenueSummary }) {
  const status = v.status === 'published' ? { tone: 'teal' as const, text: 'מקבל הזמנות' } : v.status === 'paused' ? { tone: 'amber' as const, text: 'הזמנות מושהות' } : { tone: 'neutral' as const, text: 'בהקמה' };
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words text-lg font-semibold leading-snug text-ink">{v.name}</h2>
          <p className="mt-0.5 text-xs text-ink-muted">התפקיד שלך: {ROLE_HE[v.role] ?? v.role}</p>
        </div>
        <Badge tone={status.tone}>{status.text}</Badge>
      </div>
      <div className="mt-auto flex flex-wrap gap-2">
        {v.published && (
          <Link to={`/app/tables/${v.id}/live`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-midnight px-4 text-sm font-medium text-white hover:bg-midnight-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2">
            <CalendarCheck className="h-4 w-4" aria-hidden /> משמרת חיה
          </Link>
        )}
        {(v.role === 'owner' || v.role === 'manager') && (
          <Link to={v.published ? `/app/tables/${v.id}` : `/app/tables/${v.id}/setup`} className="inline-flex h-11 items-center gap-2 rounded-xl border border-cloud-300 bg-white px-4 text-sm font-medium text-ink hover:bg-cloud focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2">
            {v.published ? <><LayoutGrid className="h-4 w-4" aria-hidden /> ניהול המקום</> : <><ArrowLeft className="h-4 w-4 rtl:rotate-0" aria-hidden /> המשך הקמה</>}
          </Link>
        )}
      </div>
    </Card>
  );
}

export function TablesHome() {
  const org = useActiveOrg();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useLoad(() => listVenues(org.id), [org.id]);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [editSlug, setEditSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const effectiveSlug = slug || (name.trim() ? suggestSlug(name) : '');

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setFormError('כתבו את שם המקום.'); return; }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(effectiveSlug) || effectiveSlug.length < 3) { setFormError('הכתובת יכולה להכיל אותיות באנגלית, מספרים ומקפים בלבד (לפחות 3 תווים).'); return; }
    setBusy(true);
    setFormError(null);
    try {
      const created = await createVenue(org.id, name.trim(), effectiveSlug);
      await saveDraft(created.id, newDraft(name.trim()), created.lockVersion);
      navigate(`/app/tables/${created.id}/setup`);
    } catch (err) {
      const te = err as TablesError;
      setFormError(/taken|23505/.test(`${te.message}${te.sqlState}`) || te.sqlState === '23505' ? 'הכתובת הזו כבר תפוסה. בחרו כתובת אחרת.' : te.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <Spinner label="טוען את המקומות שלכם…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  if (!data.enabled) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="שולחנות" description="הזמנות שולחנות, מפת המסעדה, רשימת המתנה וניהול משמרת — במקום אחד." />
        <EmptyState icon={Lock} title="מודול השולחנות עוד לא פעיל בעסק שלכם">
          ההפעלה נעשית על ידי צוות RockStack. פנו אלינו ונפעיל אותו עבורכם — בלי עלות נוספת בתקופת הפיילוט.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="שולחנות" description="כל מקום (סניף) מקבל מפת שולחנות, שעות פתיחה ועמוד הזמנות משלו." />
      {data.venues.length === 0 && !data.canCreate && (
        <EmptyState icon={UtensilsCrossed} title="עוד לא שובצתם לאף מקום">בעלי העסק יכולים לצרף אתכם למקום מתוך מסך הניהול שלו.</EmptyState>
      )}
      {data.venues.length > 0 && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          {data.venues.map((v) => <VenueCard key={v.id} v={v} />)}
        </div>
      )}
      {data.canCreate && (
        <Card as="section" className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-800"><Store className="h-5 w-5" aria-hidden /></span>
            <div>
              <h2 className="text-lg font-semibold text-ink">{data.venues.length ? 'הוספת מקום נוסף' : 'בואו נקים את המקום הראשון'}</h2>
              <p className="text-sm text-ink-muted">ההקמה לוקחת כ-15 דקות ונשמרת אוטומטית. אפשר לעצור ולהמשיך מכל מכשיר.</p>
            </div>
          </div>
          <form onSubmit={onCreate} className="mt-5 grid gap-4 sm:max-w-lg" noValidate>
            <div>
              <FieldLabel htmlFor="venue-name" required>שם המקום</FieldLabel>
              <Input id="venue-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="למשל: ביסטרו הנמל" autoComplete="organization" />
            </div>
            <div>
              <p className="text-sm text-ink-muted">
                הקישור שהאורחים יקבלו להזמנה:
                <Ltr className="block break-all text-end font-medium text-ink">{window.location.host}{BASE_PATH}/t/{effectiveSlug || '…'}</Ltr>
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">הכתובת נקבעת עכשיו ולא משתנה אחר כך, כדי שקישורים שכבר שיתפתם ימשיכו לעבוד.</p>
              {!editSlug ? (
                <button type="button" className="mt-1 min-h-[44px] text-sm font-medium text-orange-800 underline-offset-2 hover:underline" onClick={() => { setEditSlug(true); setSlug(effectiveSlug); }}>
                  שינוי הכתובת
                </button>
              ) : (
                <div className="mt-2">
                  <FieldLabel htmlFor="venue-slug">כתובת הקישור (אותיות באנגלית, מספרים ומקפים)</FieldLabel>
                  <Input id="venue-slug" dir="ltr" value={slug} maxLength={60} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} />
                </div>
              )}
            </div>
            {formError && <p role="alert" className="text-sm text-red-700">{formError}</p>}
            <div>
              <Button type="submit" size="lg" icon={Plus} loading={busy}>יצירת המקום והתחלת ההקמה</Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
