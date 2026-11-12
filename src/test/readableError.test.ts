import { describe, expect, it } from 'vitest';
import { readableError } from '../components/ui';

describe('error messages people see', () => {
  it('keeps short Hebrew messages and hides technical ones', () => {
    expect(readableError('המקום עוד לא פורסם.')).toBe('המקום עוד לא פורסם.');
    expect(readableError(new Error('אין הרשאה למקום הזה'))).toBe('אין הרשאה למקום הזה');
    const generic = 'לא הצלחנו לטעון את המידע הזה. נסו שוב בעוד רגע.';
    expect(readableError(new Error('[{"code":"invalid_type","expected":"string","path":["palette","secondary"]}]'))).toBe(generic);
    expect(readableError(new Error('Failed to fetch'))).toBe(generic);
    expect(readableError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(generic);
    expect(readableError('')).toBe(generic);
  });
});
