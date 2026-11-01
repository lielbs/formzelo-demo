import type { WorkflowTheme } from '../domain/theme';
import { SignatureMark } from './SignatureMark';
import { PRESETS } from './presets';
import { ThemeScope } from './ThemeScope';

/** A miniature built from the real theme tokens and component classes (not a static image). */
export function PresetPreview({ theme, tall = false }: { theme: WorkflowTheme; tall?: boolean }) {
  const s = PRESETS[theme.presetId].meta.sample;
  return (
    <ThemeScope theme={theme} className="pointer-events-none select-none overflow-hidden rounded-xl" style={{ background: 'var(--fz-bg)' }}>
      <div className={`relative overflow-hidden ${tall ? 'h-[120px]' : 'h-[68px]'}`} style={{ background: 'var(--fz-hero-bg)', color: 'var(--fz-hero-text)' }}>
        <SignatureMark theme={theme} letter={s.title} />
        <div className={tall ? 'relative p-4' : 'relative p-2.5'}>
          <p className={tall ? 'text-[11px] opacity-75' : 'text-[9px] opacity-75'}>{s.eyebrow}</p>
          <p className={`fz-display mt-0.5 leading-tight ${tall ? 'text-[22px]' : 'text-[15px]'}`}>{s.title}</p>
        </div>
      </div>
      <div className={`flex items-center justify-between gap-2 ${tall ? 'p-4' : 'p-2.5'}`}>
        <span
          className={`fz-option !min-h-0 ${tall ? '!px-3 !py-2 !text-xs' : '!p-1.5 !text-[10px]'}`}
          data-kind={theme.components.option === 'chip' ? 'chip' : 'row'}
          style={{ borderColor: 'var(--fz-primary)', background: 'var(--fz-primary-soft)' }}
        >
          <span className={`fz-opt-label ${tall ? '!text-xs' : '!text-[10px]'}`}>{s.option}</span>
        </span>
        <span className={`fz-btn fz-btn-primary ${tall ? '!min-h-[34px] !px-4 !text-xs' : '!min-h-[26px] !px-2.5 !text-[10px]'}`}>{s.cta}</span>
      </div>
    </ThemeScope>
  );
}
