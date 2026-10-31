import { describe, expect, it } from 'vitest';
import { buildSeed } from '../data/seed';
import { WorkflowConfigSchema, type WorkflowConfig } from '../domain/schema';
import {
  blankWorkflow,
  duplicateField,
  earlierAnswerFields,
  historyOf,
  insertFields,
  pushHistory,
  redoHistory,
  START_OPTIONS,
  undoHistory,
  uniqueFieldKey,
} from '../engine/builder';
import { generateWorkflowFromPrompt } from '../engine/generator';
import { canPublish, describeCondition, logicIssues, operatorsFor, publishReadiness } from '../engine/logic';
import { computePrice } from '../engine/pricing';
import { TEMPLATES, type TemplateKey } from '../engine/templates';
import { BLOCK_GROUPS, BLOCKS, createBlocks } from '../pages/app/editor/blockLibrary';

const clone = <T,>(x: T) => structuredClone(x);

describe('creation paths', () => {
  it('offers only implemented start options', () => {
    expect(START_OPTIONS.map((o) => o.id)).toEqual(['describe', 'template', 'blank', 'duplicate']);
  });

  it('blank workflow is schema-valid, minimal and publishable', () => {
    const c = blankWorkflow('Studio Noa', '#123456');
    expect(WorkflowConfigSchema.safeParse(c).success).toBe(true);
    expect(c.steps).toHaveLength(1);
    expect(c.steps[0]!.fields.map((f) => f.role)).toEqual(['customer_name', 'customer_phone']);
    expect(c.branding).toEqual({ primaryColor: '#123456', logoText: 'Studio Noa' });
    expect(canPublish(publishReadiness(c))).toBe(true);
  });

  it('every template and every seeded workflow passes the logic checker', () => {
    for (const k of Object.keys(TEMPLATES) as TemplateKey[]) {
      const errors = logicIssues(TEMPLATES[k].build()).filter((i) => i.level === 'error');
      expect(errors, k).toEqual([]);
    }
    for (const org of buildSeed()) {
      for (const w of org.workflows) expect(logicIssues(w.draft).filter((i) => i.level === 'error'), w.slug).toEqual([]);
      for (const v of org.versions) expect(logicIssues(v.config).filter((i) => i.level === 'error'), v.id).toEqual([]);
    }
  });

  it('generated workflows from descriptions are valid and pass the checker', () => {
    for (const p of ['הזמנת עוגות עם בחירת טעם, גודל ומשלוח', 'הרשמה לסדנה עם 2 מועדים, עד 12 משתתפים, באישור ידני', 'תיאום טיפול במספרה עם בחירת שירות ושעה']) {
      const r = generateWorkflowFromPrompt(p);
      expect(WorkflowConfigSchema.safeParse(r.config).success, p).toBe(true);
      expect(logicIssues(r.config).filter((i) => i.level === 'error'), p).toEqual([]);
    }
  });
});

describe('field library', () => {
  it('is organized into basic, business, presentation and advanced groups', () => {
    expect(BLOCK_GROUPS.map((g) => g.id)).toEqual(['basic', 'business', 'presentation', 'advanced']);
    for (const g of BLOCK_GROUPS) expect(BLOCKS.some((b) => b.group === g.id), g.id).toBe(true);
    const labels = BLOCKS.map((b) => b.label);
    for (const l of ['טקסט קצר', 'טקסט ארוך', 'אימייל', 'טלפון', 'מספר', 'בחירה אחת', 'בחירה מרובה', 'רשימה נפתחת', 'תאריך', 'שעה']) expect(labels).toContain(l);
    for (const l of ['פרטי לקוח', 'כתובת', 'בקשת הזמנה', 'אישור / דחייה', 'אישור תנאים']) expect(labels).toContain(l);
  });

  it('marks unsupported capabilities instead of simulating them', () => {
    const sig = BLOCKS.find((b) => b.id === 'signature')!;
    expect(sig.unavailable).toMatch(/לא זמין/);
    const file = BLOCKS.find((b) => b.id === 'file')!;
    expect(file.label).toMatch(/דמו|שם הקובץ/);
  });

  it('every available block produces schema-valid fields with unique keys', () => {
    const keys: string[] = [];
    const base = blankWorkflow();
    let config = base;
    for (const b of BLOCKS.filter((x) => !x.unavailable && !x.action)) {
      const fields = createBlocks(b, [...keys, ...base.steps[0]!.fields.map((f) => f.key)]);
      expect(fields.length).toBeGreaterThan(0);
      keys.push(...fields.map((f) => f.key));
      config = insertFields(config, config.steps[0]!.id, fields);
    }
    expect(new Set(keys).size).toBe(keys.length);
    const parsed = WorkflowConfigSchema.safeParse(config);
    expect(parsed.success, JSON.stringify(parsed.error?.issues.slice(0, 2))).toBe(true);
  });

  it('customer details inserts name, phone and email with inbox roles', () => {
    const fields = createBlocks(BLOCKS.find((b) => b.id === 'customer')!, []);
    expect(fields.map((f) => f.type)).toEqual(['text', 'phone', 'email']);
    expect(fields.map((f) => f.role)).toEqual(['customer_name', 'customer_phone', 'customer_email']);
  });

  it('insertFields places new fields right after the selected one', () => {
    const c = blankWorkflow();
    const [first] = c.steps[0]!.fields;
    const added = createBlocks(BLOCKS.find((b) => b.id === 'textarea')!, ['name', 'phone']);
    const next = insertFields(c, c.steps[0]!.id, added, first!.id);
    expect(next.steps[0]!.fields.map((f) => f.key)).toEqual(['name', added[0]!.key, 'phone']);
    expect(c.steps[0]!.fields).toHaveLength(2); // original untouched
  });
});

describe('editing fields', () => {
  it('duplicates with fresh ids, a unique key and no inbox role', () => {
    const c = TEMPLATES.flower_order.build();
    const all = c.steps.flatMap((s) => s.fields);
    const src = all.find((f) => f.options && f.options.length > 1)!;
    const copy = duplicateField(src, all.map((f) => f.key));
    expect(copy.id).not.toBe(src.id);
    expect(all.map((f) => f.key)).not.toContain(copy.key);
    expect(copy.options!.map((o) => o.id)).not.toEqual(src.options!.map((o) => o.id));
    expect(copy.options!.map((o) => [o.label, o.price])).toEqual(src.options!.map((o) => [o.label, o.price]));
    expect(copy.label).toContain('עותק');
    const named = duplicateField(all.find((f) => f.role === 'customer_name')!, all.map((f) => f.key));
    expect(named.role).toBeUndefined();
  });

  it('uniqueFieldKey sanitizes and avoids collisions', () => {
    expect(uniqueFieldKey(['a', 'a_2'], 'a')).toBe('a_3');
    expect(uniqueFieldKey([], 'Hello World!')).toBe('hello_world_');
    expect(uniqueFieldKey([], '123')).toBe('field');
  });

  it('undo / redo restores exact snapshots and drops redo after a new edit', () => {
    let h = historyOf({ n: 0 });
    h = pushHistory(h, { n: 1 });
    h = pushHistory(h, { n: 2 });
    h = pushHistory(h, { n: 3 }, true); // coalesced typing
    expect(h.past.map((x) => x.n)).toEqual([0, 1]);
    h = undoHistory(h);
    expect(h.present.n).toBe(1);
    h = undoHistory(h);
    expect(h.present.n).toBe(0);
    expect(undoHistory(h)).toBe(h);
    h = redoHistory(h);
    expect(h.present.n).toBe(1);
    h = pushHistory(h, { n: 9 });
    expect(h.future).toEqual([]);
    expect(redoHistory(h)).toBe(h);
  });

  it('field configuration survives a save round-trip through the schema', () => {
    const c = TEMPLATES.restaurant_event.build();
    const parsed = WorkflowConfigSchema.parse(JSON.parse(JSON.stringify(c)));
    expect(parsed.steps.flatMap((s) => s.fields).map((f) => [f.key, f.condition, f.multiplyByKey, f.options?.length])).toEqual(
      c.steps.flatMap((s) => s.fields).map((f) => [f.key, f.condition, f.multiplyByKey, f.options?.length]),
    );
  });
});

describe('logic', () => {
  const twoStep = (): WorkflowConfig => {
    const c = blankWorkflow();
    c.steps[0]!.fields.push({ id: 'f_type', key: 'type', label: 'סוג האירוע', type: 'radio', required: true, options: [{ id: 'o1', label: 'פרטי', value: 'private' }, { id: 'o2', label: 'עסקי', value: 'business' }] });
    c.steps.push({ id: 's2', title: 'פרטים', fields: [{ id: 'f_co', key: 'company', label: 'שם החברה', type: 'text', required: true, condition: { fieldKey: 'type', operator: 'equals', value: 'business' } }] });
    return c;
  };

  it('accepts a valid condition and reads it in plain Hebrew', () => {
    const c = twoStep();
    expect(logicIssues(c)).toEqual([]);
    expect(describeCondition(c.steps[1]!.fields[0]!.condition!, c.steps.flatMap((s) => s.fields))).toBe('״סוג האירוע״ שווה ל״עסקי״');
  });

  it('only offers earlier questions as condition sources (no cycles)', () => {
    const c = twoStep();
    expect(earlierAnswerFields(c, { fieldId: 'f_co' }).map((f) => f.key)).toEqual(['name', 'phone', 'type']);
    expect(earlierAnswerFields(c, { fieldId: 'f_type' }).map((f) => f.key)).toEqual(['name', 'phone']);
    expect(earlierAnswerFields(c, { stepId: 's2' }).map((f) => f.key)).toEqual(['name', 'phone', 'type']);
  });

  it('detects circular, forward, self and missing references', () => {
    const c = twoStep();
    c.steps[0]!.fields[2]!.condition = { fieldKey: 'company', operator: 'notEmpty' }; // depends on a later field → cycle
    expect(logicIssues(c).some((i) => i.level === 'error' && i.message.includes('מופיע אחריו'))).toBe(true);
    const self = twoStep();
    self.steps[1]!.fields[0]!.condition = { fieldKey: 'company', operator: 'notEmpty' };
    expect(logicIssues(self).some((i) => i.message.includes('בעצמו'))).toBe(true);
    const gone = twoStep();
    gone.steps[0]!.fields.splice(2, 1);
    expect(logicIssues(gone).some((i) => i.message.includes('כבר לא קיים'))).toBe(true);
  });

  it('detects stale option values, missing values and bad price multipliers', () => {
    const c = twoStep();
    c.steps[1]!.fields[0]!.condition = { fieldKey: 'type', operator: 'equals', value: 'deleted_option' };
    expect(logicIssues(c).some((i) => i.message.includes('אפשרות שכבר לא קיימת'))).toBe(true);
    c.steps[1]!.fields[0]!.condition = { fieldKey: 'type', operator: 'equals' };
    expect(logicIssues(c).some((i) => i.message.includes('חסר ערך'))).toBe(true);
    const m = twoStep();
    m.steps[0]!.fields[2]!.multiplyByKey = 'name';
    expect(logicIssues(m).some((i) => i.message.includes('אינו שדה מספר'))).toBe(true);
    const first = twoStep();
    first.steps[0]!.condition = { fieldKey: 'type', operator: 'notEmpty' };
    expect(logicIssues(first).some((i) => i.message.includes('השלב הראשון'))).toBe(true);
  });

  it('detects duplicate keys, inverted limits and broken booking references', () => {
    const c = twoStep();
    c.steps[1]!.fields.push({ ...c.steps[1]!.fields[0]!, id: 'dup' });
    c.steps[0]!.fields.push({ id: 'n', key: 'guests', label: 'אורחים', type: 'number', required: false, min: 10, max: 2 });
    c.booking = { enabled: true, dateKey: 'nope', openWeekdays: [0], slots: [], capacityPerSlot: 1, capacityUnit: 'bookings' };
    const msgs = logicIssues(c).map((i) => i.message).join('\n');
    expect(msgs).toContain('משמש 2 שדות');
    expect(msgs).toContain('המינימלי גדול');
    expect(msgs).toContain('כללי ההזמנה');
  });

  it('suggests operators that fit the source field type', () => {
    expect(operatorsFor({ type: 'checkbox' })).toEqual(['isTrue', 'isFalse']);
    expect(operatorsFor({ type: 'number' })).toContain('gt');
    expect(operatorsFor({ type: 'multiselect' })).toContain('includes');
    expect(operatorsFor({ type: 'radio' })).not.toContain('gt');
  });

  it('publish readiness blocks errors, allows warnings', () => {
    const c = blankWorkflow();
    c.steps[0]!.fields = c.steps[0]!.fields.filter((f) => f.type !== 'phone');
    const items = publishReadiness(c);
    expect(items.find((i) => i.id === 'contact')!.ok).toBe(false);
    expect(canPublish(items)).toBe(true); // warning only
    c.steps[0]!.fields = [];
    expect(canPublish(publishReadiness(c))).toBe(false);
  });

  it('price calculation is unchanged by the builder helpers (integrity)', () => {
    const c = TEMPLATES.restaurant_event.build();
    const fields = c.steps.flatMap((s) => s.fields);
    const menu = fields.find((f) => f.multiplyByKey)!;
    const guests = fields.find((f) => f.key === menu.multiplyByKey)!;
    const values = { [guests.key]: 20, [menu.key]: menu.options![0]!.value };
    const before = computePrice(c, values).total;
    const copy = duplicateField(menu, fields.map((f) => f.key));
    const withCopy = insertFields(clone(c), c.steps[0]!.id, [copy]);
    expect(computePrice(withCopy, values).total).toBe(before); // unanswered copy adds nothing
    expect(before).toBe(20 * menu.options![0]!.price!);
  });
});
