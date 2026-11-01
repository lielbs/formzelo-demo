/**
 * "פעולה חדשה ללקוח": the owner composes an approval, a two-option choice or an update, and
 * sees the customer's card in the business's own design while typing. Exactly two answers.
 */
import { BellRing, ListChecks, ShieldQuestion, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useToast } from '../../components/Toast';
import { Button, cx, FieldLabel, Input, Modal, Select, Textarea } from '../../components/ui';
import type { ActionKind, WorkflowRun } from '../../domain/schema';
import type { WorkflowTheme } from '../../domain/theme';
import { useRepo } from '../../data/store';
import { ACTION_KIND_INFO, ActionInputSchema, buildAction, type ActionInput } from '../../engine/actions';
import { ActionCard } from '../../renderer/actions';
import { ThemeScope } from '../../theme/ThemeScope';

const KIND_ICON = { approval: ShieldQuestion, choice: ListChecks, update: BellRing } as const;
const EXPIRY = [
  ['', 'ללא הגבלה'],
  ['24', '24 שעות'],
  ['72', '3 ימים'],
  ['168', 'שבוע'],
] as const;

type Draft = { kind: ActionKind; title: string; description: string; amount: string; a: string; b: string; note: string; expiry: string };
const blank = (kind: ActionKind): Draft => ({ kind, title: '', description: '', amount: '', a: ACTION_KIND_INFO[kind].options?.[0] ?? '', b: ACTION_KIND_INFO[kind].options?.[1] ?? '', note: '', expiry: '' });

function toInput(d: Draft, now = Date.now()): ActionInput {
  const amount = d.amount.trim() ? Number(d.amount) : undefined;
  return {
    kind: d.kind,
    title: d.title,
    description: d.description,
    amount: d.kind === 'update' ? undefined : amount,
    note: d.note.trim() || undefined,
    options: d.kind === 'update' ? undefined : [d.a, d.b],
    expiresAt: d.expiry && d.kind !== 'update' ? new Date(now + Number(d.expiry) * 3_600_000).toISOString() : undefined,
  };
}

export function ActionComposer({ open, onClose, orgId, business, run, design, onCreated }: { open: boolean; onClose: () => void; orgId: string; business: string; run: WorkflowRun; design?: WorkflowTheme; onCreated: () => void }) {
  const { repo } = useRepo();
  const toast = useToast();
  const [d, setD] = useState<Draft>(blank('approval'));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<Draft>) => {
    setD((x) => ({ ...x, ...patch }));
    setErrors({});
  };

  const preview = useMemo(() => {
    const input = toInput({ ...d, title: d.title || 'כותרת הבקשה', a: d.a || 'תשובה ראשונה', b: d.b || 'תשובה שנייה' });
    try {
      return buildAction({ ...input, amount: Number.isFinite(input.amount) ? input.amount : undefined }, run, { id: 'preview' }, new Date().toISOString());
    } catch {
      return null;
    }
  }, [d, run]);

  const submit = async () => {
    if (d.kind !== 'update' && d.amount.trim() && !(Number(d.amount) >= 0)) return setErrors({ amount: 'סכום לא תקין' });
    const input = toInput(d);
    const parsed = ActionInputSchema.safeParse(input);
    if (!parsed.success) {
      const e: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'options' ? (issue.path[1] === 1 ? 'b' : 'a') : String(issue.path[0]);
        e[key] ??= issue.message;
      }
      return setErrors(e);
    }
    setBusy(true);
    try {
      await repo.createAction(orgId, run.id, input);
      toast(d.kind === 'update' ? 'העדכון נוסף לעמוד הבקשה של הלקוח' : 'הבקשה נוספה לעמוד הבקשה של הלקוח');
      setD(blank(d.kind));
      onCreated();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'error');
    } finally {
      setBusy(false);
    }
  };

  const err = (k: string) =>
    errors[k] ? (
      <p role="alert" className="mt-1 text-xs text-red-600">
        {errors[k]}
      </p>
    ) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      wide
      title="פעולה חדשה ללקוח"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={submit} loading={busy}>
            {d.kind === 'update' ? 'הוספת העדכון' : 'הוספת הבקשה ללקוח'}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="סוג הפעולה">
            {(Object.keys(ACTION_KIND_INFO) as ActionKind[]).map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={d.kind === k}
                  onClick={() => setD((x) => ({ ...blank(k), title: x.title, description: x.description, amount: x.amount }))}
                  className={cx('rounded-xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', d.kind === k ? 'border-midnight bg-cloud ring-1 ring-midnight/20' : 'border-cloud-300 hover:border-ink-soft')}
                >
                  <Icon className="h-5 w-5 text-orange-700" aria-hidden />
                  <span className="mt-1.5 block text-sm font-semibold">{ACTION_KIND_INFO[k].title}</span>
                  <span className="block text-xs text-ink-muted">{ACTION_KIND_INFO[k].description}</span>
                </button>
              );
            })}
          </div>

          <div>
            <div className="flex items-end justify-between gap-2">
              <FieldLabel htmlFor="act-title" required>
                כותרת
              </FieldLabel>
              <button
                type="button"
                className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-orange-700 hover:underline"
                onClick={() => {
                  const ex = ACTION_KIND_INFO[d.kind].example;
                  set({ title: ex.title, description: ex.description, amount: ex.amount ? String(ex.amount) : '', ...(ex.options ? { a: ex.options[0], b: ex.options[1] } : {}) });
                }}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> מילוי דוגמה
              </button>
            </div>
            <Input id="act-title" maxLength={120} value={d.title} invalid={Boolean(errors.title)} onChange={(e) => set({ title: e.target.value })} placeholder={ACTION_KIND_INFO[d.kind].example.title} />
            {err('title')}
          </div>
          <div>
            <FieldLabel htmlFor="act-desc">פרטים</FieldLabel>
            <Textarea id="act-desc" rows={3} maxLength={1000} value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder={ACTION_KIND_INFO[d.kind].example.description} />
            {err('description')}
          </div>

          {d.kind !== 'update' && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="act-a" required>
                    תשובה ראשונה
                  </FieldLabel>
                  <Input id="act-a" maxLength={40} value={d.a} invalid={Boolean(errors.a)} onChange={(e) => set({ a: e.target.value })} placeholder="לדוגמה: משלוח" />
                  {err('a')}
                </div>
                <div>
                  <FieldLabel htmlFor="act-b" required>
                    תשובה שנייה
                  </FieldLabel>
                  <Input id="act-b" maxLength={40} value={d.b} invalid={Boolean(errors.b)} onChange={(e) => set({ b: e.target.value })} placeholder="לדוגמה: איסוף עצמי" />
                  {err('b')}
                </div>
              </div>
              <p className="-mt-2 text-xs text-ink-muted">הלקוח בוחר אחת משתי התשובות. בלי צ׳אט פתוח — כך ההחלטה ברורה ומתועדת.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="act-amount">סכום (₪, רשות)</FieldLabel>
                  <Input id="act-amount" type="number" inputMode="decimal" min={0} dir="ltr" value={d.amount} invalid={Boolean(errors.amount)} onChange={(e) => set({ amount: e.target.value })} />
                  {err('amount')}
                </div>
                <div>
                  <FieldLabel htmlFor="act-exp">אפשר להשיב במשך</FieldLabel>
                  <Select id="act-exp" value={d.expiry} onChange={(e) => set({ expiry: e.target.value })}>
                    {EXPIRY.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </>
          )}
          <div>
            <FieldLabel htmlFor="act-note">הערה קטנה (רשות)</FieldLabel>
            <Input id="act-note" maxLength={300} value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="לדוגמה: המחיר כולל מע״מ" />
          </div>
          <p className="rounded-xl bg-cloud p-3 text-xs leading-relaxed text-ink-muted">
            אחרי השמירה אי אפשר לערוך את הפעולה — אפשר רק לבטל אותה כל עוד לא נענתה. אם הסכום או התנאים משתנים, שולחים פעולה חדשה, וכך כל תשובה נשמרת עם מה שהלקוח ראה. בדמו הפעולה מופיעה בעמוד הבקשה של הלקוח בדפדפן הזה; לא נשלחת הודעה.
          </p>
        </div>

        <div className="lg:sticky lg:top-0 lg:self-start">
          <p className="mb-2 text-xs font-medium text-ink-muted">כך הלקוח יראה את זה</p>
          {design && preview ? (
            <ThemeScope theme={design} className="rounded-2xl bg-[var(--fz-bg)] p-3">
              <ActionCard action={preview} business={business} reference={run.reference} preview />
            </ThemeScope>
          ) : (
            <p className="rounded-xl bg-cloud p-4 text-sm text-ink-muted">התצוגה תופיע כאן.</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
