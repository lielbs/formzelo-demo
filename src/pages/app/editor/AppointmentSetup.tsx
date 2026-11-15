/**
 * The questions an owner answers to take appointments: what kind of booking, which services and how
 * long each takes, which days and hours, how many at once, and how far ahead. Used on the creation
 * screen (right after "describe in words") and in the studio's "הזמנות ושעות" panel.
 * Every answer edits the workflow config directly; the form preview follows live.
 */
import { Plus, Trash2, X } from 'lucide-react';
import { cx, FieldLabel, Input, Select } from '../../../components/ui';
import type { Booking, Schedule, WorkflowConfig, WorkflowField } from '../../../domain/schema';
import { WEEKDAY_LABELS, withSchedule } from '../../../engine/booking';
import { minutesLabel, startsFor, weekHours } from '../../../engine/schedule';
import { field as makeField, option as makeOption } from '../../../engine/templates';

type Update = (fn: (d: WorkflowConfig) => void) => void;
type Unit = NonNullable<Booking['unit']>;

const LENGTHS = [10, 15, 20, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240];
const STEPS = [10, 15, 20, 30, 60];
const BUFFERS = [0, 5, 10, 15, 30];

const allFields = (d: WorkflowConfig) => d.steps.flatMap((s) => s.fields);
const stepOf = (d: WorkflowConfig, key: string) => d.steps.find((s) => s.fields.some((f) => f.key === key));

export const DEFAULT_SCHEDULE: Schedule = { days: weekHours([0, 1, 2, 3, 4], '09:00', '18:00'), step: 30, duration: 30 };

/** Turns the booking into appointments by hours (time), whole days or whole weeks. */
export function setBookingUnit(d: WorkflowConfig, unit: Unit) {
  const b = d.booking;
  if (!b) return;
  const date = allFields(d).find((f) => f.key === b.dateKey);
  if (unit === 'time') {
    let time = b.timeKey ? allFields(d).find((f) => f.key === b.timeKey) : undefined;
    if (!time) {
      time = makeField('booking_time', 'שעה פנויה', 'time', { required: true, helpText: 'מוצגות רק שעות שעדיין פנויות' });
      const host = stepOf(d, b.dateKey) ?? d.steps[0]!;
      host.fields.splice(date ? host.fields.indexOf(date) + 1 : host.fields.length, 0, time);
    }
    time.type = 'time';
    time.options = undefined;
    const service = allFields(d).find((f) => f.key === 'service' && (f.type === 'radio' || f.type === 'select'));
    const schedule = b.schedule ?? { ...DEFAULT_SCHEDULE, serviceKey: service?.key, durations: service ? Object.fromEntries((service.options ?? []).map((o) => [o.value, 30])) : undefined };
    d.booking = withSchedule({ ...b, timeKey: time.key, maxPerDay: b.unit === 'time' ? b.maxPerDay : undefined, capacityPerSlot: b.unit === 'time' ? b.capacityPerSlot : 1 }, schedule);
    if (date) date.helpText = undefined;
    return;
  }
  // Whole day / whole week: no time question; the capacity is per date.
  if (b.timeKey) for (const s of d.steps) s.fields = s.fields.filter((f) => f.key !== b.timeKey);
  const cap = b.unit === unit ? (b.maxPerDay ?? b.capacityPerSlot) : 1;
  d.booking = { ...b, unit, schedule: undefined, timeKey: undefined, slots: [], capacityPerSlot: cap, maxPerDay: cap, openWeekdays: unit === 'week' ? [0] : b.openWeekdays };
  if (date) date.helpText = unit === 'week' ? 'בחרו את יום ראשון שבו השבוע מתחיל' : undefined;
  if (date) date.label = unit === 'week' ? 'השבוע המבוקש' : date.label === 'השבוע המבוקש' ? 'תאריך' : date.label;
}

export function AppointmentSetup({ config, update, compact = false }: { config: WorkflowConfig; update: Update; compact?: boolean }) {
  const b = config.booking;
  if (!b?.enabled) return null;
  const unit: Unit = b.schedule ? 'time' : (b.unit ?? (b.timeKey ? 'time' : 'day'));
  const s = b.schedule;
  const service = s?.serviceKey ? allFields(config).find((f) => f.key === s.serviceKey) : undefined;

  const setSchedule = (fn: (s: Schedule) => void) =>
    update((d) => {
      if (!d.booking?.schedule) return;
      const next = structuredClone(d.booking.schedule);
      fn(next);
      d.booking = withSchedule(d.booking, next);
    });
  const setB = (patch: Partial<Booking>) => update((d) => void (d.booking && (d.booking = { ...d.booking, ...patch })));
  const setService = (fn: (f: WorkflowField, s: Schedule) => void) =>
    update((d) => {
      const f = d.booking?.schedule?.serviceKey ? allFields(d).find((x) => x.key === d.booking!.schedule!.serviceKey) : undefined;
      if (!f || !d.booking?.schedule) return;
      const next = structuredClone(d.booking.schedule);
      fn(f, next);
      d.booking = withSchedule(d.booking, next);
      if (f.options?.some((o) => o.price)) d.pricing.enabled = true;
    });
  const addServiceField = () =>
    update((d) => {
      if (!d.booking?.schedule) return;
      const f = makeField('service', 'איזה שירות?', 'radio', { required: true, appearance: 'chips', options: [makeOption('service_1', 'שירות ראשון')] });
      const host = stepOf(d, d.booking.dateKey) ?? d.steps[0]!;
      const date = host.fields.findIndex((x) => x.key === d.booking!.dateKey);
      host.fields.splice(Math.max(0, date), 0, f);
      d.booking = withSchedule(d.booking, { ...d.booking.schedule, serviceKey: f.key, durations: { service_1: d.booking.schedule.duration } });
    });

  const weekly = s ? s.days.reduce((n, _r, day) => n + startsFor(s, day, s.duration).length, 0) : 0;

  return (
    <div className={cx('space-y-5', compact && 'text-sm')}>
      <Question n={1} title="מה הלקוח מזמין?">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="סוג ההזמנה">
          {([['time', 'תור לפי שעה'], ['day', 'יום שלם'], ['week', 'שבוע שלם']] as const).map(([u, label]) => (
            <Chip key={u} on={unit === u} onClick={() => update((d) => setBookingUnit(d, u))}>
              {label}
            </Chip>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-ink-muted">
          {unit === 'time' ? 'מספרה, טיפול, אימון, פגישה: הלקוח בוחר שירות, יום ושעה.' : unit === 'day' ? 'השכרה, צילום, סדנה ליום: הלקוח בוחר תאריך.' : 'קייטנה, השכרה שבועית: הלקוח בוחר שבוע שמתחיל ביום ראשון.'}
        </p>
      </Question>

      {s && (
        <Question n={2} title="מה אתם מציעים, וכמה זמן זה לוקח?">
          {service ? (
            <div className="space-y-2">
              {(service.options ?? []).map((o, i) => (
                <div key={o.id} className="flex flex-wrap items-end gap-2 border-b border-cloud-200 pb-2 last:border-0">
                  <div className="min-w-[150px] flex-[2_1_150px]">
                    {i === 0 && <FieldLabel htmlFor={`svc-${o.id}`}>שירות</FieldLabel>}
                    <Input id={`svc-${o.id}`} value={o.label} onChange={(e) => setService((f) => void (f.options![i]!.label = e.target.value))} />
                  </div>
                  <div className="w-[112px]">
                    {i === 0 && <FieldLabel htmlFor={`len-${o.id}`}>משך</FieldLabel>}
                    <Select id={`len-${o.id}`} value={s.durations?.[o.value] ?? s.duration} onChange={(e) => setService((_f, sc) => void (sc.durations = { ...sc.durations, [o.value]: Number(e.target.value) }))}>
                      {LENGTHS.map((m) => (
                        <option key={m} value={m}>
                          {minutesLabel(m)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-[92px]">
                    {i === 0 && <FieldLabel htmlFor={`price-${o.id}`}>מחיר (₪)</FieldLabel>}
                    <Input id={`price-${o.id}`} type="number" min={0} dir="ltr" placeholder="—" value={o.price ?? ''} onChange={(e) => setService((f) => void (f.options![i]!.price = Number(e.target.value) || undefined))} />
                  </div>
                  <button
                    type="button"
                    aria-label={`הסרת ${o.label}`}
                    disabled={(service.options ?? []).length <= 1}
                    onClick={() => setService((f, sc) => {
                      f.options = f.options!.filter((x) => x.value !== o.value);
                      if (sc.durations) delete sc.durations[o.value];
                    })}
                    className="mb-1 grid h-9 w-9 place-items-center rounded-lg text-ink-muted hover:bg-cloud-100 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="inline-flex items-center gap-1 text-sm font-medium text-ink underline-offset-4 hover:underline"
                onClick={() => setService((f, sc) => {
                  let n = (f.options ?? []).length + 1;
                  while (f.options?.some((o) => o.value === `service_${n}`)) n++;
                  f.options = [...(f.options ?? []), makeOption(`service_${n}`, 'שירות חדש')];
                  sc.durations = { ...sc.durations, [`service_${n}`]: sc.duration };
                })}
              >
                <Plus className="h-4 w-4" /> הוספת שירות
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Select aria-label="משך כל תור" value={s.duration} onChange={(e) => setSchedule((sc) => void (sc.duration = Number(e.target.value)))}>
                {LENGTHS.map((m) => (
                  <option key={m} value={m}>
                    כל תור: {minutesLabel(m)}
                  </option>
                ))}
              </Select>
              <button type="button" className="text-sm font-medium underline-offset-4 hover:underline" onClick={addServiceField}>
                + שירותים עם משך שונה
              </button>
            </div>
          )}
        </Question>
      )}

      <Question n={s ? 3 : 2} title={unit === 'time' ? 'באילו ימים ושעות אתם עובדים?' : 'באילו ימים אפשר להזמין?'}>
        {s ? (
          <div className="space-y-1.5">
            {WEEKDAY_LABELS.map((label, day) => {
              const ranges = s.days[day] ?? [];
              const open = ranges.length > 0;
              return (
                <div key={day} className="flex flex-wrap items-center gap-2">
                  <Chip on={open} onClick={() => setSchedule((sc) => void (sc.days[day] = open ? [] : [{ ...(sc.days.find((r) => r.length)?.[0] ?? { from: '09:00', to: '18:00' }) }]))}>
                    {label}
                  </Chip>
                  {open ? (
                    <>
                      {ranges.map((r, i) => (
                        <span key={i} className="inline-flex items-center gap-1 rounded-lg border border-cloud-300 bg-white px-1.5 py-0.5">
                          <input aria-label={`${label}: פתיחה`} type="time" dir="ltr" step={300} className="w-[88px] bg-transparent text-sm" value={r.from} onChange={(e) => setSchedule((sc) => void (sc.days[day]![i]!.from = e.target.value || r.from))} />
                          <span aria-hidden>–</span>
                          <input aria-label={`${label}: סגירה`} type="time" dir="ltr" step={300} className="w-[88px] bg-transparent text-sm" value={r.to} onChange={(e) => setSchedule((sc) => void (sc.days[day]![i]!.to = e.target.value || r.to))} />
                          {i > 0 && (
                            <button type="button" aria-label="הסרת טווח" className="text-ink-muted" onClick={() => setSchedule((sc) => void sc.days[day]!.splice(i, 1))}>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      ))}
                      {ranges.length < 3 && (
                        <button type="button" className="text-xs text-ink-muted underline-offset-4 hover:underline" onClick={() => setSchedule((sc) => {
                          const list = sc.days[day]!;
                          const last = list[list.length - 1]!;
                          const to = last.to < '21:00' ? `${String(Math.min(23, Number(last.to.slice(0, 2)) + 3)).padStart(2, '0')}:00` : '23:00';
                          sc.days[day]!.push({ from: last.to, to });
                        })}>
                          + אחרי הפסקה
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-ink-muted">סגור</span>
                  )}
                </div>
              );
            })}
            <p className="pt-1 text-xs text-ink-muted">
              {weekly ? `${weekly} מועדים פנויים בשבוע לתור של ${minutesLabel(s.duration)}, לכל אחד מהעובדים.` : 'אין עדיין שעות פתיחה: בחרו לפחות יום אחד.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAY_LABELS.map((label, d) => {
              const on = b.openWeekdays.includes(d);
              return (
                <Chip key={d} on={on} disabled={unit === 'week'} onClick={() => {
                  const next = on ? b.openWeekdays.filter((x) => x !== d) : [...b.openWeekdays, d].sort();
                  if (next.length) setB({ openWeekdays: next });
                }}>
                  {label}
                </Chip>
              );
            })}
          </div>
        )}
      </Question>

      <Question n={s ? 4 : 3} title={unit === 'time' ? 'כמה לקוחות אפשר לקבל באותו זמן?' : unit === 'day' ? 'כמה הזמנות אפשר לקבל לכל יום?' : 'כמה הזמנות אפשר לקבל לכל שבוע?'}>
        <div className="flex flex-wrap items-center gap-3">
          <Input
            aria-label="כמה במקביל"
            className="w-24"
            type="number"
            min={1}
            max={1000}
            dir="ltr"
            value={b.capacityPerSlot}
            onChange={(e) => {
              const n = Math.max(1, Math.min(1000, Number(e.target.value) || 1));
              setB(unit === 'time' ? { capacityPerSlot: n } : { capacityPerSlot: n, maxPerDay: n });
            }}
          />
          <span className="text-xs text-ink-muted">{unit === 'time' ? 'למשל מספר הספרים, המטפלות או החדרים. תור שנתפס נעלם מהטופס, ואי אפשר לקבוע עליו שוב.' : 'כשהמכסה מתמלאת, התאריך נסגר להזמנות.'}</span>
        </div>
      </Question>

      {s && (
        <Question n={5} title="איך לחלק את היום?">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="sc-step">אפשר להתחיל תור כל</FieldLabel>
              <Select id="sc-step" value={s.step} onChange={(e) => setSchedule((sc) => void (sc.step = Number(e.target.value)))}>
                {STEPS.map((m) => (
                  <option key={m} value={m}>
                    {minutesLabel(m)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <FieldLabel htmlFor="sc-buffer">זמן התארגנות אחרי כל תור</FieldLabel>
              <Select id="sc-buffer" value={s.buffer ?? 0} onChange={(e) => setSchedule((sc) => void (sc.buffer = Number(e.target.value) || undefined))}>
                {BUFFERS.map((m) => (
                  <option key={m} value={m}>
                    {m ? minutesLabel(m) : 'בלי'}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Question>
      )}

      <Question n={s ? 6 : 4} title="כמה זמן מראש, ועד מתי?">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="ap-notice">לפחות</FieldLabel>
            <Select id="ap-notice" value={b.minNoticeHours ?? ''} onChange={(e) => setB({ minNoticeHours: Number(e.target.value) || undefined })}>
              <option value="">אפשר גם לאותו יום</option>
              {[1, 2, 3, 6, 12, 24, 48].map((h) => (
                <option key={h} value={h}>
                  {h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : h === 24 ? 'יום' : h === 48 ? 'יומיים' : `${h} שעות`} מראש
                </option>
              ))}
            </Select>
          </div>
          <div>
            <FieldLabel htmlFor="ap-ahead">עד</FieldLabel>
            <Select id="ap-ahead" value={b.maxDaysAhead ?? ''} onChange={(e) => setB({ maxDaysAhead: Number(e.target.value) || undefined })}>
              <option value="">בלי הגבלה</option>
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d === 7 ? 'שבוע' : d === 14 ? 'שבועיים' : d === 30 ? 'חודש' : d === 60 ? 'חודשיים' : '3 חודשים'} קדימה
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Question>
    </div>
  );
}

function Question({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-midnight text-[11px] font-semibold text-white" aria-hidden>
          {n}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Chip({ on, onClick, disabled, children }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cx('min-h-[34px] min-w-[52px] rounded-lg border px-2.5 text-xs font-medium disabled:opacity-60', on ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink-muted')}
    >
      {children}
    </button>
  );
}
