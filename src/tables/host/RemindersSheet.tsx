/**
 * "Reminders": the staff go through tomorrow's (or today's) bookings and send each guest a ready
 * reminder from the venue's own WhatsApp. Free: nothing is sent by Formangle, the staff press Send in
 * WhatsApp. Each send is marked on the server, so the whole team sees who was already reminded.
 */
import { BellRing, Check, MessageCircle, Undo2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { markReminded, reminderList, type ReminderDay, type ReminderRow } from '../data/client';
import type { TablesError } from '../domain/errors';
import { whatsappHref } from '../domain/phone';
import { reminderText } from '../domain/reminders';
import { addDays, formatDate, timeInTz } from '../domain/time';
import { Ltr, Segmented } from '../ui';
import { Sheet } from './Sheet';

type Day = 'tomorrow' | 'today';

export function RemindersSheet({ venueId, today, canAct, onClose, load = reminderList, mark = markReminded }: {
  venueId: string; today: string; canAct: boolean; onClose: () => void;
  /** Injectable for tests. */
  load?: typeof reminderList; mark?: typeof markReminded;
}) {
  const [day, setDay] = useState<Day>('tomorrow');
  const date = day === 'today' ? today : addDays(today, 1);
  const [data, setData] = useState<ReminderDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try { setData(await load(venueId, date)); } catch (e) { setError((e as TablesError).message || 'משהו השתבש. נסו שוב.'); }
  }, [load, venueId, date]);
  useEffect(() => { setData(null); void refresh(); }, [refresh]);

  const setRow = (id: string, patch: Partial<ReminderRow>) =>
    setData((d) => (d ? { ...d, reservations: d.reservations.map((r) => (r.id === id ? { ...r, ...patch } : r)) } : d));

  // WhatsApp opens from the link itself (a real link: it works on phones and blocks no pop-up);
  // the mark is saved alongside and undone if the server refuses.
  const sent = async (r: ReminderRow, on: boolean) => {
    setRowError(null);
    const before = { remindedAt: r.remindedAt, remindedVia: r.remindedVia };
    setRow(r.id, on ? { remindedAt: new Date().toISOString(), remindedVia: 'whatsapp' } : { remindedAt: null, remindedVia: null });
    try {
      const res = await mark(r.id, on);
      setRow(r.id, { remindedAt: res.remindedAt, remindedVia: res.remindedAt ? 'whatsapp' : null });
    } catch (e) {
      setRow(r.id, before);
      setRowError((e as TablesError).message || 'משהו השתבש. נסו שוב.');
    }
  };

  const rows = data?.reservations ?? [];
  const done = rows.filter((r) => r.remindedAt).length;
  const tz = data?.venue.timezone ?? 'Asia/Jerusalem';

  return (
    <Sheet title="תזכורות לאורחים" onClose={onClose}
      subtitle={data ? `${formatDate(date, 'he', false)} · ${rows.length ? `${done} מתוך ${rows.length} קיבלו תזכורת` : 'אין הזמנות פתוחות'}` : formatDate(date, 'he', false)}>
      <div className="grid gap-3">
        <div className="flex"><Segmented label="יום" value={day} onChange={setDay} options={[{ value: 'tomorrow', label: 'מחר' }, { value: 'today', label: 'היום' }]} /></div>
        <p className="hs-muted text-sm">
          כל כפתור פותח וואטסאפ עם הודעה מוכנה לאורח. ההודעה יוצאת רק כשלוחצים &quot;שליחה&quot; בוואטסאפ, מהמספר של המקום.
        </p>
        {rowError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{rowError}</p>}
        {error ? (
          <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
            {error} <button type="button" onClick={() => void refresh()} className="ms-1 font-semibold underline">ניסיון נוסף</button>
          </div>
        ) : !data ? (
          <p className="hs-muted py-6 text-center text-sm" role="status">טוען…</p>
        ) : rows.length === 0 ? (
          <div className="hs-empty py-8">
            <BellRing className="h-8 w-8" aria-hidden />
            <p className="mt-2 font-semibold text-[var(--hs-ink)]">אין הזמנות פתוחות {day === 'today' ? 'להיום' : 'למחר'}</p>
          </div>
        ) : (
          <ul className="grid gap-2" aria-label="הזמנות לתזכורת">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--hs-line)] bg-[var(--hs-surface)] px-3 py-2.5">
                <Ltr className="w-12 shrink-0 text-base font-semibold tabular-nums">{r.time}</Ltr>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[var(--hs-ink)]">{r.guestName}</p>
                  <p className="hs-muted text-xs">
                    {r.party === 1 ? 'סועד אחד' : `${r.party} סועדים`}
                    {r.status === 'pending_approval' && <> · <span className="font-medium text-amber-800">ממתינה לאישור</span></>}
                  </p>
                  {r.remindedAt && (
                    <p className="whitespace-nowrap text-xs font-medium text-[var(--hs-seated)]">
                      <Check className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> {r.remindedVia === 'push' ? 'התראה נשלחה' : 'נשלחה'} ב־<Ltr>{timeInTz(r.remindedAt, tz)}</Ltr>
                    </p>
                  )}
                </div>
                {!r.guestPhone ? (
                  <span className="hs-muted text-xs">אין טלפון</span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {r.remindedAt && canAct && (
                      <button type="button" onClick={() => void sent(r, false)} aria-label={`ביטול הסימון של ${r.guestName}`}
                        className="hs-contact h-11 w-11 px-0"><Undo2 className="h-4 w-4" aria-hidden /></button>
                    )}
                    <a href={whatsappHref(r.guestPhone, reminderText(r, data.venue.name, date, day))} target="_blank" rel="noopener noreferrer"
                      onClick={() => { if (canAct) void sent(r, true); }}
                      aria-label={`${r.remindedAt ? 'שליחה שוב' : 'תזכורת בוואטסאפ'} ל${r.guestName}`}
                      className={r.remindedAt ? 'hs-contact px-3' : 'hs-contact border-[var(--hs-accent)] bg-[var(--hs-accent)] px-3 font-semibold text-[var(--hs-on-accent)] hover:bg-[var(--hs-accent)] hover:opacity-90'}>
                      <MessageCircle className="h-4 w-4" aria-hidden /> {r.remindedAt ? 'שוב' : 'תזכורת'}
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Sheet>
  );
}
