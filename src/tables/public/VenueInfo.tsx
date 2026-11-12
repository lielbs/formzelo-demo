/** Venue facts shown around the guest pages: booking hours, location, contact. Real data only. */
import { Clock, MapPin, MessageCircle, Navigation, Phone, UtensilsCrossed, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cx } from '../../components/ui';
import { displayPhone, normalizePhone, whatsappHref } from '../domain/phone';
import { Ltr } from '../ui';
import { tx, type Lang } from './i18n';

export interface VenueService { key: string; name: string; weekdays: number[]; start: string; lastSeating: string }

/** Weekday (0 = Sunday) of a local YYYY-MM-DD date. */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** Booking hours of one weekday ("12:00–22:00"), or null when no service runs. */
export function hoursOn(services: VenueService[] | undefined, weekday: number): string | null {
  const list = (services ?? []).filter((s) => s.weekdays.includes(weekday));
  if (!list.length) return null;
  const start = list.map((s) => s.start).sort()[0]!;
  const ends = list.map((s) => s.lastSeating).sort();
  const end = ends[ends.length - 1]!;
  return `${start}–${end}`;
}

export const mapsHref = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

const dayName = (weekday: number, lang: Lang) =>
  new Intl.DateTimeFormat(lang === 'he' ? 'he-IL' : 'en-GB', { timeZone: 'UTC', weekday: 'long' }).format(new Date(Date.UTC(2023, 0, 1 + weekday, 12)));

/** Week of booking hours, today first highlighted. */
export function HoursList({ services, today, lang }: { services: VenueService[]; today: string; lang: Lang }) {
  const s = tx(lang);
  const todayWd = weekdayOf(today);
  const week = [0, 1, 2, 3, 4, 5, 6].map((wd) => ({ wd, h: hoursOn(services, wd) }));
  const same = week.every((d) => d.h === week[0]!.h);
  const todayHours = week[todayWd]!.h;
  const rows = (
    <dl className="mt-2 grid gap-0.5 text-sm">
      {week.map(({ wd, h }) => (
        <div key={wd} className={cx('flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5', wd === todayWd && 'pp-today font-semibold')}>
          <dt>{dayName(wd, lang)}</dt>
          <dd className={cx('tabular-nums', !h && 'text-ink-muted')}>{h ? <Ltr>{h}</Ltr> : '—'}</dd>
        </div>
      ))}
    </dl>
  );
  return (
    <section aria-labelledby="hours-h">
      <h2 id="hours-h" className="flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-[var(--fz-accent)]" aria-hidden />{s.hoursTitle}</h2>
      {same ? (
        <p className="mt-2 flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-sm">
          <span>{lang === 'en' ? 'Every day' : 'כל ימות השבוע'}</span>
          <span className="font-semibold tabular-nums">{todayHours ? <Ltr>{todayHours}</Ltr> : '—'}</span>
        </p>
      ) : (
        <details className="group mt-2">
          <summary className="pp-today flex min-h-[40px] cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>{lang === 'en' ? 'Today' : 'היום'}</span>
            <span className="flex items-center gap-2 tabular-nums">{todayHours ? <Ltr>{todayHours}</Ltr> : (lang === 'en' ? 'Closed' : 'סגור')}
              <span aria-hidden className="text-xs font-medium text-ink-muted transition-transform group-open:rotate-180">▾</span></span>
          </summary>
          {rows}
        </details>
      )}
    </section>
  );
}

/** Side panel of the booking page: about, hours, location, contact and related pages. */
export function VenueAside({ lang, venue, today }: {
  lang: Lang;
  today: string;
  venue: { slug: string; intro?: string | null; address?: string | null; phone?: string | null; showWhatsapp?: boolean; services: VenueService[]; policy: { waitlistPublic: boolean; maxParty: number } };
}) {
  const s = tx(lang);
  const phone = venue.phone ? normalizePhone(venue.phone) : null;
  const q = lang === 'en' ? '?lang=en' : '';
  return (
    <div className="grid gap-4">
      {venue.services.length > 0 && (
        <div className="pp-card rounded-2xl border border-cloud-200 bg-white p-5"><HoursList services={venue.services} today={today} lang={lang} /></div>
      )}
      {(venue.address || phone) && (
        <div className="pp-card grid gap-3 rounded-2xl border border-cloud-200 bg-white p-5 text-sm">
          {venue.address && (
            <div className="flex items-start gap-2.5">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--fz-accent)]" aria-hidden />
              <div className="min-w-0">
                <p>{venue.address}</p>
                <a href={mapsHref(venue.address)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-[32px] items-center gap-1 font-medium text-[var(--fz-accent)] underline-offset-2 hover:underline">
                  <Navigation className="h-3.5 w-3.5" aria-hidden />{s.directions}
                </a>
              </div>
            </div>
          )}
          {phone && (
            <div className="flex flex-wrap gap-2">
              <a href={`tel:${phone}`} className="pp-soft-btn inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 font-medium">
                <Phone className="h-4 w-4" aria-hidden /><Ltr>{displayPhone(phone)}</Ltr>
              </a>
              {venue.showWhatsapp && (
                <a href={whatsappHref(phone)} target="_blank" rel="noopener noreferrer" className="pp-soft-btn inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 font-medium">
                  <MessageCircle className="h-4 w-4" aria-hidden />WhatsApp
                </a>
              )}
            </div>
          )}
        </div>
      )}
      <nav aria-label={lang === 'he' ? 'עוד באתר' : 'More'} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
        <Link to={`/t/${venue.slug}/menu${q}`} className="pp-card group flex min-h-[56px] items-center gap-3 rounded-2xl border border-cloud-200 bg-white px-4 font-medium">
          <span className="pp-icon-chip flex h-9 w-9 items-center justify-center rounded-full"><UtensilsCrossed className="h-4 w-4" aria-hidden /></span>{s.viewMenu}
        </Link>
        {venue.policy.waitlistPublic && (
          <Link to={`/t/${venue.slug}/waitlist${q}`} className="pp-card group flex min-h-[56px] items-center gap-3 rounded-2xl border border-cloud-200 bg-white px-4 font-medium">
            <span className="pp-icon-chip flex h-9 w-9 items-center justify-center rounded-full"><Users className="h-4 w-4" aria-hidden /></span>{s.joinWaitlist}
          </Link>
        )}
      </nav>
    </div>
  );
}

/** An .ics calendar entry for a booking (generated in the browser; nothing is sent). */
export function calendarFile({ title, startsAt, minutes, location, details }: { title: string; startsAt: string; minutes: number; location?: string | null; details?: string }): string {
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (v: string) => v.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + minutes * 60_000);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Formangle//Tables//EN', 'BEGIN:VEVENT',
    `UID:${stamp(start)}-${Math.random().toString(36).slice(2)}@formangle`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(title)}`,
    ...(location ? [`LOCATION:${esc(location)}`] : []), ...(details ? [`DESCRIPTION:${esc(details)}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
