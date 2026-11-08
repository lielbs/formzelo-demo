import { describe, expect, it } from 'vitest';
import { isNetworkFailure, UnexpectedServerError } from './serverErrors';

describe('operator error explanations', () => {
  it('recognises a request that never got an answer', () => {
    expect(isNetworkFailure({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' })).toBe(true);
    expect(isNetworkFailure({ message: 'TypeError: Failed to fetch' })).toBe(true);
    expect(isNetworkFailure({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
    expect(isNetworkFailure({ message: 'Load failed' })).toBe(true);
  });

  it('does not mistake a server answer for a network failure', () => {
    expect(isNetworkFailure({ name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code' })).toBe(false);
    expect(isNetworkFailure({ message: 'already_member' })).toBe(false);
    expect(isNetworkFailure(null)).toBe(false);
  });

  it('shows Hebrew to the person and keeps the technical context', () => {
    const error = new UnexpectedServerError('Unable to load team');
    expect(error.message).not.toMatch(/[a-z]/i);
    expect(error.context).toBe('Unable to load team');
    expect(new UnexpectedServerError('x', true).message).toContain('אין חיבור לשרת');
  });
});
