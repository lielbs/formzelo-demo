/**
 * Formangle Actions — pure rules, so a server can apply exactly the same ones.
 * An action is created once and never edited; the customer answers it once; the owner may
 * cancel it while it is still open. Nothing here sends a message: in the local demo the
 * customer sees actions on their request page in this browser.
 */
import { z } from 'zod';
import { CustomerActionSchema, type ActionKind, type ActionStatus, type CustomerAction, type WorkflowRun } from '../domain/schema';
import { formatCurrency } from '../lib/format';

export const ACTION_KIND_INFO: Record<ActionKind, { title: string; description: string; options?: [string, string]; example: { title: string; description: string; amount?: number; options?: [string, string] } }> = {
  approval: {
    title: 'בקשת אישור',
    description: 'הלקוח מאשר או לא מאשר, למשל תיקון נוסף והמחיר שלו.',
    options: ['מאשר', 'לא מאשר'],
    example: { title: 'החלפת רפידות בלם', description: 'בבדיקה נמצא שרפידות הבלם הקדמיות שחוקות. האם לאשר את העבודה?', amount: 480 },
  },
  choice: {
    title: 'בחירה בין שתי אפשרויות',
    description: 'הלקוח בוחר אחת משתי אפשרויות שאתם קובעים.',
    example: { title: 'איך תרצו לקבל את ההזמנה?', description: 'ההזמנה מוכנה מחר מ-10:00.', options: ['משלוח', 'איסוף עצמי'] },
  },
  update: {
    title: 'עדכון ללקוח',
    description: 'מידע בלבד, בלי צורך בתשובה.',
    example: { title: 'ההזמנה מוכנה לאיסוף', description: 'אפשר לאסוף היום עד 19:00.' },
  },
};

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  pending: 'ממתין לתשובת הלקוח',
  responded: 'התקבלה תשובה',
  expired: 'פג תוקף',
  cancelled: 'בוטל',
  posted: 'עדכון ללקוח',
};

const line = (max: number, msg: string) => z.string().trim().min(1, msg).max(max, `עד ${max} תווים`);

/** What the owner fills in. Validated here (the trust boundary), not only in the form. */
export const ActionInputSchema = z
  .object({
    kind: z.enum(['approval', 'choice', 'update']),
    title: line(120, 'כתבו כותרת'),
    description: z.string().trim().max(1000, 'עד 1000 תווים').default(''),
    amount: z.number().min(0, 'סכום לא תקין').max(1_000_000, 'סכום גבוה מדי').optional(),
    note: z.string().trim().max(300, 'עד 300 תווים').optional(),
    options: z.tuple([line(40, 'כתבו את התשובה הראשונה'), line(40, 'כתבו את התשובה השנייה')]).optional(),
    expiresAt: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === 'choice' && !v.options) ctx.addIssue({ code: 'custom', path: ['options'], message: 'נדרשות שתי תשובות' });
    if (v.options && v.options[0] === v.options[1]) ctx.addIssue({ code: 'custom', path: ['options'], message: 'שתי התשובות זהות' });
    if (v.expiresAt && Number.isNaN(Date.parse(v.expiresAt))) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'תאריך לא תקין' });
  });
export type ActionInput = z.input<typeof ActionInputSchema>;

/** Statuses on which no new action makes sense. */
export const CLOSED_RUN: WorkflowRun['status'][] = ['cancelled', 'rejected'];

export function buildAction(input: ActionInput, run: WorkflowRun, ids: { id: string }, at: string): CustomerAction {
  const v = ActionInputSchema.parse(input);
  if (CLOSED_RUN.includes(run.status)) throw new Error('לא ניתן לשלוח פעולה על בקשה שנדחתה או בוטלה');
  if (v.expiresAt && Date.parse(v.expiresAt) <= Date.parse(at)) throw new Error('תאריך התפוגה כבר עבר');
  const labels = v.kind === 'update' ? [] : (v.options ?? (ACTION_KIND_INFO[v.kind].options as [string, string]));
  return CustomerActionSchema.parse({
    id: ids.id,
    orgId: run.orgId,
    runId: run.id,
    workflowId: run.workflowId,
    versionId: run.versionId,
    versionNumber: run.versionNumber,
    kind: v.kind,
    title: v.title,
    description: v.description,
    amount: v.amount && v.amount > 0 ? Math.round(v.amount * 100) / 100 : undefined,
    note: v.note || undefined,
    options: labels.map((label, i) => ({ id: i ? 'b' : 'a', label })),
    expiresAt: v.expiresAt,
    status: v.kind === 'update' ? 'posted' : 'pending',
    createdAt: at,
    updatedAt: at,
  });
}

/** Stored status with expiry applied (expiry is a function of time, not a write). */
export function actionStatus(a: CustomerAction, now: number = Date.now()): ActionStatus {
  if (a.status === 'pending' && a.expiresAt && Date.parse(a.expiresAt) <= now) return 'expired';
  return a.status;
}

export const isAwaiting = (a: CustomerAction, now?: number) => actionStatus(a, now) === 'pending';

/** Two pending actions with the same terms on one request are a double submission. */
export function isDuplicate(existing: CustomerAction[], next: CustomerAction, now?: number): boolean {
  return existing.some((a) => a.runId === next.runId && a.kind === next.kind && a.title === next.title && a.amount === next.amount && (isAwaiting(a, now) || (a.kind === 'update' && a.status === 'posted' && Date.parse(next.createdAt) - Date.parse(a.createdAt) < 60_000)));
}

/** The customer's single answer. Throws on anything but an open approval / choice. */
export function respond(a: CustomerAction, optionId: string, at: string): CustomerAction {
  const status = actionStatus(a, Date.parse(at));
  if (a.kind === 'update') throw new Error('עדכון אינו דורש תשובה');
  if (status === 'responded') throw new Error('כבר התקבלה תשובה לבקשה זו');
  if (status === 'cancelled') throw new Error('העסק ביטל את הבקשה הזו');
  if (status === 'expired') throw new Error('תוקף הבקשה פג. פנו לעסק');
  const option = a.options.find((o) => o.id === optionId);
  if (!option) throw new Error('אפשרות לא קיימת');
  return { ...a, status: 'responded', response: { optionId: option.id, label: option.label, at }, updatedAt: at };
}

export function cancel(a: CustomerAction, at: string): CustomerAction {
  const status = actionStatus(a, Date.parse(at));
  if (status !== 'pending' && status !== 'posted') throw new Error('אפשר לבטל רק פעולה פתוחה. תשובה שהתקבלה נשמרת כפי שהיא');
  return { ...a, status: 'cancelled', cancelledAt: at, updatedAt: at };
}

/** One-line description for timelines. */
export function actionSummary(a: CustomerAction): string {
  return `${a.title}${a.amount ? ` · ${formatCurrency(a.amount)}` : ''}`;
}

/** An approval answered with its first (positive) option. */
export const isApproved = (a: CustomerAction) => a.kind === 'approval' && a.response?.optionId === 'a';

export interface ActionCounts {
  awaiting: number;
  answered: number;
  /** Requests with at least one action waiting for the customer. */
  awaitingRuns: Set<string>;
}

export function countActions(actions: CustomerAction[], now: number = Date.now()): ActionCounts {
  const awaitingRuns = new Set<string>();
  let awaiting = 0;
  let answered = 0;
  for (const a of actions) {
    const s = actionStatus(a, now);
    if (s === 'pending') {
      awaiting++;
      awaitingRuns.add(a.runId);
    } else if (s === 'responded') answered++;
  }
  return { awaiting, answered, awaitingRuns };
}
