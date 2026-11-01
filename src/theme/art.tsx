/**
 * Original, local SVG artwork. Everything is drawn here in code — no remote
 * images, no stock photos. Colors come from theme tokens, so the same art
 * adapts to every palette. Option art is labeled as illustrative in the UI.
 */
import { useId, type CSSProperties, type ReactElement } from 'react';
import type { FieldOption, WorkflowField } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { normalizeHebrew } from '../engine/hebrew';

const P = 'var(--fz-primary)';
const A = 'var(--fz-accent)';
const S = 'var(--fz-secondary)';
const T = 'var(--fz-text)';
const SURF = 'var(--fz-surface)';
const ALT = 'var(--fz-surface-alt)';

// ---------- option illustrations ----------

/** One bloom: a ring of soft petals, an inner ring and a centre. */
function Bloom({ x, y, r, color, turn }: { x: number; y: number; r: number; color: string; turn: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${turn})`}>
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <ellipse key={a} cx="0" cy={-r * 0.55} rx={r * 0.42} ry={r * 0.62} fill={color} opacity={0.9} transform={`rotate(${a})`} />
      ))}
      {[30, 150, 270].map((a) => (
        <ellipse key={a} cx="0" cy={-r * 0.3} rx={r * 0.3} ry={r * 0.42} fill={color} transform={`rotate(${a})`} />
      ))}
      <circle r={r * 0.24} fill={SURF} opacity={0.75} />
      <circle r={r * 0.11} fill={T} opacity={0.35} />
    </g>
  );
}

// Dome of bloom positions, filled from the centre outwards.
const BLOOMS: [number, number, number][] = [
  [60, 40, 15],
  [40, 50, 13],
  [80, 50, 13],
  [60, 20, 11],
  [24, 62, 10.5],
  [96, 62, 10.5],
  [50, 64, 10],
  [70, 64, 10],
  [41, 28, 9.5],
];

/** Editorial bouquet: foliage, layered blooms and a wrapped, ribboned stem. Size = number of blooms. */
function Bouquet({ stems }: { stems: number }) {
  const colors = [P, A, S, A, P, A, P, S, A];
  const blooms = BLOOMS.slice(0, stems);
  const width = 24 + stems * 2.6;
  return (
    <svg viewBox="0 0 120 120">
      {/* foliage */}
      {blooms.map(([x, y], i) => (
        <ellipse key={`l${i}`} cx={x + (i % 2 ? 12 : -12)} cy={y + 11} rx="5" ry="14" fill={S} opacity={0.45} transform={`rotate(${i % 2 ? 35 : -35} ${x + (i % 2 ? 12 : -12)} ${y + 11})`} />
      ))}
      {stems >= 7 && [14, 106].map((x) => <path key={x} d={`M${x} 74 q ${x < 60 ? 4 : -4} -20 ${x < 60 ? 16 : -16} -34`} stroke={S} strokeWidth="1.6" fill="none" opacity={0.6} />)}
      {blooms.map(([x, y, r], i) => (
        <Bloom key={i} x={x} y={y} r={r} color={colors[i]!} turn={i * 17} />
      ))}
      {/* wrap */}
      <path d={`M${60 - width} 68 L${60 + width} 68 L64 118 L56 118 Z`} fill={ALT} stroke={T} strokeOpacity={0.12} strokeWidth="1" />
      <path d={`M${60 - width} 68 L60 84 L${60 + width} 68`} fill={SURF} opacity={0.55} />
      <path d={`M${60 - width * 0.55} 68 L60 116`} stroke={T} strokeOpacity={0.08} strokeWidth="1" />
      {/* ribbon */}
      <path d="M52 96 q -10 -6 -12 2 q 6 4 12 -2 Z M68 96 q 10 -6 12 2 q -6 4 -12 -2 Z" fill={P} opacity={0.85} />
      <rect x="55.5" y="93" width="9" height="6" rx="2" fill={P} />
      <path d="M58 99 l -4 12 M62 99 l 4 12" stroke={P} strokeWidth="1.6" opacity={0.75} />
    </svg>
  );
}

function Plate({ variant }: { variant: 'classic' | 'chef' | 'vegan' }) {
  return (
    <svg viewBox="0 0 120 120">
      <ellipse cx="60" cy="66" rx="46" ry="34" fill={SURF} stroke={T} strokeOpacity={0.18} strokeWidth="2" />
      <ellipse cx="60" cy="66" rx="32" ry="23" fill={ALT} />
      {variant === 'classic' && (
        <>
          <ellipse cx="54" cy="64" rx="15" ry="9" fill={P} opacity={0.85} />
          <circle cx="72" cy="60" r="6" fill={S} />
          <circle cx="68" cy="72" r="4" fill={A} />
        </>
      )}
      {variant === 'chef' &&
        [-20, 0, 20].map((dx, i) => (
          <g key={dx}>
            <circle cx={60 + dx} cy={64 + (i === 1 ? -4 : 4)} r="7" fill={[P, A, S][i]} />
            <circle cx={60 + dx} cy={64 + (i === 1 ? -4 : 4)} r="2.5" fill={SURF} opacity={0.6} />
          </g>
        ))}
      {variant === 'vegan' && (
        <>
          <path d="M44 70 Q 52 48 70 52 Q 66 72 44 70 Z" fill={S} />
          <path d="M60 74 Q 74 58 84 66 Q 76 80 60 74 Z" fill={A} opacity={0.9} />
          <circle cx="50" cy="60" r="4" fill={P} />
        </>
      )}
      <path d="M16 28 v24 M12 28 v10 M20 28 v10 M12 38 h8" stroke={T} strokeOpacity={0.35} strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M104 28 q6 10 0 22 v18" stroke={T} strokeOpacity={0.35} strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const SIMPLE: Record<string, () => ReactElement> = {
  wine: () => (
    <svg viewBox="0 0 120 120">
      <rect x="70" y="22" width="18" height="70" rx="6" fill={S} />
      <rect x="75" y="12" width="8" height="14" rx="2" fill={S} />
      <rect x="72" y="50" width="14" height="18" rx="2" fill={A} />
      <path d="M30 34 h30 q0 30 -15 34 q-15 -4 -15 -34 Z" fill={SURF} stroke={T} strokeOpacity={0.3} strokeWidth="2" />
      <path d="M32 48 h26 q-2 16 -13 19 q-11 -3 -13 -19 Z" fill={P} />
      <path d="M45 68 v22 M34 92 h22" stroke={T} strokeOpacity={0.4} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  ),
  cake: () => (
    <svg viewBox="0 0 120 120">
      <rect x="28" y="66" width="64" height="30" rx="5" fill={P} />
      <rect x="38" y="44" width="44" height="24" rx="5" fill={A} />
      <path d="M28 76 q8 6 16 0 t16 0 t16 0 t16 0" stroke={SURF} strokeWidth="3" fill="none" opacity={0.7} />
      <rect x="57" y="28" width="6" height="16" rx="2" fill={S} />
      <path d="M60 18 q5 6 0 10 q-5 -4 0 -10 Z" fill={A} />
      <rect x="20" y="96" width="80" height="5" rx="2.5" fill={T} opacity={0.2} />
    </svg>
  ),
  decor: () => (
    <svg viewBox="0 0 120 120">
      <rect x="14" y="80" width="92" height="6" rx="3" fill={T} opacity={0.25} />
      <path d="M48 80 q-6 -20 4 -30 h16 q10 10 4 30 Z" fill={S} opacity={0.8} />
      {[
        [44, 34, P],
        [60, 24, A],
        [76, 36, P],
        [52, 44, A],
        [70, 46, S],
      ].map(([x, y, c], i) => (
        <circle key={i} cx={x as number} cy={y as number} r={8} fill={c as string} />
      ))}
      <circle cx="24" cy="70" r="5" fill={A} opacity={0.7} />
      <circle cx="96" cy="70" r="5" fill={A} opacity={0.7} />
    </svg>
  ),
  dj: () => (
    <svg viewBox="0 0 120 120">
      <circle cx="60" cy="62" r="38" fill={T} opacity={0.9} />
      {[30, 24, 18].map((r) => (
        <circle key={r} cx="60" cy="62" r={r} fill="none" stroke={SURF} strokeOpacity={0.18} strokeWidth="1.5" />
      ))}
      <circle cx="60" cy="62" r="11" fill={P} />
      <circle cx="60" cy="62" r="2.5" fill={SURF} />
      <path d="M92 20 l6 44" stroke={A} strokeWidth="4" strokeLinecap="round" />
      <circle cx="98" cy="66" r="5" fill={A} />
    </svg>
  ),
  private_room: () => (
    <svg viewBox="0 0 120 120">
      <rect x="22" y="18" width="76" height="84" rx="4" fill={ALT} stroke={T} strokeOpacity={0.2} strokeWidth="2" />
      <ellipse cx="60" cy="74" rx="28" ry="9" fill={P} />
      {[-34, 34].map((dx) => (
        <rect key={dx} x={60 + dx - 5} y="64" width="10" height="22" rx="4" fill={S} />
      ))}
      <path d="M50 30 h20 v14 h-20 Z" fill={A} opacity={0.7} />
      <path d="M60 44 v10" stroke={A} strokeWidth="2" />
    </svg>
  ),
  gift: () => (
    <svg viewBox="0 0 120 120">
      <rect x="26" y="50" width="68" height="48" rx="5" fill={A} />
      <rect x="22" y="40" width="76" height="16" rx="4" fill={P} />
      <rect x="55" y="40" width="10" height="58" fill={SURF} opacity={0.8} />
      <path d="M60 40 q-22 -22 -26 -6 q6 8 26 6 q20 2 26 -6 q-4 -16 -26 6" fill="none" stroke={P} strokeWidth="4" />
    </svg>
  ),
  brakes: () => (
    <svg viewBox="0 0 120 120">
      <circle cx="58" cy="62" r="40" fill={ALT} stroke={T} strokeOpacity={0.4} strokeWidth="3" />
      <circle cx="58" cy="62" r="14" fill={SURF} stroke={T} strokeOpacity={0.4} strokeWidth="3" />
      {Array.from({ length: 5 }, (_, i) => {
        const a = (i / 5) * Math.PI * 2;
        return <circle key={i} cx={58 + Math.cos(a) * 24} cy={62 + Math.sin(a) * 24} r="3" fill={T} opacity={0.4} />;
      })}
      <path d="M86 30 q18 32 0 64 l-10 -6 q12 -26 0 -52 Z" fill={A} />
    </svg>
  ),
  filter: () => (
    <svg viewBox="0 0 120 120">
      <rect x="20" y="30" width="80" height="60" rx="4" fill={ALT} stroke={T} strokeOpacity={0.4} strokeWidth="3" />
      <path d={Array.from({ length: 9 }, (_, i) => `${i ? 'L' : 'M'}${26 + i * 8.5} ${i % 2 ? 84 : 36}`).join(' ')} fill="none" stroke={A} strokeWidth="3" strokeLinejoin="round" />
      <path d="M8 50 h8 M8 60 h8 M8 70 h8 M104 50 h8 M104 60 h8 M104 70 h8" stroke={T} strokeOpacity={0.3} strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  wipers: () => (
    <svg viewBox="0 0 120 120">
      <path d="M12 92 Q 60 14 108 92 Z" fill={ALT} stroke={T} strokeOpacity={0.4} strokeWidth="3" />
      <path d="M60 92 L 30 52" stroke={T} strokeWidth="4" strokeLinecap="round" opacity={0.7} />
      <path d="M30 52 L 22 64" stroke={A} strokeWidth="4" strokeLinecap="round" />
      <path d="M60 92 a32 32 0 0 1 -26 -36" fill="none" stroke={A} strokeDasharray="4 5" strokeWidth="2" />
      {[
        [76, 50],
        [86, 64],
        [70, 66],
      ].map(([x, y]) => (
        <path key={x} d={`M${x} ${y} q3 5 0 8 q-3 -3 0 -8`} fill={P} opacity={0.6} />
      ))}
    </svg>
  ),
  generic_tool: () => (
    <svg viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="40" fill={ALT} />
      <path d="M44 76 L72 48 M70 38 a12 12 0 1 0 12 12 l-6 -2 -4 -4 Z" stroke={T} strokeOpacity={0.6} strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export const ART_KEYS = ['bouquet_s', 'bouquet_m', 'bouquet_l', 'bouquet_xl', 'menu_classic', 'menu_chef', 'menu_vegan', ...Object.keys(SIMPLE)] as const;

export function OptionArt({ name, className }: { name: string; className?: string }) {
  const bouquet = /^bouquet_(s|m|l|xl)$/.exec(name);
  const menu = /^menu_(classic|chef|vegan)$/.exec(name);
  const el = bouquet ? (
    <Bouquet stems={{ s: 3, m: 5, l: 7, xl: 9 }[bouquet[1] as 's']} />
  ) : menu ? (
    <Plate variant={menu[1] as 'classic'} />
  ) : (
    SIMPLE[name]?.()
  );
  if (!el) return null;
  return (
    <span className={className} aria-hidden>
      {el}
    </span>
  );
}

export function hasArt(name?: string): name is string {
  return Boolean(name && (/^bouquet_(s|m|l|xl)$/.test(name) || /^menu_(classic|chef|vegan)$/.test(name) || SIMPLE[name]));
}

const RULES: [RegExp, string][] = [
  [/עוגה|עוגת/, 'cake'],
  [/dj|מוזיק|תקליט/, 'dj'],
  [/חדר פרטי|חדר/, 'private_room'],
  [/עיצוב שולחנות|קישוט|דקור/, 'decor'],
  [/יין|יינות|שמפניה/, 'wine'],
  [/אריז|מתנה/, 'gift'],
  [/טבעונ|צמחונ/, 'menu_vegan'],
  [/שף|טעימות/, 'menu_chef'],
  [/תפריט|ארוח/, 'menu_classic'],
  [/בלם|בלמים|רפיד/, 'brakes'],
  [/פילטר|מסנן/, 'filter'],
  [/מגב/, 'wipers'],
];

/**
 * Deterministic illustration for an option or decision when the config names none.
 * Presentation-only: it never changes business data.
 */
export function inferArt(field: WorkflowField, option?: FieldOption, index = 0, total = 1): string | undefined {
  const explicit = option ? option.image : field.image;
  if (hasArt(explicit)) return explicit;
  const text = normalizeHebrew(`${option?.label ?? ''} ${option ? '' : field.label} ${option?.description ?? ''}`);
  for (const [re, key] of RULES) if (re.test(text)) return key;
  const fieldText = normalizeHebrew(`${field.label} ${field.key}`);
  if (option && /זר|bouquet/.test(fieldText) && /תקציב|budget|גודל/.test(fieldText)) {
    const sizes = ['bouquet_s', 'bouquet_m', 'bouquet_l', 'bouquet_xl'];
    return sizes[Math.min(sizes.length - 1, Math.round((index / Math.max(1, total - 1)) * (sizes.length - 1)))];
  }
  if (option && /תפריט|menu/.test(fieldText)) return 'menu_classic';
  if (!option && field.type === 'decision') return 'generic_tool';
  return undefined;
}

// ---------- hero artwork ----------

export function HeroArt({ decoration, className }: { decoration: WorkflowTheme['decoration']; className?: string }) {
  // Unique ids: several heroes (e.g. the preset gallery) can be on one page.
  const uid = useId().replace(/:/g, '');
  const common = { className, 'aria-hidden': true, preserveAspectRatio: 'xMidYMid slice', 'data-art': decoration } as const;
  switch (decoration) {
    case 'organic':
      return (
        <svg viewBox="0 0 400 480" {...common}>
          <path className="fz-m-drift" d="M-20 120 C 80 40 200 90 260 30 S 420 20 440 120 L 440 -20 L -20 -20 Z" fill={A} opacity={0.35} />
          <path className="fz-m-drift fz-m-rev" d="M300 520 C 260 400 380 360 340 260 S 440 200 460 260 L 460 520 Z" fill={S} opacity={0.3} />
          <circle className="fz-m-breathe" cx="90" cy="360" r="70" fill={A} opacity={0.22} />
          <g className="fz-m-sway fz-m-base" fill="none" stroke={S} strokeWidth="2.2" strokeLinecap="round">
            <path d="M200 470 C 200 380 170 320 130 250" />
            <path d="M200 470 C 205 370 240 300 285 230" />
            <path d="M200 470 C 198 360 200 260 205 170" />
            <path d="M168 330 C 140 320 120 300 112 280 C 140 282 160 300 168 330 Z" fill={S} fillOpacity={0.25} />
            <path d="M236 320 C 262 306 280 288 286 266 C 258 270 240 290 236 320 Z" fill={S} fillOpacity={0.25} />
          </g>
          {[
            [130, 245, 30, P],
            [285, 225, 34, A],
            [205, 160, 38, P],
            [165, 205, 18, A],
            [248, 180, 16, S],
          ].map(([x, y, r, c], i) => (
            <g key={i} className="fz-m-bloom" style={{ '--i': i } as CSSProperties}>
              {Array.from({ length: 6 }, (_, k) => {
                const a = (k / 6) * Math.PI * 2;
                return <ellipse key={k} cx={(x as number) + Math.cos(a) * (r as number) * 0.5} cy={(y as number) + Math.sin(a) * (r as number) * 0.5} rx={(r as number) * 0.55} ry={(r as number) * 0.36} transform={`rotate(${(a * 180) / Math.PI} ${(x as number) + Math.cos(a) * (r as number) * 0.5} ${(y as number) + Math.sin(a) * (r as number) * 0.5})`} fill={c as string} opacity={0.85} />;
              })}
              <circle cx={x as number} cy={y as number} r={(r as number) * 0.28} fill={SURF} opacity={0.7} />
            </g>
          ))}
        </svg>
      );
    case 'technical':
      return (
        <svg viewBox="0 0 600 220" {...common}>
          <defs>
            <pattern id={`g${uid}`} width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M24 0 H0 V24" fill="none" stroke="currentColor" strokeOpacity={0.09} />
            </pattern>
          </defs>
          <rect width="600" height="220" fill={`url(#g${uid})`} />
          <g fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth="1.5">
            <circle cx="110" cy="150" r="90" />
            <circle className="fz-m-spin" cx="110" cy="150" r="64" strokeDasharray="2 6" />
            <path d="M20 150 H200 M110 60 V240" strokeOpacity={0.18} />
          </g>
          <path className="fz-m-draw" pathLength="1" d="M40 150 A70 70 0 0 1 172 118" fill="none" stroke={A} strokeWidth="5" strokeLinecap="round" />
          <path className="fz-m-needle" d="M110 150 L160 100" stroke={A} strokeWidth="3" strokeLinecap="round" />
          <circle cx="110" cy="150" r="6" fill={A} />
          <g stroke="currentColor" strokeOpacity={0.25} fill="none">
            <path d="M260 40 h120 l20 20 h160" />
            <path className="fz-m-dash" d="M300 180 h220" strokeDasharray="6 6" />
          </g>
        </svg>
      );
    case 'atmospheric':
      return (
        <svg viewBox="0 0 800 360" {...common} preserveAspectRatio="xMinYMax slice">
          <defs>
            <radialGradient id={`a${uid}`} cx="0.3" cy="0.4" r="0.6">
              <stop offset="0" stopColor={A} stopOpacity={0.55} />
              <stop offset="1" stopColor={A} stopOpacity={0} />
            </radialGradient>
            <radialGradient id={`b${uid}`} cx="0.8" cy="0.7" r="0.5">
              <stop offset="0" stopColor={P} stopOpacity={0.55} />
              <stop offset="1" stopColor={P} stopOpacity={0} />
            </radialGradient>
          </defs>
          <rect width="800" height="360" fill={`url(#a${uid})`} />
          <rect className="fz-m-drift" width="800" height="360" fill={`url(#b${uid})`} />
          <g fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth="1.6">
            <ellipse cx="150" cy="334" rx="62" ry="16" />
            <ellipse cx="150" cy="334" rx="40" ry="10" />
            <ellipse cx="300" cy="340" rx="62" ry="16" />
            <ellipse cx="300" cy="340" rx="40" ry="10" />
            <path d="M214 250 h24 q0 34 -12 38 q-12 -4 -12 -38 Z M226 288 v34 M216 322 h20" />
            <path d="M362 244 h24 q0 34 -12 38 q-12 -4 -12 -38 Z M374 282 v40 M364 322 h20" />
          </g>
          {[70, 110, 390].map((x, i) => (
            <g key={x} style={{ '--i': i } as CSSProperties}>
              <rect x={x - 5} y={220 + i * 14} width="10" height={60 - i * 10} rx="2" fill="currentColor" opacity={0.28} />
              <path className="fz-m-flicker" d={`M${x} ${200 + i * 14} q8 10 0 18 q-8 -8 0 -18 Z`} fill={A} opacity={0.9} />
              <circle className="fz-m-glow" cx={x} cy={210 + i * 14} r="26" fill={A} opacity={0.12} />
            </g>
          ))}
        </svg>
      );
    case 'structured':
      return (
        <svg viewBox="0 0 320 200" {...common}>
          {Array.from({ length: 4 }, (_, r) =>
            Array.from({ length: 6 }, (_, c) => (
              <rect key={`${r}-${c}`} x={c * 52 + 8} y={r * 48 + 8} width="40" height="36" rx="4" fill={P} opacity={0.04 + ((r * 6 + c) % 5) * 0.025} />
            )),
          )}
          <g transform="translate(190 46)">
            <g className="fz-m-float">
            <rect x="14" y="-8" width="84" height="108" rx="6" fill={SURF} stroke={P} strokeOpacity={0.25} />
            <rect x="0" y="4" width="84" height="108" rx="6" fill={SURF} stroke={P} strokeOpacity={0.4} />
            {[22, 36, 50, 64].map((y) => (
              <rect key={y} x="14" y={y} width={y === 64 ? 34 : 56} height="5" rx="2.5" fill={P} opacity={0.3} />
            ))}
            <circle className="fz-m-pop" cx="64" cy="92" r="12" fill={A} />
            <path className="fz-m-draw" pathLength="1" d="M58 92 l4 4 l8 -9" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </g>
          </g>
        </svg>
      );
    case 'expressive':
      return (
        <svg viewBox="0 0 400 300" {...common}>
          {/* Swiss-poster composition: one bold disc, a cut band, a tight dot grid and a hairline rule. */}
          <circle className="fz-m-breathe" cx="280" cy="128" r="104" fill={P} />
          <path className="fz-m-slide" d="M-20 300 L210 30 L262 30 L32 300 Z" fill={T} />
          <g className="fz-m-tilt">
            <rect x="226" y="196" width="150" height="34" fill={SURF} transform="rotate(-18 301 213)" />
          </g>
          <g className="fz-m-blink">
            {Array.from({ length: 5 }, (_, r) =>
              Array.from({ length: 6 }, (_, c) => <circle key={`${r}-${c}`} cx={36 + c * 18} cy={42 + r * 18} r="3.2" fill={T} />),
            )}
          </g>
          <path d="M150 268 H392" stroke={T} strokeWidth="3" />
        </svg>
      );
    case 'geometric':
      return (
        <svg viewBox="0 0 400 300" {...common}>
          {/* Bauhaus-like tiles: quarter circles, a half disc and a solid square on a quiet grid. */}
          <g opacity={0.95}>
            <path d="M220 20 h80 v80 a80 80 0 0 1 -80 -80 Z" fill={P} />
            <rect className="fz-m-tilt" x="300" y="20" width="80" height="80" fill={A} />
            <path d="M300 100 h80 v80 h-80 a80 80 0 0 1 80 -80" fill={S} opacity={0.85} />
            <circle className="fz-m-orbit-s" cx="260" cy="140" r="40" fill={SURF} opacity={0.9} />
            <path className="fz-m-breathe" d="M220 180 a80 80 0 0 1 160 0 Z" fill={P} opacity={0.35} />
            <rect x="220" y="180" width="80" height="80" fill={S} opacity={0.4} />
            <path d="M300 260 a80 80 0 0 1 80 -80 v80 Z" fill={A} opacity={0.75} />
          </g>
          <g stroke="currentColor" strokeOpacity={0.12}>
            {[20, 100, 180, 260].map((y) => (
              <path key={y} d={`M20 ${y} H200`} />
            ))}
          </g>
        </svg>
      );
    case 'waves':
      return (
        <svg viewBox="0 0 600 260" {...common} preserveAspectRatio="xMidYMax slice">
          <defs>
            <linearGradient id={`w${uid}`} x1="0" x2="1">
              <stop offset="0" stopColor={P} stopOpacity={0.55} />
              <stop offset="1" stopColor={A} stopOpacity={0.55} />
            </linearGradient>
          </defs>
          <path className="fz-m-wave" style={{ '--i': 0 } as CSSProperties} d="M-120 150 C 0 90 100 210 220 150 S 400 90 520 150 S 700 210 820 150 V260 H-120 Z" fill={`url(#w${uid})`} opacity={0.5} />
          <path className="fz-m-wave fz-m-rev" style={{ '--i': 1 } as CSSProperties} d="M-120 190 C 20 140 120 240 260 190 S 460 140 600 190 S 760 240 820 190 V260 H-120 Z" fill={S} opacity={0.35} />
          <path className="fz-m-wave" style={{ '--i': 2 } as CSSProperties} d="M-120 225 C 30 195 140 260 280 225 S 470 195 610 225 S 760 255 820 225 V260 H-120 Z" fill={P} opacity={0.45} />
          <g fill="none" stroke="currentColor" strokeOpacity={0.22} strokeWidth="1.5" className="fz-m-drift">
            <path d="M40 90 C 120 50 200 120 280 80" />
            <path d="M330 60 C 400 25 470 85 560 50" />
          </g>
          <circle className="fz-m-breathe" cx="500" cy="70" r="26" fill={A} opacity={0.7} />
        </svg>
      );
    case 'arches':
      return (
        <svg viewBox="0 0 420 300" {...common}>
          {/* Mediterranean arcade: three nested arches and a sun. */}
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${190 + i * 76} 0)`}>
              <path d="M0 300 V120 a34 34 0 0 1 68 0 V300 Z" fill={i === 1 ? P : S} opacity={i === 1 ? 0.55 : 0.3} />
              <path d="M10 300 V124 a24 24 0 0 1 48 0 V300" fill="none" stroke={SURF} strokeOpacity={0.6} strokeWidth="2" />
            </g>
          ))}
          <circle className="fz-m-rise" cx="300" cy="64" r="30" fill={A} opacity={0.85} />
          <path d="M150 300 H420" stroke="currentColor" strokeOpacity={0.2} strokeWidth="2" />
        </svg>
      );
    case 'celebration':
      return (
        <svg viewBox="0 0 400 300" {...common}>
          {/* Confetti and streamers on the left half (mirrored): Hebrew titles sit on the right and stay clear. */}
          <g transform="translate(400 0) scale(-1 1)">
          {[
            [220, 40, P, 18],
            [300, 70, A, 26],
            [360, 30, S, 14],
            [260, 130, S, 20],
            [340, 160, P, 12],
            [380, 110, A, 16],
            [230, 210, A, 10],
            [310, 240, P, 22],
          ].map(([x, y, c, r], i) => (
            <circle key={i} className="fz-m-confetti" style={{ '--i': i } as CSSProperties} cx={x as number} cy={y as number} r={r as number} fill={c as string} opacity={0.55 + (i % 3) * 0.12} />
          ))}
          {[
            [250, 90, 20, P],
            [350, 210, -30, S],
            [200, 160, 50, A],
            [370, 60, -15, P],
          ].map(([x, y, rot, c], i) => (
            <g key={i} className="fz-m-flutter" style={{ '--i': i } as CSSProperties}>
              <rect x={x as number} y={y as number} width="22" height="8" rx="2" fill={c as string} transform={`rotate(${rot} ${x} ${y})`} />
            </g>
          ))}
          <path className="fz-m-draw" pathLength="1" d="M190 20 C 230 60 200 100 240 140 S 260 220 300 250" fill="none" stroke={A} strokeWidth="3" strokeLinecap="round" opacity={0.8} />
          <path d="M280 10 C 300 50 340 60 330 110" fill="none" stroke={P} strokeWidth="3" strokeLinecap="round" opacity={0.6} />
          </g>
        </svg>
      );
    case 'botanical':
      return (
        <svg viewBox="0 0 400 420" {...common}>
          {/* Fine-line leaves: a stem with alternating leaves and a soft backdrop disc. */}
          <circle cx="290" cy="200" r="150" fill={ALT} opacity={0.7} />
          <g className="fz-m-sway fz-m-base" fill="none" stroke={S} strokeWidth="2" strokeLinecap="round">
            <path d="M300 420 C 290 320 300 220 270 110" />
            <path d="M340 420 C 350 330 380 260 372 170" />
          </g>
          {[
            [282, 330, -40],
            [292, 270, 35],
            [276, 210, -35],
            [282, 150, 30],
            [356, 330, 40],
            [366, 260, -30],
          ].map(([x, y, rot], i) => (
            <g key={i} className="fz-m-leaf" style={{ '--i': i } as CSSProperties}>
            <path
              d="M0 0 C 18 -22 52 -22 64 0 C 52 22 18 22 0 0 Z"
              transform={`translate(${x} ${y}) rotate(${(rot as number) + (i % 2 ? 0 : 180)})`}
              fill={i % 3 === 0 ? P : S}
              fillOpacity={0.38}
              stroke={S}
              strokeOpacity={0.6}
              strokeWidth="1.2"
            />
            </g>
          ))}
          <circle className="fz-m-breathe" cx="262" cy="104" r="9" fill={A} />
        </svg>
      );
    case 'constellation':
      return (
        <svg viewBox="0 0 600 300" {...common}>
          <defs>
            <radialGradient id={`c${uid}`} cx="0.75" cy="0.35" r="0.55">
              <stop offset="0" stopColor={A} stopOpacity={0.35} />
              <stop offset="1" stopColor={A} stopOpacity={0} />
            </radialGradient>
          </defs>
          <rect width="600" height="300" fill={`url(#c${uid})`} />
          <g stroke={A} strokeOpacity={0.45} strokeWidth="1">
            <path className="fz-m-draw" pathLength="1" d="M330 70 L400 110 L470 80 L520 140 L450 190 L400 110" fill="none" />
          </g>
          {[
            [330, 70, 3],
            [400, 110, 4],
            [470, 80, 3],
            [520, 140, 5],
            [450, 190, 3],
            [560, 60, 2],
            [300, 160, 2],
            [380, 230, 2],
            [540, 230, 3],
            [260, 50, 2],
          ].map(([x, y, r], i) => (
            <circle key={i} className="fz-m-twinkle" style={{ '--i': i } as CSSProperties} cx={x} cy={y} r={r} fill={i % 4 === 0 ? A : 'currentColor'} opacity={i % 4 === 0 ? 0.95 : 0.55} />
          ))}
          <path className="fz-m-glow" d="M470 250 a40 40 0 1 0 30 -66 a32 32 0 1 1 -30 66 Z" fill={A} opacity={0.75} />
        </svg>
      );
    case 'minimal':
      return (
        <svg viewBox="0 0 300 300" {...common}>
          {[140, 108, 76, 44].map((r, i) => (
            <circle key={r} className="fz-m-ring" style={{ '--i': i } as CSSProperties} cx="150" cy="150" r={r} fill="none" stroke={i === 3 ? A : 'currentColor'} strokeOpacity={i === 3 ? 0.9 : 0.1} strokeWidth={i === 3 ? 3 : 1.5} />
          ))}
          <g className="fz-m-orbit">
            <circle cx="248" cy="82" r="7" fill={A} />
          </g>
        </svg>
      );
    default:
      return null;
  }
}
