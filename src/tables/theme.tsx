/**
 * Light / dark display for Formangle Tables screens. The choice is per device (light, dark, or
 * follow the device), defaults to following the device, and applies only while a Tables screen
 * is mounted — leaving Tables restores the normal Formangle look.
 */
import { Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { cx } from '../components/ui';
import './tables.css';

export type ThemePref = 'system' | 'light' | 'dark';
const KEY = 'fz_tables_theme';
const listeners = new Set<(p: ThemePref) => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function setThemePref(p: ThemePref) {
  try { if (p === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, p); } catch { /* storage unavailable: still applies for this visit */ }
  listeners.forEach((l) => l(p));
}

const systemDark = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;

/** Theme choice and resolved darkness; no side effects (safe in any number of components). */
export function useThemePref(): { pref: ThemePref; dark: boolean; setPref: (p: ThemePref) => void } {
  const [pref, setPref] = useState<ThemePref>(readPref);
  const [sys, setSys] = useState(systemDark);
  useEffect(() => {
    listeners.add(setPref);
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const on = () => setSys(!!mq?.matches);
    mq?.addEventListener?.('change', on);
    return () => { listeners.delete(setPref); mq?.removeEventListener?.('change', on); };
  }, []);
  const dark = pref === 'dark' || (pref === 'system' && sys);
  return { pref, dark, setPref: setThemePref };
}

/** Applies the theme to the document while the calling screen is mounted (one per screen). */
export function useTablesTheme() {
  const t = useThemePref();
  useEffect(() => {
    const html = document.documentElement;
    html.classList.toggle('fz-dark', t.dark);
    return () => { html.classList.remove('fz-dark'); };
  }, [t.dark]);
  return t;
}

const LABELS: Record<'he' | 'en', Record<ThemePref, string>> = {
  he: { system: 'לפי המכשיר', light: 'בהירה', dark: 'כהה' },
  en: { system: 'Device', light: 'Light', dark: 'Dark' },
};
const ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

/** Compact control: one button that cycles device → light → dark, with a spoken state. */
export function ThemeButton({ lang = 'he', className }: { lang?: 'he' | 'en'; className?: string }) {
  const { pref, setPref } = useThemePref();
  const next: ThemePref = pref === 'system' ? 'light' : pref === 'light' ? 'dark' : 'system';
  const Icon = ICONS[pref];
  const label = lang === 'he' ? `תצוגה: ${LABELS.he[pref]}. מעבר ל${LABELS.he[next]}` : `Display: ${LABELS.en[pref]}. Switch to ${LABELS.en[next]}`;
  return (
    <button type="button" onClick={() => setPref(next)} aria-label={label} title={label}
      className={cx('inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-cloud-300 bg-white px-3 text-sm text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange', className)}>
      <Icon className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{lang === 'he' ? 'תצוגה' : 'Display'}: {LABELS[lang][pref]}</span>
    </button>
  );
}

/**
 * Root of every Tables screen: applies the theme and the scope used by tables.css. The light/dark
 * switch lives where it matters (the host shift and the guest pages); owner screens follow the
 * saved choice without a toggle of their own taking a row of the page.
 */
export function TablesRoot({ children }: { children: ReactNode; owner?: boolean }) {
  useTablesTheme();
  return <div className="fz-tables">{children}</div>;
}
