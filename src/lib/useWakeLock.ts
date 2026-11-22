import { useEffect, useState } from 'react';

/**
 * Keeps the screen on while `enabled` (the host's tablet at the door during a shift). The browser
 * drops the lock when the page is hidden; it is taken again when the page comes back. Browsers
 * without the Screen Wake Lock API simply do nothing.
 */
export function useWakeLock(enabled: boolean): { supported: boolean; active: boolean } {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!enabled || !supported) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const take = async () => {
      if (document.visibilityState !== 'visible' || lock) return;
      try {
        lock = await navigator.wakeLock.request('screen');
        if (gone) { void lock.release(); return; }
        setActive(true);
        lock.addEventListener('release', () => { lock = null; setActive(false); });
      } catch { setActive(false); }
    };
    const onVisible = () => { void take(); };
    void take();
    document.addEventListener('visibilitychange', onVisible);
    return () => { gone = true; document.removeEventListener('visibilitychange', onVisible); void lock?.release().catch(() => undefined); };
  }, [enabled, supported]);
  return { supported, active };
}
