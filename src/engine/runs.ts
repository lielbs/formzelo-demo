import type { NotificationPreview, Organization, RunAnswer, RunStatus, WorkflowConfig, WorkflowRun } from '../domain/schema';
import { formatCurrency } from '../lib/format';
import { newId, nowIso } from '../lib/id';
import { allVisibleFields, type Values } from './conditions';
import { computePrice } from './pricing';
import { STATUS_LABELS } from './transitions';
import { toRunAnswers } from './validation';

export interface Submission {
  answers: RunAnswer[];
  priceLines: WorkflowRun['priceLines'];
  total: number;
  deposit: number;
  customerName: string;
  customerContact: string;
}

/** Pure: turns raw form values into the persisted shape of a run. */
export function buildSubmission(config: WorkflowConfig, values: Values, caseAnswers: RunAnswer[] = []): Submission {
  const fields = allVisibleFields(config, values);
  const answers = toRunAnswers(fields, values);
  const price = computePrice(config, values);
  const allFields = [...config.caseFields, ...fields];
  const all = [...caseAnswers, ...answers];
  const byRole = (role: string) => {
    const f = allFields.find((x) => x.role === role);
    const a = f && all.find((x) => x.fieldKey === f.key);
    return a && a.value !== null && a.value !== '' ? String(a.value) : '';
  };
  return {
    answers,
    priceLines: price.lines,
    total: price.total,
    deposit: price.deposit,
    customerName: byRole('customer_name'),
    customerContact: byRole('customer_phone') || byRole('customer_email'),
  };
}

export function referencePrefix(org: Organization): string {
  const latin = org.name.replace(/[^A-Za-z ]/g, '').trim();
  const parts = latin.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return (latin.slice(0, 2) || 'FZ').toUpperCase();
}

const preview = (
  org: Organization,
  run: WorkflowRun,
  p: Pick<NotificationPreview, 'channel' | 'audience' | 'to' | 'subject' | 'body'>,
  at = nowIso(),
): NotificationPreview => ({ id: newId('ntf'), orgId: org.id, runId: run.id, simulated: true, createdAt: at, updatedAt: at, ...p });

/** Simulated notifications. Nothing is ever sent — these are previews stored locally. */
export function submitNotifications(org: Organization, run: WorkflowRun, workflowTitle: string, at?: string): NotificationPreview[] {
  const name = run.customerName || 'לקוח/ה';
  const totalText = run.total > 0 ? ` סכום: ${formatCurrency(run.total)}.` : '';
  const list: NotificationPreview[] = [
    preview(org, run, {
      channel: 'email',
      audience: 'owner',
      to: org.contactEmail || 'owner@example.com',
      subject: `בקשה חדשה ${run.reference} — ${workflowTitle}`,
      body: `${name} שלח/ה בקשה חדשה בתהליך "${workflowTitle}".${totalText}`,
    }, at),
  ];
  if (run.customerContact) {
    list.push(
      preview(org, run, {
        channel: run.customerContact.includes('@') ? 'email' : 'sms',
        audience: 'customer',
        to: run.customerContact,
        subject: 'הבקשה התקבלה',
        body: `היי ${name}, ${org.name} קיבלו את הבקשה שלך (${run.reference}).${totalText} נעדכן בהמשך.`,
      }, at),
    );
  }
  return list;
}

export function statusNotification(org: Organization, run: WorkflowRun, to: RunStatus, note?: string, at?: string): NotificationPreview | null {
  if (!run.customerContact) return null;
  const name = run.customerName || 'לקוח/ה';
  const extra =
    to === 'approved' && run.payment.status === 'deposit_requested'
      ? ` להשלמת ההזמנה נדרשת מקדמה של ${formatCurrency(run.payment.amount)} (סימולציה).`
      : '';
  return preview(org, run, {
    channel: run.customerContact.includes('@') ? 'email' : 'whatsapp',
    audience: 'customer',
    to: run.customerContact,
    subject: `עדכון לבקשה ${run.reference}: ${STATUS_LABELS[to]}`,
    body: `היי ${name}, סטטוס הבקשה שלך ב-${org.name} עודכן ל"${STATUS_LABELS[to]}".${extra}${note ? ` הערה: ${note}` : ''}`,
  }, at);
}

export function caseLinkNotification(org: Organization, run: WorkflowRun, link: string, at?: string): NotificationPreview | null {
  if (!run.customerContact) return null;
  return preview(org, run, {
    channel: 'sms',
    audience: 'customer',
    to: run.customerContact,
    subject: 'קישור אישי לאישור',
    body: `היי ${run.customerName || ''}, ${org.name} שלחו לך קישור אישי לצפייה ולאישור: ${link}`,
  }, at);
}
