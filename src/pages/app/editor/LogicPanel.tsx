/**
 * Logic mode: every rule of the workflow in plain Hebrew — conditional
 * questions and steps, price rules, fees and booking — plus the checker's
 * findings. Each row jumps to the element that owns the rule.
 */
import { AlertTriangle, CalendarClock, CheckCircle2, GitBranch, Receipt, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Button } from '../../../components/ui';
import { isDisplayField, type WorkflowConfig } from '../../../domain/schema';
import { describeCondition, logicIssues } from '../../../engine/logic';
import { fieldHasPrice } from '../../../engine/pricing';
import { formatCurrency } from '../../../lib/format';
import { Panel } from './Inspector';

function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full rounded-xl border border-cloud-200 bg-white px-3 py-2.5 text-start text-sm leading-snug hover:border-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange">
        {children}
      </button>
    </li>
  );
}

function Section({ icon: Icon, title, children, empty }: { icon: typeof GitBranch; title: string; children: ReactNode[]; empty: string }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4 text-ink-muted" aria-hidden /> {title}
        {children.length > 0 && <Badge>{children.length}</Badge>}
      </h3>
      {children.length ? <ul className="space-y-1.5">{children}</ul> : <p className="rounded-xl bg-cloud px-3 py-2.5 text-xs leading-relaxed text-ink-muted">{empty}</p>}
    </section>
  );
}

export function LogicPanel({
  config,
  onField,
  onStep,
  onOpen,
}: {
  config: WorkflowConfig;
  onField: (fieldId: string) => void;
  onStep: (stepId: string) => void;
  onOpen: (kind: 'completion' | 'booking') => void;
}) {
  const fields = config.steps.flatMap((s) => s.fields);
  const issues = logicIssues(config);
  const conditional = [
    ...config.steps.filter((s) => s.condition).map((s) => ({ key: s.id, label: `השלב ״${s.title}״`, text: describeCondition(s.condition!, fields), go: () => onStep(s.id) })),
    ...fields.filter((f) => f.condition).map((f) => ({ key: f.id, label: `״${f.label}״`, text: describeCondition(f.condition!, fields), go: () => onField(f.id) })),
  ];
  const priced = config.pricing.enabled ? fields.filter((f) => !isDisplayField(f) && fieldHasPrice(f)) : [];
  const limited = fields.filter((f) => f.options?.some((o) => o.capacity));

  return (
    <Panel title="לוגיקה ומחירים">
      <p className="text-xs leading-relaxed text-ink-muted">כל הכללים של התהליך, במילים פשוטות. לחיצה על כלל פותחת את השדה או השלב שלו.</p>

      {issues.length > 0 ? (
        <div role="alert" className="space-y-1.5 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-800">
            <AlertTriangle className="h-4 w-4" aria-hidden /> {issues.filter((i) => i.level === 'error').length ? 'כללים שצריך לתקן לפני פרסום' : 'כדאי לבדוק'}
          </p>
          <ul className="space-y-1 text-[13px] text-red-900">
            {issues.map((i) => (
              <li key={i.message}>
                <button type="button" className="text-start underline-offset-2 hover:underline" onClick={() => (i.fieldId ? onField(i.fieldId) : i.stepId ? onStep(i.stepId) : undefined)}>
                  {i.level === 'warning' ? 'שימו לב: ' : ''}
                  {i.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 rounded-xl bg-teal-50 px-3 py-2.5 text-sm text-teal-600">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> כל הכללים תקינים
        </p>
      )}

      <Section icon={GitBranch} title="הצגה מותנית" empty="אין שאלות מותנות. כדי להוסיף: בחרו שאלה ← ״הגדרות מתקדמות״ ← ״הצגה מותנית״.">
        {conditional.map((r) => (
          <Row key={r.key} onClick={r.go}>
            <span className="font-medium">{r.label}</span> <span className="text-ink-muted">מוצג רק כאשר {r.text}</span>
          </Row>
        ))}
      </Section>

      <Section icon={Receipt} title="חישוב מחיר" empty={config.pricing.enabled ? 'עוד אין שדות עם מחיר. הוסיפו ״בחירת חבילה ומחיר״ או מחיר לאפשרויות.' : 'חישוב המחיר כבוי. אפשר להפעיל אותו ב״סיום ותשלום״.'}>
        {[
          ...priced.map((f) => {
            const prices = f.options?.map((o) => o.price).filter((p): p is number => p !== undefined) ?? [];
            const mult = f.multiplyByKey ? fields.find((x) => x.key === f.multiplyByKey)?.label : undefined;
            const what = prices.length ? `${formatCurrency(Math.min(...prices))}–${formatCurrency(Math.max(...prices))} לפי בחירה` : f.price !== undefined ? `${formatCurrency(f.price)} ${f.type === 'decision' ? 'אם מאושר' : f.type === 'number' ? 'ליחידה' : 'אם מסומן'}` : 'מחיר';
            return (
              <Row key={f.id} onClick={() => onField(f.id)}>
                <span className="font-medium">״{f.label}״</span> <span className="text-ink-muted">· {what}{mult ? ` · כפול ״${mult}״` : ''}</span>
              </Row>
            );
          }),
          ...config.pricing.fees.map((fee) => (
            <Row key={fee.id} onClick={() => onOpen('completion')}>
              <span className="font-medium">{fee.label}</span> <span className="text-ink-muted">· {formatCurrency(fee.amount)} קבוע{fee.condition ? ` · רק כאשר ${describeCondition(fee.condition, fields)}` : ''}</span>
            </Row>
          )),
        ]}
      </Section>

      <Section icon={Users} title="מקומות מוגבלים" empty="אין אפשרויות עם מספר מקומות. אפשר להגדיר מקומות לכל אפשרות בשאלת בחירה אחת.">
        {limited.map((f) => (
          <Row key={f.id} onClick={() => onField(f.id)}>
            <span className="font-medium">״{f.label}״</span>{' '}
            <span className="text-ink-muted">· {f.options!.filter((o) => o.capacity).map((o) => `${o.label}: ${o.capacity}`).join(' · ')}</span>
          </Row>
        ))}
      </Section>

      <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cloud-200 p-3">
        <span className="flex items-center gap-1.5 text-sm">
          <CalendarClock className="h-4 w-4 text-ink-muted" aria-hidden />
          כללי הזמנה: {config.booking?.enabled ? <Badge tone="teal">פעילים</Badge> : <span className="text-ink-muted">כבויים</span>}
        </span>
        <Button size="sm" variant="ghost" onClick={() => onOpen('booking')}>
          הגדרות הזמנה
        </Button>
      </section>
    </Panel>
  );
}
