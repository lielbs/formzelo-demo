/** Venue facts shown around the guest pages: booking hours, location, contact. Real data only. */
import { CalendarDays, CalendarPlus, Clock, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cx } from '../../components/ui';
import { publicBaseUrl } from '../../lib/links';
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

/**
 * Side panel of the booking page: the week's hours and the waitlist. Address, directions, call,
 * WhatsApp and the menu are already the hero's quick actions, so they are not repeated here.
 */
export function VenueAside({ lang, venue, today }: {
  lang: Lang;
  today: string;
  venue: { slug: string; intro?: string | null; address?: string | null; phone?: string | null; showWhatsapp?: boolean; services: VenueService[]; policy: { waitlistPublic: boolean; maxParty: number } };
}) {
  const s = tx(lang);
  const q = lang === 'en' ? '?lang=en' : '';
  return (
    <div className="grid gap-4">
      {venue.services.length > 0 && (
        <div className="pp-card rounded-2xl border border-cloud-200 bg-white p-5"><HoursList services={venue.services} today={today} lang={lang} /></div>
      )}
      <nav aria-label={lang === 'he' ? 'עוד באתר' : 'More'} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
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
/** The guest's private manage link (the token stays in the fragment: never sent to a server). */
export const manageUrl = (token: string, lang: Lang) => `${publicBaseUrl()}/t/r${lang === 'en' ? '?lang=en' : ''}#t=${token}`;

export interface CalendarEvent {
  title: string;
  startsAt: string;
  minutes: number;
  location?: string | null;
  /** Shown in every calendar (the booking code). */
  details?: string;
  /** The guest's private manage link: written only into the downloaded file, never sent to a calendar service. */
  privateUrl?: string;
  /** Words before the private link in the file ("To change or cancel:"). */
  privateLabel?: string;
  /** Stable id (the booking code), so adding the booking again after a change updates the same event. */
  uid?: string;
  /** Reminders, in minutes before the start. */
  alarms?: number[];
}

/** The reminders the downloaded calendar file sets: a day before and three hours before. */
export const REMINDER_ALARMS = [24 * 60, 3 * 60];

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const trigger = (m: number) => (m % 1440 === 0 ? `-P${m / 1440}D` : m % 60 === 0 ? `-PT${m / 60}H` : `-PT${m}M`);

/** RFC 5545 line folding: at most 75 bytes per line, continued with a leading space (never inside a character). */
function fold(line: string): string[] {
  const enc = new TextEncoder();
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75;
    if (bytes + n > limit) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.map((l, i) => (i ? ` ${l}` : l));
}

export function calendarFile({ title, startsAt, minutes, location, details, privateUrl, privateLabel, uid, alarms = [] }: CalendarEvent): string {
  const esc = (v: string) => v.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\r?\n/g, '\\n');
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + minutes * 60_000);
  const description = [details, privateUrl && [privateLabel, privateUrl].filter(Boolean).join(' ')].filter(Boolean).join('\n');
  const id = uid && /^[A-Za-z0-9-]{1,40}$/.test(uid) ? `${uid}@formangle.rockstackds.com` : `${stamp(start)}-${Math.random().toString(36).slice(2)}@formangle`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Formangle//Tables//EN', 'BEGIN:VEVENT',
    `UID:${id}`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(title)}`,
    ...(location ? [`LOCATION:${esc(location)}`] : []), ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    ...(privateUrl ? [`URL:${privateUrl}`] : []),
    ...alarms.filter((m) => Number.isInteger(m) && m > 0).flatMap((m) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, `TRIGGER:${trigger(m)}`, 'END:VALARM']),
    'END:VEVENT', 'END:VCALENDAR',
  ].flatMap(fold).join('\r\n');
}

/** "Add to Google Calendar" link. Only the public details go in it: the private manage link stays out of the URL. */
export function googleCalendarHref({ title, startsAt, minutes, location, details }: CalendarEvent): string {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + minutes * 60_000);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${stamp(start)}/${stamp(end)}` });
  if (details) q.set('details', details);
  if (location) q.set('location', location);
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

function downloadCalendarFile(event: CalendarEvent, filename: string) {
  const url = URL.createObjectURL(new Blob([calendarFile(event)], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The guest's two calendar actions: a file with reminders (iPhone, Outlook, most Android calendars) and Google Calendar. */
export function CalendarButtons({ event, filename, lang, className }: { event: CalendarEvent; filename: string; lang: Lang; className: string }) {
  const s = tx(lang);
  return (
    <>
      <button type="button" className={className} onClick={() => downloadCalendarFile({ ...event, alarms: event.alarms ?? REMINDER_ALARMS }, filename)}>
        <CalendarPlus className="h-4 w-4" aria-hidden />{s.addToCalendar}
      </button>
      <a href={googleCalendarHref(event)} target="_blank" rel="noopener noreferrer" className={className}>
        <CalendarDays className="h-4 w-4" aria-hidden />{s.googleCalendar}
      </a>
    </>
  );
}
