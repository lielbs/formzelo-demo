import { describe, expect, it } from 'vitest';
import { generateWorkflowFromPrompt, namedServices, weekdayRange } from '../engine/generator';
import { readRules } from '../engine/rules';

const NOW = new Date('2026-11-04T10:00:00');

describe('reading operating rules from plain Hebrew', () => {
  it('days, hours and slot length', () => {
    expect(readRules('פתוחים בימים א-ה בין 9 ל-18, תור של חצי שעה', NOW)).toMatchObject({ weekdays: [0, 1, 2, 3, 4] });
    expect(readRules('בין 9 ל-18, תור של חצי שעה', NOW).slots).toHaveLength(18);
    expect(readRules('עובדים ראשון עד חמישי כולל שישי, 10:00-14:00', NOW)).toMatchObject({ weekdays: [0, 1, 2, 3, 4, 5], slots: ['10:00', '11:00', '12:00', '13:00'] });
    expect(readRules('א׳-ו׳ חוץ משישי', NOW).weekdays).toEqual([0, 1, 2, 3, 4]);
  });

  it('limits, notice, how far ahead, a closing date and duplicates', () => {
    const r = readRules('עד 10 תורים ביום, לפחות 24 שעות מראש, עד חודש קדימה, הרשמה עד 15.12, בלי כפילויות', NOW);
    expect(r).toMatchObject({ perDay: 10, noticeHours: 24, daysAhead: 30, closesOn: '2026-12-15', onePerContact: true });
    expect(readRules('מקסימום עשרים בקשות בשבוע ויום מראש', NOW)).toMatchObject({ perWeek: 20, noticeHours: 24 });
    expect(readRules('ההרשמה נסגרת ב-1.3', NOW).closesOn).toBe('2027-03-01');
    expect(readRules('מספרה שרוצה שלקוחות יקבעו תור', NOW).understood).toEqual([]);
  });
});

describe('describe-in-words generation', () => {
  it('a barber gets the services they wrote, one customer per appointment', () => {
    const g = generateWorkflowFromPrompt('מספרה שרוצה שלקוחות יקבעו תור לתספורת או צבע');
    const fields = g.config.steps.flatMap((s) => s.fields);
    expect(fields.find((f) => f.key === 'service')!.options!.map((o) => o.label)).toEqual(['תספורת', 'צבע']);
    expect(fields.some((f) => f.key === 'party_size')).toBe(false);
    expect(g.config.booking!.guestsKey).toBeUndefined();
    expect(g.reviewNotes.join(' ')).not.toMatch(/לדוגמה/);
  });

  it('applies the hours, days and limits the owner wrote', () => {
    const g = generateWorkflowFromPrompt('קוסמטיקאית, טיפול פנים ואיפור, בימים א-ה בין 10 ל-19, עד 8 תורים ביום, לפחות 12 שעות מראש');
    const b = g.config.booking!;
    expect(b).toMatchObject({ openWeekdays: [0, 1, 2, 3, 4], maxPerDay: 8, minNoticeHours: 12 });
    expect(b.slots[0]).toBe('10:00');
    expect(g.config.steps.flatMap((s) => s.fields).find((f) => f.key === b.timeKey)!.options!.map((o) => o.value)).toEqual(b.slots);
    expect(g.understood.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps group size for group bookings and sends registration limits to intake', () => {
    expect(generateWorkflowFromPrompt('מסעדה שרוצה לקבל הזמנות שולחן עם תאריך, שעה ומספר סועדים').config.steps.flatMap((s) => s.fields).some((f) => f.key === 'party_size')).toBe(true);
    const reg = generateWorkflowFromPrompt('הרשמה לסדנת קרמיקה, ההרשמה נסגרת ב-20.12, הרשמה אחת לכל משתתף');
    expect(reg.intake).toMatchObject({ closesOn: expect.stringMatching(/-12-20$/), onePerContact: true });
    expect(namedServices('ציפורניים: מניקור, פדיקור ולק ג׳ל')).toEqual(['מניקור', 'פדיקור', 'לק ג׳ל']);
    expect(weekdayRange([0, 1, 2, 3, 4])).toBe('א׳–ה׳');
    expect(weekdayRange([0, 2, 4])).toBe('א׳, ג׳, ה׳');
  });
});
