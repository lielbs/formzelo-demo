import { BookOpen, Copy, ExternalLink, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../../components/Toast';
import { Button, EmptyState, ErrorState, FieldLabel, Input, Spinner } from '../../components/ui';
import { createMenu, getVenue, listMenus, saveMenu, soldOutToday } from '../data/client';
import type { TablesError } from '../domain/errors';
import { cloneWithNewIds } from '../domain/menuEdit';
import { useLoad } from '../ui';
import { MenuEditor } from './MenuEditor';
import { bookingUrl } from './VenueOverview';

export function MenusPage() {
  const { venueId = '' } = useParams();
  const toast = useToast();
  const venue = useLoad(() => getVenue(venueId), [venueId], 'venue');
  const menus = useLoad(() => listMenus(venueId), [venueId], 'menus');
  const sold = useLoad(() => soldOutToday(venueId).catch(() => ({} as Record<string, string[]>)), [venueId], 'menu-sold-out');
  const [soldLocal, setSoldLocal] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  if (venue.error || menus.error) return <ErrorState error={(venue.error ?? menus.error)!} onRetry={() => { void venue.reload(); void menus.reload(); }} />;
  if (!venue.data || !menus.data) return <Spinner />;
  const current = menus.data.find((m) => m.id === selected) ?? menus.data[0] ?? null;
  return (
    <div className="mx-auto max-w-6xl">
      <Link to={`/app/tables/${venueId}`} className="text-sm text-ink-muted hover:text-ink">← {venue.data.name}</Link>
      <div className="mb-5 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">תפריטים</h1>
          <p className="text-sm text-ink-muted">תפריט לעיון בלבד — אורחים לא מזמינים ולא משלמים דרכו.</p>
        </div>
        {venue.data.published && (
          <a href={`${bookingUrl(venue.data.slug)}/menu`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-1.5 text-sm font-medium text-orange-800 hover:underline">
            <ExternalLink className="h-4 w-4" aria-hidden /> צפייה כמו אורח
          </a>
        )}
      </div>
      {menus.data.length === 0 ? (
        <EmptyState icon={BookOpen} title="עוד אין תפריט">
          צרו תפריט: קטגוריות, מנות, מחיר לתצוגה, סימון טבעוני/ללא גלוטן ואלרגנים — ואם תרצו גם תמונות.
        </EmptyState>
      ) : (
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="בחירת תפריט">
          {menus.data.map((m) => (
            <button key={m.id} type="button" aria-pressed={m.id === current?.id} onClick={() => setSelected(m.id)}
              className={`h-11 rounded-xl border px-4 text-sm font-medium ${m.id === current?.id ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white'}`}>
              {m.title} {m.status === 'published' ? '· פורסם' : '· טיוטה'}
            </button>
          ))}
        </div>
      )}
      <form className="mb-6 mt-4 flex flex-wrap items-end gap-2" onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        try { const r = await createMenu(venueId, title.trim()); setTitle(''); await menus.reload(); setSelected(r.id); } catch (err) { toast((err as TablesError).message, 'error'); }
      }}>
        <div className="min-w-[14rem] flex-1 sm:max-w-xs">
          <FieldLabel htmlFor="new-menu">תפריט חדש</FieldLabel>
          <Input id="new-menu" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: תפריט ערב" />
        </div>
        <Button type="submit" variant="secondary" icon={Plus} className="h-11" disabled={!title.trim()}>יצירה</Button>
      </form>
      {current && (
        <div className="-mt-3 mb-4">
          <Button size="sm" variant="ghost" icon={Copy} className="h-10" onClick={async () => {
            // "Lunch from dinner": a copy of the current menu as a new draft (fresh item ids).
            try {
              const copyTitle = `${current.title} (עותק)`.slice(0, 80);
              const r = await createMenu(venueId, copyTitle);
              await saveMenu(r.id, copyTitle, cloneWithNewIds(current.draft), 0);
              await menus.reload();
              setSelected(r.id);
              toast('נוצר עותק של התפריט כטיוטה', 'success');
            } catch (err) { toast((err as TablesError).message, 'error'); }
          }}>שכפול התפריט</Button>
        </div>
      )}
      {current && <MenuEditor key={current.id} menu={current} orgId={venue.data.organizationId}
        soldOut={soldLocal[current.id] ?? sold.data?.[current.id] ?? []} onSoldOut={(ids) => setSoldLocal((m) => ({ ...m, [current.id]: ids }))}
        onSaved={menus.reload} />}
    </div>
  );
}
