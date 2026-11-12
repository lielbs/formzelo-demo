import { Info } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, ErrorState, Spinner } from '../../components/ui';
import { analytics, getVenue } from '../data/client';
import { DEFINITIONS_HE, percent, summarize, type Rate } from '../domain/analytics';
import { addDays, dateInTz } from '../domain/time';
import { Segmented, useLoad } from '../ui';

const SOURCE_HE: Record<string, string> = { online: 'באתר', phone: 'טלפון', walk_in: 'מזדמנים', staff: 'צוות', waitlist: 'רשימת המתנה' };

function Tile({ label, value, def, sample }: { label: string; value: string; def: string; sample?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-ink-muted">{label}</p>
      {/* "Not enough data" reads as a quiet note, never louder than a real number. */}
      {value === NO_DATA
        ? <p className="mt-2 flex min-h-[2rem] items-center text-sm font-medium text-ink-muted">{value}</p>
        : <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>}
      {sample && <p className="text-xs text-ink-muted">{sample}</p>}
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
  const venue = useLoad(() => getVenue(venueId), [venueId]);
  const [range, setRange] = useState<'7' | '30' | '90'>('30');
  const tz = venue.data?.timezone ?? 'Asia/Jerusalem';
  const to = dateInTz(new Date(), tz);
  const from = addDays(to, -(Number(range) - 1));
  const data = useLoad(() => analytics(venueId, from, to), [venueId, from, to]);
  const sum = useMemo(() => (data.data ? summarize(data.data) : null), [data.data]);
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
            <Tile label="הזמנות" value={String(sum.reservations)} def={DEFINITIONS_HE.reservations} sample={`${sum.coversBooked} סועדים הוזמנו`} />
            <Tile label="סועדים שהושבו" value={String(sum.coversServed)} def={DEFINITIONS_HE.coversServed} />
            <Tile label="ביטולים" value={pct(sum.cancellationRate)} def={DEFINITIONS_HE.cancellationRate} sample={`${sum.cancellationRate.numerator} מתוך ${sum.cancellationRate.denominator}`} />
            <Tile label="לא הגיעו" value={pct(sum.noShowRate)} def={DEFINITIONS_HE.noShowRate} sample={`${sum.noShowRate.numerator} מתוך ${sum.noShowRate.denominator}`} />
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
            <div className="mt-3 h-64" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.data.days.map((d) => ({ date: d.date.slice(5), הוזמנו: d.coversBooked, הושבו: d.coversServed }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EAEE" />
                  <XAxis dataKey="date" reversed tick={{ fontSize: 11 }} />
                  <YAxis orientation="right" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend verticalAlign="top" height={28} iconType="square" />
                  <Bar dataKey="הוזמנו" fill="#94A3B8" />
                  <Bar dataKey="הושבו" fill="#2F7263" />
                </BarChart>
              </ResponsiveContainer>
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
        </div>
      )}
    </div>
  );
}
