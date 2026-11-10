import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { cx } from './ui';

type ToastTone = 'success' | 'error' | 'info';
interface ToastAction {
  label: string;
  onClick: () => void;
}
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

const ToastContext = createContext<(message: string, tone?: ToastTone, action?: ToastAction) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, tone: ToastTone = 'success', action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { id, message, tone, action }]);
    // Toasts with an action (e.g. undo) stay longer so there is time to use it.
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), action ? 7000 : 3600);
  }, []);
  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--fz-tabbar,0px)+1rem)] z-[60] flex flex-col items-center gap-2 px-4">
        {items.map((t) => {
          const Icon = icons[t.tone];
          return (
            <div
              key={t.id}
              role={t.tone === 'error' ? 'alert' : 'status'}
              className={cx(
                'pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lift animate-fade-up',
                t.tone === 'error' ? 'bg-red-700 text-white' : 'bg-midnight text-white',
              )}
            >
              <Icon className={cx('h-4 w-4', t.tone === 'success' && 'text-teal-50')} aria-hidden />
              {t.message}
              {t.action && (
                <button
                  type="button"
                  className="ms-2 rounded-lg bg-white/15 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  onClick={() => {
                    t.action!.onClick();
                    setItems((xs) => xs.filter((x) => x.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/** Copies text with a graceful fallback when the Clipboard API is unavailable (non-secure contexts). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
