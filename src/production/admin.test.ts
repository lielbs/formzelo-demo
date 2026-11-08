import { describe, expect, it } from 'vitest';
import { isNetworkFailure } from './admin';

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
});
