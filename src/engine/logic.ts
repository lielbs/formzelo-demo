/**
 * Plain-language workflow logic: which condition operators make sense for a
 * source field, how a rule reads in Hebrew, and a checker that finds broken,
 * circular or conflicting rules before publishing. Pure and declarative.
 */
import { isDisplayField, type Condition, type WorkflowConfig, type WorkflowField } from '../domain/schema';
import { OPERATOR_LABELS } from './conditions';

export type IssueLevel = 'error' | 'warning';
export interface LogicIssue {
  level: IssueLevel;
  message: string;
  fieldId?: string;
  stepId?: string;
}

/** Operators that are meaningful for the type of the field a condition depends on. */
export function operatorsFor(source: Pick<WorkflowField, 'type'> | undefined): Condition['operator'][] {
  switch (source?.type) {
    case 'checkbox':
    case 'decision':
      return ['isTrue', 'isFalse'];
    case 'number':
      return ['gt', 'lt', 'equals', 'notEmpty'];
    case 'multiselect':
      return ['includes', 'notEmpty', 'isEmpty'];
    case 'radio':
    case 'select':
    case 'time':
      return ['equals', 'notEquals', 'notEmpty'];
    default:
      return ['notEmpty', 'isEmpty', 'equals', 'includes'];
  }
}

const VALUELESS: Condition['operator'][] = ['isTrue', 'isFalse', 'notEmpty', 'isEmpty'];
export const needsValue = (op: Condition['operator']) => !VALUELESS.includes(op);

/** "סוג האירוע" שווה ל "עסקי" — the rule as an owner reads it. */
export function describeCondition(c: Condition, fields: WorkflowField[]): string {
  const src = fields.find((f) => f.key === c.fieldKey);
  const name = src ? `״${src.label}״` : 'שדה שנמחק';
  if (!needsValue(c.operator)) return `${name} ${OPERATOR_LABELS[c.operator]}`;
  const opt = src?.options?.find((o) => o.value === String(c.value));
  const value = opt?.label ?? (c.value === undefined || c.value === '' ? '…' : String(c.value));
  return `${name} ${OPERATOR_LABELS[c.operator]}״${value}״`;
}

function checkCondition(c: Condition, owner: string, earlier: Map<string, WorkflowField>, all: Map<string, WorkflowField>, where: { fieldId?: string; stepId?: string }): LogicIssue[] {
  const out: LogicIssue[] = [];
  const src = all.get(c.fieldKey);
  if (!src) return [{ level: 'error', message: `התנאי של ${owner} מתייחס לשדה שכבר לא קיים. בחרו שדה אחר או הסירו את התנאי.`, ...where }];
  if (isDisplayField(src)) return [{ level: 'error', message: `התנאי של ${owner} מתייחס לרכיב תצוגה (״${src.label}״) שהלקוח לא עונה עליו.`, ...where }];
  if (!earlier.has(c.fieldKey)) {
    out.push({
      level: 'error',
      message: where.fieldId && src.id === where.fieldId ? `${owner} לא יכול להיות מותנה בעצמו.` : `${owner} תלוי ב״${src.label}״, שמופיע אחריו — הלקוח עוד לא ענה עליו. העבירו את ״${src.label}״ לפני או בחרו שדה אחר.`,
      ...where,
    });
  }
  if (needsValue(c.operator)) {
    if (c.value === undefined || c.value === '') out.push({ level: 'error', message: `לתנאי של ${owner} חסר ערך להשוואה.`, ...where });
    else if (src.options?.length && ['equals', 'notEquals', 'includes'].includes(c.operator) && !src.options.some((o) => o.value === String(c.value)))
      out.push({ level: 'error', message: `התנאי של ${owner} משווה לאפשרות שכבר לא קיימת ב״${src.label}״.`, ...where });
    else if ((c.operator === 'gt' || c.operator === 'lt') && !Number.isFinite(Number(c.value))) out.push({ level: 'error', message: `התנאי של ${owner} צריך מספר להשוואה.`, ...where });
  }
  if (!operatorsFor(src).includes(c.operator) && !(src.type === 'text' || src.type === 'textarea')) {
    out.push({ level: 'warning', message: `התנאי של ${owner} משתמש בהשוואה שלא מתאימה לסוג השדה ״${src.label}״. כדאי לבחור מחדש.`, ...where });
  }
  return out;
}

/** Finds rules that would break the customer's path. Errors block publishing; warnings inform. */
export function logicIssues(config: WorkflowConfig): LogicIssue[] {
  const issues: LogicIssue[] = [];
  const all = new Map(config.steps.flatMap((s) => s.fields).map((f) => [f.key, f] as const));
  const earlier = new Map<string, WorkflowField>();
  const keys = new Map<string, number>();
  for (const f of config.steps.flatMap((s) => s.fields)) keys.set(f.key, (keys.get(f.key) ?? 0) + 1);
  for (const [k, n] of keys) if (n > 1) issues.push({ level: 'error', message: `המזהה הפנימי ״${k}״ משמש ${n} שדות. שנו את המזהה באחד מהם (הגדרות מתקדמות).` });

  config.steps.forEach((st, si) => {
    const stepName = `השלב ״${st.title || si + 1}״`;
    if (st.condition) issues.push(...checkCondition(st.condition, stepName, earlier, all, { stepId: st.id }));
    if (si === 0 && st.condition) issues.push({ level: 'error', message: 'השלב הראשון לא יכול להיות מותנה — אין עדיין תשובות להתנות בהן.', stepId: st.id });
    for (const f of st.fields) {
      const name = `״${f.label || 'שדה ללא שם'}״`;
      if (f.condition) issues.push(...checkCondition(f.condition, name, earlier, all, { fieldId: f.id }));
      if (f.multiplyByKey) {
        const m = all.get(f.multiplyByKey);
        if (!m) issues.push({ level: 'error', message: `המחיר של ${name} מוכפל בשדה שכבר לא קיים.`, fieldId: f.id });
        else if (m.type !== 'number') issues.push({ level: 'error', message: `המחיר של ${name} מוכפל ב״${m.label}״, שאינו שדה מספר.`, fieldId: f.id });
      }
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) issues.push({ level: 'error', message: `ב${name} הערך המינימלי גדול מהמקסימלי.`, fieldId: f.id });
      if ((f.type === 'radio' || f.type === 'select' || f.type === 'multiselect' || f.type === 'time') && !f.options?.length)
        issues.push({ level: 'error', message: `ל${name} אין אפשרויות לבחירה.`, fieldId: f.id });
      if (f.options?.some((o) => o.price !== undefined && o.price < 0)) issues.push({ level: 'error', message: `ב${name} יש מחיר שלילי.`, fieldId: f.id });
      if (f.type === 'checkbox' && f.required && f.price) issues.push({ level: 'warning', message: `${name} הוא תוספת בתשלום וגם שדה חובה — הלקוח יחויב בה תמיד.`, fieldId: f.id });
      if (!isDisplayField(f)) earlier.set(f.key, f);
    }
  });

  for (const fee of config.pricing.fees) {
    if (fee.condition && !all.has(fee.condition.fieldKey)) issues.push({ level: 'error', message: `העמלה ״${fee.label}״ מותנית בשדה שכבר לא קיים.` });
  }
  if (config.booking?.enabled) {
    for (const [k, label] of [
      [config.booking.dateKey, 'התאריך'],
      [config.booking.timeKey, 'השעה'],
      [config.booking.guestsKey, 'מספר המשתתפים'],
    ] as const) {
      if (k && !all.has(k)) issues.push({ level: 'error', message: `כללי ההזמנה מצביעים על שדה ${label} שכבר לא קיים. בחרו שדה מחדש בהגדרות ״הזמנות ושעות״.` });
    }
  }
  return issues;
}

export interface ReadinessItem {
  id: string;
  ok: boolean;
  level: IssueLevel;
  label: string;
  hint?: string;
}

/** Owner-facing publish checklist. Only `error` items that fail block publishing. */
export function publishReadiness(config: WorkflowConfig): ReadinessItem[] {
  const fields = config.steps.flatMap((s) => s.fields);
  const answerable = fields.filter((f) => !isDisplayField(f));
  const contact = answerable.some((f) => f.role === 'customer_phone' || f.role === 'customer_email' || f.type === 'phone' || f.type === 'email');
  const logic = logicIssues(config);
  const logicErrors = logic.filter((i) => i.level === 'error');
  return [
    { id: 'title', ok: Boolean(config.title.trim()), level: 'error', label: 'לתהליך יש כותרת' },
    { id: 'fields', ok: answerable.length > 0, level: 'error', label: 'יש לפחות שאלה אחת שהלקוח עונה עליה' },
    { id: 'labels', ok: fields.every((f) => f.label.trim()) && config.steps.every((s) => s.title.trim()), level: 'error', label: 'לכל שלב ושדה יש שם' },
    { id: 'logic', ok: logicErrors.length === 0, level: 'error', label: 'התנאים והחישובים תקינים', hint: logicErrors[0]?.message },
    { id: 'contact', ok: contact, level: 'warning', label: 'יש דרך לחזור ללקוח (טלפון או אימייל)', hint: contact ? undefined : 'בלי טלפון או אימייל לא תוכלו לחזור ללקוח.' },
    { id: 'consent', ok: !config.consent.required || Boolean(config.consent.text.trim()), level: 'error', label: 'נוסח אישור לפני שליחה', hint: 'האישור מופעל אבל אין לו נוסח.' },
    { id: 'notes', ok: !config.draftNotes?.length, level: 'warning', label: 'הערות היצירה נבדקו', hint: config.draftNotes?.length ? `${config.draftNotes.length} הערות ממתינות לבדיקה בראש הסטודיו.` : undefined },
  ];
}

export const canPublish = (items: ReadinessItem[]) => items.every((i) => i.ok || i.level !== 'error');
