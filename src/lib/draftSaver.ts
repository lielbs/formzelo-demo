/**
 * Draft autosave, shared by every editor (venue setup, menus, page studio, workflow editor).
 * The rule across the product: drafts save themselves shortly after the last change; only
 * publishing is an explicit action.
 *
 * Framework-free so it can be tested on its own; `useDraftAutosave` wraps it for React.
 *  - `queue(value)` remembers the latest value and saves it after `delay` ms of quiet;
 *  - saves never overlap: a change made while a save is in flight is saved right after it;
 *  - a failed save keeps the value so "try again" (`flush`) resends it; a conflict (someone else
 *    saved a newer version) is reported separately so the screen can offer to reload.
 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export interface DraftSaverOptions<T> {
  /** Sends one value to the server. Throws on failure. */
  save: (value: T) => Promise<void>;
  /** True when the error means "someone else saved a newer version". */
  isConflict?: (error: unknown) => boolean;
  /** Quiet time before saving, in ms (default 700). */
  delay?: number;
  /** Called on every state change. */
  onState?: (state: SaveState, savedAt: Date | null) => void;
}

export class DraftSaver<T> {
  state: SaveState = 'idle';
  savedAt: Date | null = null;
  private pending: { value: T } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<void> | null = null;

  constructor(private readonly options: DraftSaverOptions<T>) {}

  /** Remembers the latest value and schedules a save. */
  queue(value: T): void {
    this.pending = { value };
    this.set('saving');
    this.clearTimer();
    this.timer = setTimeout(() => { void this.flush(); }, this.options.delay ?? 700);
  }

  /** Saves now (waits for a save already in flight). Resolves when nothing is left to send. */
  async flush(): Promise<void> {
    this.clearTimer();
    if (this.inflight) await this.inflight;
    const next = this.pending;
    if (!next) return;
    this.pending = null;
    this.set('saving');
    this.inflight = (async () => {
      try {
        await this.options.save(next.value);
        this.savedAt = new Date();
        this.set(this.pending ? 'saving' : 'saved');
      } catch (error) {
        // Keep the failed value unless a newer one arrived meanwhile.
        this.pending = this.pending ?? next;
        this.set(this.options.isConflict?.(error) ? 'conflict' : 'error');
      } finally {
        this.inflight = null;
      }
    })();
    await this.inflight;
    // A change made during the save: send it too (unless that save just failed).
    if (this.pending && this.state === 'saving') await this.flush();
  }

  /** Drops anything not yet saved (after a conflict, before reloading the server version). */
  discard(): void {
    this.clearTimer();
    this.pending = null;
    this.set('idle');
  }

  /** Something is waiting or being sent (used to warn before leaving the page). */
  get busy(): boolean {
    return this.pending !== null || this.inflight !== null;
  }

  private clearTimer() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  private set(state: SaveState) {
    this.state = state;
    this.options.onState?.(state, this.savedAt);
  }
}
