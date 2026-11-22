import { Info } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { GroupedBars, HeatGrid } from '../../components/charts/Bars';
import { Card, ErrorState, Spinner } from '../../components/ui';
import { analytics, analyticsMore, getVenue } from '../data/client';
import { DEFINITIONS_HE, percent, summarize, type Rate } from '../domain/analytics';
import { addDays, dateInTz } from '../domain/time';
import { Segmented, useLoad } from '../ui';

const SOURCE_HE: Record<string, string> = { online: 'באתר', phone: 'טלפון', walk_in: 'מזדמנים', staff: 'צוות', waitlist: 'רשימת המתנה' };

/** Change against the previous period of the same length ("▲ 12%"); lower is better for some. */
function Delta({ now, before, lowerIsBetter = false, points = false }: { now: number | null; before: number | null; lowerIsBetter?: boolean; points?: boolean }) {
  if (now == null || before == null || (before === 0 && !points)) return null;
  const diff = points ? Math.round((now - before) * 10) / 10 : Math.round(((now - before) / before) * 100);
  if (!diff) return <p className="text-xs text-ink-muted">כמו בתקופה הקודמת</p>;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  return <p className={`text-xs font-medium ${good ? 'text-teal-700' : 'text-red-700'}`}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff)}{points ? ' נק׳' : '%'} מהתקופה הקודמת</p>;
}

function Tile({ label, value, def, sample, delta }: { label: string; value: string; def: string; sample?: string; delta?: ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      {/* "Not enough data" reads as a quiet note, never louder than a real number. */}
      {value === NO_DATA
        ? <p className="mt-2 flex min-h-[2rem] items-center text-sm font-medium text-ink-muted">{value}</p>
        : <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>}
      {sample && <p className="text-xs text-ink-muted">{sample}</p>}
      {delta}
      <details className="mt-2 text-xs text-ink-muted">
        <summary className="inline-flex cursor-pointer items-center gap-1"><Info className="h-3.5 w-3.5" aria-hidden /> איך מחושב</summary>
        <p className="mt-1">{def}</p>
      </details>
    </Card>
  );
}

const NO_DATA = 'אין מספיק נתונים';
const pct = (r: Rate) => (percent(r) == null ? NO_DATA : `${percent(r)}%`);

export function AnalyticsPage() {
  const { venueId = '' } = useParams();
  const venue = useLoad(() => getVenue(venueId), [venueId], 'venue');
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const tz = venue.data?.timezone ?? 'Asia/Jerusalem';
  const to = dateInTz(new Date(), tz);
  const from = addDays(to, -(Number(range) - 1));
  const data = useLoad(() => analytics(venueId, from, to), [venueId, from, to]);
  const sum = useMemo(() => (data.data ? summarize(data.data) : null), [data.data]);
  // The same length just before, for "▲ 12%" on each figure (UX audit A12.2).
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(Number(range) - 1));
  const prev = useLoad(() => analytics(venueId, prevFrom, prevTo).catch(() => null), [venueId, prevFrom, prevTo]);
  const before = useMemo(() => (prev.data ? summarize(prev.data) : null), [prev.data]);
  const more = useLoad(() => analyticsMore(venueId, from, to).catch(() => null), [venueId, from, to]);
  if (venue.error) return <ErrorState error={venue.error} onRetry={venue.reload} />;
  if (data.error) return <ErrorState error={data.error} onRetry={data.reload} />;
  return (
    <div className="mx-auto max-w-5xl">
      <Link to={`/app/tables/${venueId}`} className="text-sm text-ink-muted hover:text-ink">← {venue.data?.name ?? ''}</Link>
      <div className="mb-5 mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">נתונים</h1>
          <p className="text-sm text-ink-muted">לפי תאריך המשמרת ושעון המקום. בלי הכנסות — המערכת לא מחוברת לקופה.</p>
        </div>
        <Segmented label="טווח" value={range} onChange={setRange} options={[{ value: '7', label: '7 ימים' }, { value: '30', label: '30 ימים' }, { value: '90', label: '90 ימים' }]} />
      </div>
      {!sum || !data.data ? <Spinner /> : (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="הזמנות" value={String(sum.reservations)} def={DEFINITIONS_HE.reservations} sample={`${sum.coversBooked} סועדים הוזמנו`} delta={<Delta now={sum.reservations} before={before?.reservations ?? null} />} />
            <Tile label="סועדים שהושבו" value={String(sum.coversServed)} def={DEFINITIONS_HE.coversServed} delta={<Delta now={sum.coversServed} before={before?.coversServed ?? null} />} />
            <Tile label="ביטולים" value={pct(sum.cancellationRate)} def={DEFINITIONS_HE.cancellationRate} sample={`${sum.cancellationRate.numerator} מתוך ${sum.cancellationRate.denominator}`} delta={<Delta now={percent(sum.cancellationRate)} before={before ? percent(before.cancellationRate) : null} lowerIsBetter points />} />
            <Tile label="לא הגיעו" value={pct(sum.noShowRate)} def={DEFINITIONS_HE.noShowRate} sample={`${sum.noShowRate.numerator} מתוך ${sum.noShowRate.denominator}`} delta={<Delta now={percent(sum.noShowRate)} before={before ? percent(before.noShowRate) : null} lowerIsBetter points />} />
            <Tile label="ניצול מקומות ישיבה" value={pct(sum.seatUtilization)} def={DEFINITIONS_HE.seatUtilization} />
            <Tile label="המרה מרשימת המתנה" value={pct(sum.waitlistConversion)} def={DEFINITIONS_HE.waitlistConversion} sample={`${sum.waitlistConversion.numerator} מתוך ${sum.waitlistConversion.denominator}`} />
            <Tile label="זמן ישיבה ממוצע" value={sum.avgSeated.avgMinutes == null ? NO_DATA : `${sum.avgSeated.avgMinutes} דק׳`} def={DEFINITIONS_HE.avgSeated} sample={`מתוך ${sum.avgSeated.sample} ביקורים`} />
            <Card className="p-4">
              <p className="text-sm text-ink-muted">מקור ההזמנות</p>
              <ul className="mt-1 text-sm">
                {Object.entries(data.data.sources).length === 0 ? <li className="text-ink-muted">אין עדיין</li> : Object.entries(data.data.sources).map(([k, v]) => <li key={k} className="flex justify-between"><span>{SOURCE_HE[k] ?? k}</span><span className="tabular-nums">{v}</span></li>)}
              </ul>
            </Card>
          </div>
          <Card as="section" className="p-4">
            <h2 className="font-semibold">סועדים לפי יום</h2>
            <div className="mt-3">
              <GroupedBars height={256} data={data.data.days.map((d) => ({ date: `${d.date.slice(8)}.${d.date.slice(5, 7)}`, booked: d.coversBooked, served: d.coversServed }))}
                labelOf={(r) => String(r.date)} series={[{ key: 'booked', label: 'הוזמנו', color: '#94A3B8' }, { key: 'served', label: 'הושבו', color: '#2F7263' }]} />
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium">הנתונים כטבלה</summary>
              <div className="mt-2 max-h-72 overflow-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">סועדים, ביטולים ואי-הגעות לפי תאריך</caption>
                  <thead><tr className="text-start text-ink-muted"><th scope="col" className="py-1 text-start">תאריך</th><th scope="col" className="text-start">הזמנות</th><th scope="col" className="text-start">סועדים שהושבו</th><th scope="col" className="text-start">ביטולים</th><th scope="col" className="text-start">לא הגיעו</th></tr></thead>
                  <tbody>{data.data.days.map((d) => <tr key={d.date} className="border-t border-cloud-200"><th scope="row" className="py-1 text-start font-normal"><bdi dir="ltr">{d.date}</bdi></th><td className="tabular-nums">{d.reservations}</td><td className="tabular-nums">{d.coversServed}</td><td className="tabular-nums">{d.cancelled}</td><td className="tabular-nums">{d.noShows}</td></tr>)}</tbody>
                </table>
              </div>
            </details>
          </Card>
          {/* When the venue is busy (UX audit A12.1): covers by weekday and booked hour. */}
          {more.data && more.data.heat.length > 0 && (
            <Card as="section" className="p-4">
              <h2 className="font-semibold">שעות עומס</h2>
              <p className="mt-0.5 text-sm text-ink-muted">סועדים לפי יום בשבוע ושעת ההזמנה, בטווח שנבחר.</p>
              <div className="mt-3">
                <HeatGrid valueLabel="סועדים" days={['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']}
                  hours={[...new Set(more.data.heat.map((h) => h.hour))].sort((a, b) => a - b)}
                  cells={more.data.heat.map((h) => ({ dow: h.dow, hour: h.hour, value: h.covers }))} />
              </div>
            </Card>
          )}
          {/* Who comes back, and who repeatedly does not (managers and owners only). */}
          {more.data?.regulars && (more.data.regulars.length > 0 || (more.data.noShows?.length ?? 0) > 0) && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Card as="section" className="p-4">
                <h2 className="font-semibold">אורחים קבועים</h2>
                {more.data.regulars.length ? (
                  <ul className="mt-2 grid gap-1 text-sm">{more.data.regulars.map((g) => <li key={g.name + g.last} className="flex justify-between gap-3"><span className="truncate">{g.name}</span><span className="shrink-0 tabular-nums text-ink-muted">{g.visits} ביקורים · אחרון <bdi dir="ltr">{g.last.slice(8)}.{g.last.slice(5, 7)}</bdi></span></li>)}</ul>
                ) : <p className="mt-2 text-sm text-ink-muted">עוד אין אורחים שחזרו בטווח הזה.</p>}
              </Card>
              <Card as="section" className="p-4">
                <h2 className="font-semibold">לא הגיעו יותר מפעם אחת</h2>
                {more.data.noShows?.length ? (
                  <ul className="mt-2 grid gap-1 text-sm">{more.data.noShows.map((g) => <li key={g.name + g.last} className="flex justify-between gap-3"><span className="truncate">{g.name}</span><span className="shrink-0 tabular-nums text-ink-muted">{g.count} פעמים</span></li>)}</ul>
                ) : <p className="mt-2 text-sm text-ink-muted">אין.</p>}
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
