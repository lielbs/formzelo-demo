/**
 * App-style confirmation, replacing the browser's `window.confirm`: a sheet that rises from the
 * bottom on phones and a centred alert on larger screens, with the destructive choice in red and
 * an optional "type the name to confirm" guard for things that cannot be undone.
 *
 *   if (await confirmAction({ title: 'למחוק את התהליך?', confirmLabel: 'מחיקה', destructive: true })) …
 *
 * Mount <ConfirmHost /> once near the root. Calls queue: one dialog at a time.
 */
import { AlertTriangle, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { cx } from './ui';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** The person must type this exact text (e.g. the venue name) before the action unlocks. */
  typeToConfirm?: string;
  /** Runs before the dialog closes; a thrown error is shown in the dialog and it stays open. */
  action?: () => Promise<void>;
}

interface Pending extends ConfirmOptions { resolve: (ok: boolean) => void }

let queue: Pending[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const current = () => queue[0] ?? null;

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    queue = [...queue, { ...options, resolve }];
    emit();
  });
}

function settle(ok: boolean) {
  const [head, ...rest] = queue;
  if (!head) return;
  queue = rest;
  head.resolve(ok);
  emit();
}

const normal = (s: string) => s.trim().replace(/\s+/g, ' ');

export function ConfirmHost() {
  const dialog = useSyncExternalStore(subscribe, current, current);
  return dialog ? <ConfirmDialog key={queue.length + dialog.title} dialog={dialog} /> : null;
}

function ConfirmDialog({ dialog }: { dialog: Pending }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState<boolean | null>(null);
  const locked = !!dialog.typeToConfirm && normal(typed) !== normal(dialog.typeToConfirm);

  const close = (ok: boolean) => {
    if (busy) return;
    setLeaving(ok);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => settle(ok), reduce ? 0 : 170);
  };

  const confirm = async () => {
    if (locked || busy) return;
    if (dialog.action) {
      setBusy(true);
      setError('');
      try {
        await dialog.action();
      } catch (e) {
        setBusy(false);
        setError(e instanceof Error ? e.message : String(e));
        return;
      }
      setBusy(false);
    }
    setLeaving(true);
    window.setTimeout(() => settle(true), 170);
  };

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => {
      const first = panel.current?.querySelector<HTMLElement>(dialog.typeToConfirm ? 'input' : '[data-cancel]');
      first?.focus();
    }, 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(false); return; }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),input')];
      if (!items.length) return;
      const first = items[0]!; const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fz-confirm" data-leaving={leaving === null ? undefined : ''} role="presentation">
      <button type="button" aria-label="ביטול" tabIndex={-1} className="fz-confirm-scrim" onClick={() => close(false)} />
      <div ref={panel} role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="fz-confirm-panel" dir="rtl">
        <span aria-hidden className="fz-confirm-grip" />
        {dialog.destructive && (
          <span aria-hidden className="fz-confirm-icon"><AlertTriangle className="h-6 w-6" /></span>
        )}
        <h2 id={titleId} className="text-[19px] font-semibold leading-snug text-ink [text-wrap:balance]">{dialog.title}</h2>
        {dialog.message && <div className="mt-2 text-[15px] leading-relaxed text-ink-muted [text-wrap:pretty]">{dialog.message}</div>}
        {dialog.typeToConfirm && (
          <label className="mt-4 block text-start text-sm text-ink-muted">
            כדי לאשר, הקלידו <b className="font-semibold text-ink">{dialog.typeToConfirm}</b>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void confirm(); }}
              autoComplete="off"
              spellCheck={false}
              className="fz-confirm-input"
              aria-label={`הקלידו ${dialog.typeToConfirm}`}
            />
          </label>
        )}
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-start text-sm text-red-800">{error}</p>}
        <div className="fz-confirm-actions">
          <button type="button" onClick={() => void confirm()} disabled={locked || busy}
            className={cx('fz-confirm-btn', dialog.destructive ? 'fz-confirm-danger' : 'fz-confirm-primary')}>
            {busy ? <span className="fz-confirm-spin" aria-label="מבצע…" /> : (dialog.confirmLabel ?? 'אישור')}
          </button>
          <button type="button" data-cancel onClick={() => close(false)} disabled={busy} className="fz-confirm-btn fz-confirm-cancel">
            {dialog.cancelLabel ?? 'ביטול'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Action sheet: a short list of choices about one item ----------

export interface SheetOption {
  key: string;
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  hint?: string;
}

interface PendingSheet { title?: string; message?: string; options: SheetOption[]; resolve: (key: string | null) => void }

let sheets: PendingSheet[] = [];
const sheetListeners = new Set<() => void>();
const sheetEmit = () => sheetListeners.forEach((l) => l());
const sheetSubscribe = (l: () => void) => { sheetListeners.add(l); return () => { sheetListeners.delete(l); }; };
const currentSheet = () => sheets[0] ?? null;

/** Resolves with the chosen option's key, or null when dismissed. */
export function chooseAction(input: Omit<PendingSheet, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => { sheets = [...sheets, { ...input, resolve }]; sheetEmit(); });
}

export function ActionSheetHost() {
  const sheet = useSyncExternalStore(sheetSubscribe, currentSheet, currentSheet);
  return sheet ? <ActionSheet key={sheets.length + (sheet.title ?? '')} sheet={sheet} /> : null;
}

function ActionSheet({ sheet }: { sheet: PendingSheet }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const done = (key: string | null) => {
    if (leaving) return;
    setLeaving(true);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
      const [head, ...rest] = sheets;
      sheets = rest;
      head?.resolve(key);
      sheetEmit();
    }, reduce ? 0 : 160);
  };
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => panel.current?.querySelector<HTMLElement>('button')?.focus(), 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); done(null); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { window.clearTimeout(t); document.removeEventListener('keydown', onKey, true); prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="fz-confirm fz-sheet" data-leaving={leaving ? '' : undefined} role="presentation">
      <button type="button" aria-label="סגירה" tabIndex={-1} className="fz-confirm-scrim" onClick={() => done(null)} />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={sheet.title ? titleId : undefined} aria-label={sheet.title ? undefined : 'פעולות'} className="fz-sheet-panel" dir="rtl">
        <div className="fz-sheet-group">
          {(sheet.title || sheet.message) && (
            <div className="fz-sheet-head">
              {sheet.title && <p id={titleId} className="line-clamp-2 break-words text-[13px] font-semibold">{sheet.title}</p>}
              {sheet.message && <p className="mt-0.5 text-[13px]">{sheet.message}</p>}
            </div>
          )}
          {sheet.options.map((o) => {
            const Icon = o.icon;
            return (
              <button key={o.key} type="button" onClick={() => done(o.key)} className={cx('fz-sheet-opt', o.destructive && 'fz-sheet-danger')}>
                {Icon && <Icon className="h-5 w-5 shrink-0" aria-hidden />}
                <span className="min-w-0 flex-1 text-start">
                  <span className="block">{o.label}</span>
                  {o.hint && <span className="fz-sheet-hint block">{o.hint}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => done(null)} className="fz-sheet-cancel">ביטול</button>
      </div>
    </div>
  );
}
