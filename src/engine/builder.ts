/**
 * Pure builder operations used by the creation page and the Design Studio:
 * creation paths, field duplication / insertion and undo history. Kept out of
 * React so they are unit-tested and the studio stays a thin view over data.
 */
import { isDisplayField, type WorkflowConfig, type WorkflowField } from '../domain/schema';
import { newId } from '../lib/id';
import { field, step } from './templates';

/** How an owner starts a new workflow. Every option here is implemented. */
export const START_OPTIONS = [
  { id: 'describe', title: 'תיאור במילים שלכם', text: 'כותבים מה הלקוח צריך להזמין, לאשר או למלא — ומקבלים תהליך מוכן לעריכה.' },
  { id: 'template', title: 'תבנית לפי תחום', text: 'עשרות תהליכים מוכנים ב-12 תחומים — מתורים וקייטרינג ועד חוגים, שיפוצים ועמותות.' },
  { id: 'blank', title: 'תהליך ריק', text: 'שלב אחד עם שם וטלפון בלבד. בונים את השאר בעצמכם בסטודיו.' },
  { id: 'duplicate', title: 'שכפול תהליך קיים', text: 'עותק טיוטה של תהליך שכבר עובד אצלכם, כולל העיצוב.' },
] as const;
export type StartOption = (typeof START_OPTIONS)[number]['id'];

/** A minimal, valid starting point: one step with the two contact details every inbox needs. */
export function blankWorkflow(businessName = 'העסק שלי', primaryColor = '#E96B3D'): WorkflowConfig {
  return {
    title: 'תהליך חדש',
    description: '',
    mode: 'public',
    caseFields: [],
    steps: [
      step('פרטי קשר', [
        field('name', 'שם מלא', 'text', { required: true, role: 'customer_name' }),
        field('phone', 'טלפון', 'phone', { required: true, role: 'customer_phone' }),
      ]),
    ],
    pricing: { enabled: false, currency: 'ILS', fees: [], depositPercent: 0, totalLabel: 'סה״כ' },
    branding: { primaryColor, logoText: businessName.slice(0, 40) || 'העסק שלי' },
    consent: { required: false, text: 'אני מאשר/ת יצירת קשר בנוגע לפנייה.' },
    successMessage: 'הפנייה התקבלה. נחזור אליכם בהקדם.',
    completion: { mode: 'request' },
  };
}

export const allFieldsOf = (config: WorkflowConfig) => config.steps.flatMap((s) => s.fields);

/** snake_case key that is not used yet: base, base_2, base_3 … */
export function uniqueFieldKey(existing: Iterable<string>, base: string): string {
  const used = new Set(existing);
  const clean = base.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^[^a-z]+/, '') || 'field';
  if (!used.has(clean)) return clean;
  let i = 2;
  while (used.has(`${clean}_${i}`)) i++;
  return `${clean}_${i}`;
}

/**
 * A copy of a field with fresh ids. Conditions that pointed at the original
 * keep pointing at it — the copy is a sibling, not a replacement.
 */
export function duplicateField(f: WorkflowField, existingKeys: Iterable<string>): WorkflowField {
  const copy = structuredClone(f);
  copy.id = newId('fld');
  copy.key = uniqueFieldKey(existingKeys, `${f.key.replace(/_copy\d*$|_\d+$/, '')}_copy`);
  copy.label = `${f.label} (עותק)`;
  copy.options = copy.options?.map((o) => ({ ...o, id: newId('opt') }));
  copy.items = copy.items?.map((it) => ({ ...it, id: newId('hl') }));
  // Inbox roles identify one field each; the copy is an ordinary field.
  delete copy.role;
  return copy;
}

/** Inserts fields into a step after `afterFieldId` (or at the end). Returns a new config. */
export function insertFields(config: WorkflowConfig, stepId: string, fields: WorkflowField[], afterFieldId?: string): WorkflowConfig {
  const next = structuredClone(config);
  const st = next.steps.find((s) => s.id === stepId);
  if (!st) return config;
  const at = afterFieldId ? st.fields.findIndex((f) => f.id === afterFieldId) : -1;
  st.fields.splice(at >= 0 ? at + 1 : st.fields.length, 0, ...fields);
  return next;
}

/**
 * Fields a condition on `targetId` may depend on: answerable fields that come
 * earlier in the customer's path. Restricting sources to earlier questions
 * makes circular dependencies impossible by construction.
 */
export function earlierAnswerFields(config: WorkflowConfig, target: { fieldId?: string; stepId?: string }): WorkflowField[] {
  const out: WorkflowField[] = [];
  for (const st of config.steps) {
    if (target.stepId && st.id === target.stepId) break;
    for (const f of st.fields) {
      if (f.id === target.fieldId) return out;
      if (!isDisplayField(f)) out.push(f);
    }
  }
  return out;
}

// ---------- undo / redo ----------

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const HISTORY_LIMIT = 60;

export const historyOf = <T>(present: T): History<T> => ({ past: [], present, future: [] });

/** Records a new present. `coalesce` replaces the present without a new undo step (typing). */
export function pushHistory<T>(h: History<T>, next: T, coalesce = false): History<T> {
  if (coalesce) return { ...h, present: next, future: [] };
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [] };
}

export function undoHistory<T>(h: History<T>): History<T> {
  const prev = h.past[h.past.length - 1];
  if (prev === undefined) return h;
  return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future].slice(0, HISTORY_LIMIT) };
}

export function redoHistory<T>(h: History<T>): History<T> {
  const [next, ...rest] = h.future;
  if (next === undefined) return h;
  return { past: [...h.past, h.present], present: next, future: rest };
}
