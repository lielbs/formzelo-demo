import { describe, expect, it } from 'vitest';
import { DomainRuleError, ValidationFailedError } from '../data/repository';
import { throwRuleError } from './ruleErrors';

const caught = (fn: () => void) => { try { fn(); } catch (e) { return e; } return undefined; };

describe('server rule errors', () => {
  it('puts a field rule next to the field the server named', () => {
    const e = caught(() => throwRuleError({ code: 'P0001', message: 'booking_slot_full', hint: 'time' }));
    expect(e).toBeInstanceOf(ValidationFailedError);
    expect((e as ValidationFailedError).errors).toEqual({ time: 'המועד הזה נתפס הרגע. בחרו שעה אחרת.' });
  });
  it('uses the owner closed message for a closed form', () => {
    const e = caught(() => throwRuleError({ code: 'P0001', message: 'intake_day' }, 'חוזרים מחר!'));
    expect(e).toBeInstanceOf(DomainRuleError);
    expect((e as Error).message).toBe('חוזרים מחר!');
  });
  it('explains the rate limit and leaves unknown errors to the caller', () => {
    expect((caught(() => throwRuleError({ code: '54000' })) as Error).message).toMatch(/הרבה בקשות/);
    expect(caught(() => throwRuleError({ code: '42501', message: 'denied' }))).toBeUndefined();
  });
});
