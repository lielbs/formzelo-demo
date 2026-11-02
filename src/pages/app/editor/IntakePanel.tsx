/**
 * "קבלת בקשות": when the public link is open and how many requests it takes.
 * Saved straight to the workflow (not the draft), so it applies at once without publishing.
 */
import { CircleCheck, CirclePause, PlayCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, cx, FieldLabel, Input, Textarea } from '../../../components/ui';
import { useToast } from '../../../components/Toast';
import type { Intake, Workflow, WorkflowRun } from '../../../domain/schema';
import { useRepo } from '../../../data/store';
import { formatDay, intakeState } from '../../../engine/intake';
import { Toggle } from './DesignPanel';
import { Panel } from './Inspector';

const EMPTY: Intake = { paused: false, onePerContact: false };

/** One tap sets a sensible rule; the owner can still fine-tune the numbers below. */
const QUICK: { label: string; patch: Partial<Intake> }[] = [
  { label: 'ללא הגבלה', patch: { maxTotal: undefined, maxPerDay: undefined, maxPerWeek: undefined } },
  { label: 'עד 10 ביום', patch: { maxPerDay: 10 } },
  { label: 'עד 30 בשבוע', patch: { maxPerWeek: 30 } },
  { label: '50 מקומות בסך הכול', patch: { maxTotal: 50 } },
];

function LimitInput({ id, label, hint, value, used, onChange }: { id: string; label: string; hint: string; value?: number; used: number; onChange: (v?: number) => void }) {
  return (
    <div className="rounded-xl border border-cloud-200 p-3">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        min={1}
        dir="ltr"
        inputMode="numeric"
        placeholder="ללא הגבלה"
        value={value ?? ''}
        onChange={(e) => {
          const n = Math.floor(Number(e.target.value));
          onChange(e.target.value === '' || !n || n < 1 ? undefined : n);
        }}
      />
      <p className="mt-1 text-xs text-ink-muted">
        {hint} · התקבלו: <strong className="font-semibold text-ink">{used}</strong>
        {value ? ` מתוך ${value}` : ''}
      </p>
    </div>
  );
}

export function IntakePanel({ orgId, workflow, runs, published }: { orgId: string; workflow: Workflow; runs: WorkflowRun[]; published: boolean }) {
  const { repo } = useRepo();
  const toast = useToast();
  const [intake, setIntake] = useState<Intake>(workflow.intake ?? EMPTY);
  const first = useRef(true);

  // Save shortly after the last change; every rule applies to the live link at once.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      repo.updateIntake(orgId, workflow.id, intake).catch((e) => toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'error'));
    }, 350);
    return () => clearTimeout(t);
  }, [intake, orgId, workflow.id, repo, toast]);

  const set = (patch: Partial<Intake>) => setIntake((i) => ({ ...i, ...patch }));
  const state = intakeState(intake, runs);
  const { counts } = state;

  return (
    <Panel title="קבלת בקשות">
      <div className={cx('rounded-2xl border p-4', state.open ? 'border-teal/30 bg-teal-50' : 'border-amber-200 bg-amber-50')}>
        <div className="flex flex-wrap items-center gap-3">
          {state.open ? <CircleCheck className="h-6 w-6 text-teal-600" aria-hidden /> : <CirclePause className="h-6 w-6 text-amber-700" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink" role="status">
              {state.open ? 'הטופס פתוח לבקשות חדשות' : 'הטופס סגור לבקשות חדשות'}
            </p>
            <p className="text-xs text-ink-muted">{state.open ? (published ? 'לקוחות עם הקישור יכולים לשלוח עכשיו.' : 'ייפתח ללקוחות אחרי הפרסום.') : (intake.closedMessage || state.message)}</p>
          </div>
          <Button size="sm" variant={intake.paused ? 'primary' : 'secondary'} icon={intake.paused ? PlayCircle : CirclePause} onClick={() => set({ paused: !intake.paused })}>
            {intake.paused ? 'פתיחה מחדש' : 'סגירה זמנית'}
          </Button>
        </div>
        <p className="mt-3 flex flex-wrap gap-1.5 text-xs">
          <Badge tone="neutral">היום: {counts.today}</Badge>
          <Badge tone="neutral">השבוע: {counts.week}</Badge>
          <Badge tone="neutral">סה״כ פתוחות: {counts.total}</Badge>
        </p>
      </div>

      <p className="text-xs leading-relaxed text-ink-muted">
        השינויים כאן חלים מיד על הקישור — בלי לפרסם מחדש. לקוחות שכבר שלחו ממשיכים בקישור האישי שלהם כרגיל. בקשות שנדחו או בוטלו לא נספרות.
      </p>

      <div>
        <p className="mb-1.5 text-sm font-medium">כמה בקשות לקבל</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q.label} type="button" onClick={() => set(q.patch)} className="min-h-[34px] rounded-full border border-cloud-300 bg-white px-3 text-xs font-medium text-ink hover:border-midnight">
              {q.label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <LimitInput id="in-day" label="ביום" hint="מתאפס בחצות" value={intake.maxPerDay} used={counts.today} onChange={(v) => set({ maxPerDay: v })} />
          <LimitInput id="in-week" label="בשבוע" hint="מתאפס ביום ראשון" value={intake.maxPerWeek} used={counts.week} onChange={(v) => set({ maxPerWeek: v })} />
          <LimitInput id="in-total" label="בסך הכול" hint="למשל מספר מקומות" value={intake.maxTotal} used={counts.total} onChange={(v) => set({ maxTotal: v })} />
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-sm font-medium">מתי הטופס פתוח</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="in-open">נפתח בתאריך</FieldLabel>
            <Input id="in-open" type="date" dir="ltr" value={intake.opensOn ?? ''} max={intake.closesOn} onChange={(e) => set({ opensOn: e.target.value || undefined })} />
          </div>
          <div>
            <FieldLabel htmlFor="in-close">נסגר אחרי</FieldLabel>
            <Input id="in-close" type="date" dir="ltr" value={intake.closesOn ?? ''} min={intake.opensOn} onChange={(e) => set({ closesOn: e.target.value || undefined })} />
          </div>
        </div>
        <p className="mt-1 text-xs text-ink-muted">ריק = פתוח תמיד. מתאים להרשמה עם תאריך יעד, מבצע או עונה.</p>
        <div className="mt-3">
          <FieldLabel htmlFor="in-holiday">ימים סגורים (חג, חופשה)</FieldLabel>
          <Input
            id="in-holiday"
            type="date"
            dir="ltr"
            value=""
            onChange={(e) => {
              const d = e.target.value;
              if (d && !(intake.closedDates ?? []).includes(d)) set({ closedDates: [...(intake.closedDates ?? []), d].sort().slice(-120) });
            }}
          />
          {(intake.closedDates ?? []).length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="ימים סגורים">
              {intake.closedDates!.map((d) => (
                <li key={d}>
                  <button
                    type="button"
                    dir="ltr"
                    aria-label={`הסרת ${formatDay(d)}`}
                    onClick={() => set({ closedDates: intake.closedDates!.filter((x) => x !== d) })}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded-full bg-cloud px-2.5 text-xs font-medium text-ink hover:bg-cloud-200"
                  >
                    {formatDay(d)} <span aria-hidden>×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <Toggle checked={intake.onePerContact} onChange={(v) => set({ onePerContact: v })}>
        <span className="font-medium">בקשה פתוחה אחת לכל טלפון / אימייל</span>
        <span className="block text-xs text-ink-muted">מונע כפילויות. אחרי שהבקשה נסגרת או נדחית, אפשר לשלוח חדשה.</span>
      </Toggle>

      <div>
        <FieldLabel htmlFor="in-msg">ההודעה ללקוח כשהטופס סגור</FieldLabel>
        <Textarea id="in-msg" rows={2} maxLength={240} placeholder={state.message ?? 'למשל: מלאנו את כל התורים לחודש הזה. נפתח שוב ב-1 לחודש!'} value={intake.closedMessage ?? ''} onChange={(e) => set({ closedMessage: e.target.value || undefined })} />
        <p className="mt-1 text-xs text-ink-muted">ריק = הודעה אוטומטית לפי הסיבה. הלקוח רואה גם את דרכי יצירת הקשר שלכם.</p>
      </div>

      <p className="text-xs text-ink-soft">בדמו הספירה נעשית מבקשות שנשמרו בדפדפן הזה בלבד.</p>
    </Panel>
  );
}
