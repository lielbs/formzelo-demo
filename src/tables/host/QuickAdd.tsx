import { ClipboardList, Footprints, PhoneCall } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, cx, FieldLabel, Input, Modal, Select } from '../../components/ui';
import { newKey, staffAvailability, staffCreate, waitlistAdd } from '../data/client';
import type { TablesError } from '../domain/errors';
import { normalizePhone } from '../domain/phone';
import type { Shift, ShiftReservation, TableLiveState } from '../domain/types';
import { Segmented } from '../ui';

export type QuickAddMode = 'phone' | 'walk_in' | 'waitlist';
type States = Map<string, { state: TableLiveState; current?: ShiftReservation; next?: ShiftReservation }>;

const REASON_HE: Record<string, string> = {
  no_table: 'אין שולחן', pacing_full: 'מלא בקצב', too_soon: 'עבר', closed: 'סגור', invalid_time: '—', party_size: 'גודל', too_far: 'רחוק',
};

/** One sheet for the three intake paths; all use the same server inventory. */
export function QuickAdd({ mode: initial, shift, states, onClose, onDone }: {
  mode: QuickAddMode; shift: Shift; states: States; onClose: () => void; onDone: (m: string) => void;
}) {
  const [mode, setMode] = useState<QuickAddMode>(initial);
  const [party, setParty] = useState(2);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [requests, setRequests] = useState('');
  const [time, setTime] = useState<{ serviceKey: string; time: string } | null>(null);
  const [tableId, setTableId] = useState<string>('auto');
  const [slots, setSlots] = useState<Awaited<ReturnType<typeof staffAvailability>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newKey());

  useEffect(() => { key.current = newKey(); setError(null); }, [mode, party, name, phone, time, tableId]);
  useEffect(() => {
    if (mode !== 'phone') return;
    let alive = true;
    setSlots(null);
    staffAvailability(shift.venue.id, shift.serviceDate, party).then((s) => alive && setSlots(s)).catch(() => alive && setSlots([]));
    return () => { alive = false; };
  }, [mode, party, shift.venue.id, shift.serviceDate]);

  const freeNow = shift.tables.filter((t) => states.get(t.id)?.state === 'ready' && t.maxCovers >= party);
  const phoneOk = !phone.trim() || normalizePhone(phone) != null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!phoneOk) { setError('מספר הטלפון לא נראה תקין.'); return; }
    if (mode === 'phone' && (!name.trim() || !time)) { setError(!name.trim() ? 'חסר שם.' : 'בחרו שעה.'); return; }
    setBusy(true);
    setError(null);
    try {
      if (mode === 'waitlist') {
        await waitlistAdd(shift.venue.id, { date: shift.serviceDate, name: name.trim() || 'אורחים', phone: phone.trim(), party, notes: requests.trim() }, key.current);
        onDone(`${name.trim() || 'אורחים'} נוספו לרשימת ההמתנה`);
      } else if (mode === 'walk_in') {
        const r = await staffCreate(shift.venue.id, { source: 'walk_in', date: shift.serviceDate, party, name: name.trim() || 'אורחים מזדמנים', phone: phone.trim(), seatNow: true, requests: requests.trim(),
          ...(tableId !== 'auto' ? { tableIds: [tableId] } : {}) }, key.current);
        const label = (r.tableIds ?? []).map((id) => shift.tables.find((t) => t.id === id)?.label).join('+');
        onDone(`הושבו בשולחן ${label}`);
      } else {
        await staffCreate(shift.venue.id, { source: 'phone', serviceKey: time!.serviceKey, date: shift.serviceDate, time: time!.time, party, name: name.trim(), phone: phone.trim(), requests: requests.trim() }, key.current);
        onDone(`הזמנה ל${name.trim()} ב-${time!.time} נשמרה`);
      }
    } catch (err) {
      setError((err as TablesError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="הוספה למשמרת">
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <Segmented label="סוג" value={mode} onChange={setMode} options={[
          { value: 'phone', label: 'הזמנה טלפונית', icon: PhoneCall },
          { value: 'walk_in', label: 'מזדמנים עכשיו', icon: Footprints },
          { value: 'waitlist', label: 'רשימת המתנה', icon: ClipboardList },
        ]} />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">כמה סועדים</legend>
          <div className="flex flex-wrap gap-1.5">
            {[1, 2, 3, 4, 5, 6, 7, 8, 10, 12].map((n) => (
              <button key={n} type="button" aria-pressed={party === n} onClick={() => setParty(n)}
                className={cx('h-11 min-w-11 rounded-xl border px-2 text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', party === n ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white')}>{n}</button>
            ))}
          </div>
        </fieldset>
        {mode === 'phone' && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">שעה (היום של המשמרת)</legend>
            {!slots ? <p className="text-sm text-ink-muted">בודק מה פנוי…</p> : slots.length === 0 ? <p className="text-sm text-ink-muted">אין משמרות ביום הזה.</p> : slots.map((s) => (
              <div key={s.key} className="mb-2">
                <p className="mb-1 text-xs text-ink-muted">{s.name}</p>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
                  {s.slots.map((sl) => {
                    const on = time?.time === sl.time && time.serviceKey === s.key;
                    return (
                      <button key={sl.time} type="button" disabled={!sl.ok} aria-pressed={on} onClick={() => setTime({ serviceKey: s.key, time: sl.time })}
                        title={sl.ok ? `שולחן ${sl.tables.join('+')}` : REASON_HE[sl.reason ?? ''] ?? ''}
                        className={cx('flex h-12 flex-col items-center justify-center rounded-xl border text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                          on ? 'border-midnight bg-midnight text-white' : sl.ok ? 'border-cloud-300 bg-white' : 'border-cloud-200 bg-cloud text-ink-soft line-through')}>
                        <span dir="ltr" className="font-semibold">{sl.time}</span>
                        {sl.ok ? <span className="text-[10px] leading-none opacity-80">שולחן {sl.tables.join('+')}</span> : <span className="text-[10px] leading-none no-underline">{REASON_HE[sl.reason ?? ''] ?? ''}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>
        )}
        {mode === 'walk_in' && (
          <div>
            <FieldLabel htmlFor="qa-table">שולחן</FieldLabel>
            <Select id="qa-table" value={tableId} onChange={(e) => setTableId(e.target.value)}>
              <option value="auto">השולחן המתאים ביותר שפנוי עכשיו</option>
              {freeNow.map((t) => <option key={t.id} value={t.id}>שולחן {t.label} ({t.maxCovers} מק׳)</option>)}
            </Select>
            {freeNow.length === 0 && <p className="mt-1 text-sm text-amber-800">אין כרגע שולחן פנוי בגודל הזה — אפשר להוסיף לרשימת ההמתנה.</p>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="qa-name" required={mode === 'phone'}>שם</FieldLabel>
            <Input id="qa-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div>
            <FieldLabel htmlFor="qa-phone">טלפון</FieldLabel>
            <Input id="qa-phone" type="tel" dir="ltr" inputMode="tel" value={phone} maxLength={24} invalid={!phoneOk} onChange={(e) => setPhone(e.target.value)} placeholder="050-1234567" autoComplete="off" />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="qa-req">{mode === 'waitlist' ? 'הערה' : 'בקשות'} (רשות)</FieldLabel>
          <Input id="qa-req" value={requests} maxLength={300} onChange={(e) => setRequests(e.target.value)} />
        </div>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="h-11">ביטול</Button>
          <Button type="submit" loading={busy} className="h-11">
            {mode === 'phone' ? 'שמירת ההזמנה' : mode === 'walk_in' ? 'הושבה עכשיו' : 'הוספה לרשימה'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
