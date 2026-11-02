import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '../../../components/ui';

export type Device = 'mobile' | 'tablet' | 'desktop';

const WIDTH: Record<Device, number> = { mobile: 390, tablet: 768, desktop: 1280 };

export function DeviceToggle({ device, onChange, tablet = false }: { device: Device; onChange: (d: Device) => void; tablet?: boolean }) {
  return (
    <div className="inline-flex rounded-lg bg-cloud-200 p-0.5" role="radiogroup" aria-label="גודל תצוגה">
      {(
        [
          ['mobile', 'טלפון', Smartphone],
          ['tablet', 'טאבלט', Tablet],
          ['desktop', 'מחשב', Monitor],
        ] as const
      )
        .filter(([d]) => tablet || d !== 'tablet')
        .map(([d, label, Icon]) => (
        <button
          key={d}
          type="button"
          role="radio"
          aria-checked={device === d}
          aria-label={label}
          title={label}
          onClick={() => onChange(d)}
          className={cx('inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition', device === d ? 'bg-white text-ink shadow-sm' : 'text-ink-muted hover:text-ink')}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden /> <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Renders children at a real device width and scales the result to fit the
 * panel. The renderer uses container queries, so a 390px frame shows the true
 * phone layout and a 1280px frame the true desktop layout.
 */
export function DevicePreview({ device, height = 720, children }: { device: Device; height?: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(600);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setAvail(Math.floor(entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const inner = WIDTH[device];
  // While the panel is hidden (mobile tab switch) its width is 0; keep a sane scale.
  const scale = avail > 0 ? Math.min(1, avail / inner) : 1;
  return (
    <div ref={outer} className="w-full">
      <div
        className={cx('mx-auto overflow-hidden border border-cloud-300 bg-white shadow-card', device === 'mobile' ? 'rounded-[28px]' : 'rounded-xl')}
        style={{ width: inner * scale, height }}
      >
        <div
          data-fz-scroll
          className="overflow-y-auto overscroll-contain"
          style={{ width: inner, height: height / scale, transform: `scale(${scale})`, transformOrigin: 'top right' }}
        >
          {children}
        </div>
      </div>
      <p className="mt-1.5 text-center text-[11px] text-ink-soft">
        {device === 'mobile' ? 'רוחב טלפון 390px' : `רוחב ${device === 'tablet' ? 'טאבלט 768px' : 'מחשב 1280px'}${scale < 1 ? ` · מוקטן ל-${Math.round(scale * 100)}%` : ''}`}
      </p>
    </div>
  );
}
