import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftSaver, type SaveState } from './draftSaver';

const deferred = () => {
  let resolve!: () => void; let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

describe('DraftSaver', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('saves once, after the quiet period, with the latest value', async () => {
    const saved: number[] = [];
    const s = new DraftSaver<number>({ save: async (v) => { saved.push(v); } });
    s.queue(1); s.queue(2); s.queue(3);
    expect(s.state).toBe('saving');
    await vi.advanceTimersByTimeAsync(699);
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual([3]);
    expect(s.state).toBe('saved');
    expect(s.savedAt).toBeInstanceOf(Date);
    expect(s.busy).toBe(false);
  });

  it('never overlaps saves and sends a change made during a save right after it', async () => {
    const calls: number[] = [];
    const gates: ReturnType<typeof deferred>[] = [];
    const s = new DraftSaver<number>({ save: (v) => { calls.push(v); const g = deferred(); gates.push(g); return g.promise; } });
    s.queue(1);
    const first = s.flush();
    s.queue(2); // arrives while 1 is in flight
    const second = s.flush();
    expect(calls).toEqual([1]);
    gates[0]!.resolve();
    await Promise.resolve(); await Promise.resolve();
    await vi.waitFor(() => expect(calls).toEqual([1, 2]));
    gates[1]!.resolve();
    await first; await second;
    expect(s.state).toBe('saved');
  });

  it('keeps the value after a failure and resends it on retry', async () => {
    let fail = true;
    const saved: string[] = [];
    const states: SaveState[] = [];
    const s = new DraftSaver<string>({ save: async (v) => { if (fail) throw new Error('offline'); saved.push(v); }, onState: (st) => states.push(st) });
    s.queue('a');
    await s.flush();
    expect(s.state).toBe('error');
    expect(s.busy).toBe(true);
    fail = false;
    await s.flush();
    expect(saved).toEqual(['a']);
    expect(s.state).toBe('saved');
    expect(states).toContain('error');
  });

  it('reports a conflict separately, and discard drops the unsaved value', async () => {
    const save = vi.fn(async () => { throw Object.assign(new Error('stale'), { conflict: true }); });
    const s = new DraftSaver<number>({ save, isConflict: (e) => (e as { conflict?: boolean }).conflict === true });
    s.queue(7);
    await s.flush();
    expect(s.state).toBe('conflict');
    s.discard();
    expect(s.state).toBe('idle');
    expect(s.busy).toBe(false);
    await s.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('flush with nothing queued does nothing', async () => {
    const save = vi.fn(async () => {});
    const s = new DraftSaver<number>({ save });
    await s.flush();
    expect(save).not.toHaveBeenCalled();
    expect(s.state).toBe('idle');
  });
});
