/**
 * Design tab of the workflow editor. Edits only the draft WorkflowTheme;
 * published versions keep the design frozen with them.
 */
import { Check, RotateCcw, Sparkles, Undo2, Wand2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { ImagePicker } from '../../../components/ImagePicker';
import { Badge, Button, Card, cx, FieldLabel, Input } from '../../../components/ui';
import {
  ASSET_LIMITS,
  BUTTON_VARIANTS,
  CARD_VARIANTS,
  COMPOSITIONS,
  DENSITIES,
  HERO_LAYOUTS,
  INPUT_VARIANTS,
  MOTION_LEVELS,
  OPTION_VARIANTS,
  PROGRESS_STYLES,
  RADII,
  SHADOWS,
  TYPOGRAPHY_PRESETS,
  type Asset,
  type ThemePalette,
  type WorkflowTheme,
} from '../../../domain/theme';
import { buildTheme, PRESET_LIST, PRESETS } from '../../../theme/presets';
import { PresetPreview } from '../../../theme/PresetPreview';
import type { ThemeRecommendation } from '../../../theme/resolver';
import { themeTokens, TYPOGRAPHY } from '../../../theme/tokens';

export const L = {
  hero: { split: 'פאנל עריכתי', banner: 'רצועה טכנית', immersive: 'אווירה מלאה', compact: 'כותרת עניינית', poster: 'פוסטר נועז', centered: 'ממורכז', none: 'ללא פתיח' },
  composition: { centered: 'טור ממורכז', editorial_split: 'פיצול עריכתי', product_grid: 'מגדיר מוצר + סיכום', decision: 'אישור החלטות + סכום', booking: 'הזמנת מקום', document: 'מסמך מקצועי' },
  card: { soft: 'רך', outlined: 'קו מתאר', elevated: 'מורם', bold: 'נועז', flat: 'שטוח' },
  input: { outlined: 'מסגרת', filled: 'ממולא', underline: 'קו תחתון' },
  option: { tile: 'אריחים', row: 'שורות', chip: 'תגיות', bold: 'ניגודיות גבוהה' },
  button: { pill: 'גלולה', solid: 'מלא', sharp: 'חד', brutal: 'גרפי' },
  radius: { none: 'ישר', sm: 'קטן', md: 'בינוני', lg: 'גדול', xl: 'מעוגל מאוד' },
  shadow: { none: 'ללא', soft: 'עדין', medium: 'בינוני', hard: 'גרפי' },
  density: { compact: 'צפוף', comfortable: 'נוח', airy: 'מרווח' },
  progress: { bar: 'פס', steps: 'שלבים', dots: 'נקודות', numbered: 'מספרים' },
  motion: { none: 'ללא', subtle: 'עדינה', expressive: 'בולטת' },
} as const;

const PALETTE_FIELDS: [keyof ThemePalette, string][] = [
  ['primary', 'ראשי (כפתורים ובחירה)'],
  ['accent', 'הדגשה'],
  ['secondary', 'משני'],
  ['background', 'רקע העמוד'],
  ['surface', 'כרטיסים'],
  ['text', 'טקסט'],
];

export function Group({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <Card as="section" className="p-5">
      <h3 className="font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </Card>
  );
}

export function Segmented<T extends string>({ label, value, options, labels, onChange }: { label: string; value: T; options: readonly T[]; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={value === o}
            onClick={() => onChange(o)}
            className={cx(
              'min-h-[36px] rounded-lg border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
              value === o ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink-muted hover:border-ink-soft hover:text-ink',
            )}
          >
            {labels[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#E96B3D]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

export function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-ink-muted">{label}</p>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-10 w-11 shrink-0 cursor-pointer rounded-lg border border-cloud-300 bg-white p-1" />
        <Input
          aria-label={`${label} — קוד צבע`}
          dir="ltr"
          className="!h-10 font-mono text-xs"
          value={shown}
          onFocus={() => {
            setText(value);
            setFocused(true);
          }}
          onBlur={() => setFocused(false)}
          invalid={focused && !/^#[0-9a-fA-F]{6}$/.test(text)}
          onChange={(e) => {
            setText(e.target.value);
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toUpperCase());
          }}
        />
      </div>
    </div>
  );
}

export interface DesignPanelProps {
  design: WorkflowTheme;
  onChange: (next: WorkflowTheme) => void;
  recommendation: ThemeRecommendation;
  orgId: string;
  orgBrandColor: string;
  assets: Asset[];
  assetUrls: Record<string, string>;
  canUndo: boolean;
  onUndo: () => void;
  designDirty: boolean;
  onRevert: () => void;
}

export function DesignPanel({ design, onChange, recommendation, orgId, orgBrandColor, assets, assetUrls, canUndo, onUndo, designDirty, onRevert }: DesignPanelProps) {
  const set = (fn: (d: WorkflowTheme) => void) => {
    const next = structuredClone(design);
    fn(next);
    next.source = 'manual';
    onChange(next);
  };
  const keep = { hero: design.hero, logo: design.logo };
  const warnings = themeTokens(design).warnings;
  const recName = PRESETS[recommendation.presetId].meta.nameHe;
  const used = assets.reduce((s, a) => s + a.bytes, 0);

  return (
    <div className="space-y-5">
      <Card className="border-teal/30 bg-teal-50/60 p-4">
        <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-teal-600" aria-hidden />
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-medium text-ink">
            עיצוב מומלץ: {recName}{' '}
            {design.presetId === recommendation.presetId && design.source === 'auto' && <Badge tone="teal">נבחר אוטומטית</Badge>}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{recommendation.reason} בחירה מקומית ודטרמיניסטית לפי מילות מפתח — ללא AI.</p>
        </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 ps-8">
          <Button size="sm" variant="secondary" icon={Wand2} onClick={() => onChange(buildTheme(recommendation.presetId, { source: 'auto', keep }))}>
            איפוס להמלצה
          </Button>
          <Button size="sm" variant="ghost" icon={Undo2} disabled={!canUndo} onClick={onUndo}>
            ביטול פעולה
          </Button>
          <Button size="sm" variant="ghost" icon={RotateCcw} disabled={!designDirty} onClick={onRevert}>
            ביטול שינויי עיצוב
          </Button>
        </div>
      </Card>

      <Group title="סגנון" hint="שש שפות עיצוב שונות — קומפוזיציה, טיפוגרפיה, צורות ותנועה, לא רק צבע.">
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" role="radiogroup" aria-label="סגנון עיצוב">
          {PRESET_LIST.map((p) => {
            const active = design.presetId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onChange(buildTheme(p.id, { source: p.id === recommendation.presetId ? design.source : 'manual', keep }))}
                className={cx(
                  'rounded-2xl border bg-white p-2 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
                  active ? 'border-midnight ring-2 ring-midnight/15' : 'border-cloud-200 hover:border-ink-soft',
                )}
              >
                <PresetPreview theme={buildTheme(p.id)} />
                <span className="mt-2 flex items-center gap-1.5 px-1">
                  <span className="text-sm font-semibold text-ink">{p.nameHe}</span>
                  {p.id === recommendation.presetId && <Badge tone="teal">מומלץ</Badge>}
                  {active && <Check className="ms-auto h-4 w-4 text-midnight" aria-hidden />}
                </span>
                <span className="block px-1 text-[11px] leading-snug text-ink-muted">{p.bestFor}</span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-ink-muted">{PRESETS[design.presetId].meta.description}</p>
      </Group>

      <Group title="צבעים" hint="ניגודיות נבדקת אוטומטית; טקסט וקישורים מקבלים גוון קריא גם מצבע בהיר.">
        <div className="grid gap-3 sm:grid-cols-2">
          {PALETTE_FIELDS.map(([k, label]) => (
            <ColorInput key={k} label={label} value={design.palette[k]} onChange={(v) => set((d) => void (d.palette[k] = v))} />
          ))}
        </div>
        <Button size="sm" variant="secondary" onClick={() => set((d) => void (d.palette.primary = orgBrandColor.toUpperCase()))}>
          <span className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10" style={{ background: orgBrandColor }} aria-hidden />
          החלת צבע המותג של סביבת העבודה
        </Button>
        {warnings.length > 0 && (
          <ul role="status" className="space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            {warnings.map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        )}
      </Group>

      <Group title="טיפוגרפיה ופתיח">
        <div>
          <p className="mb-1.5 text-sm font-medium">גופן</p>
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="גופן">
            {TYPOGRAPHY_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={design.typography === t}
                onClick={() => set((d) => void (d.typography = t))}
                className={cx('rounded-xl border px-3 py-2 text-start transition', design.typography === t ? 'border-midnight bg-cloud' : 'border-cloud-300 hover:border-ink-soft')}
              >
                <span className="block text-lg leading-tight" style={{ fontFamily: TYPOGRAPHY[t].display, fontWeight: TYPOGRAPHY[t].weight }}>
                  כל רעיון הופך לתהליך
                </span>
                <span className="text-[11px] text-ink-muted">{TYPOGRAPHY[t].label}</span>
              </button>
            ))}
          </div>
        </div>
        <Segmented label="פתיח (Hero)" value={design.hero.layout} options={HERO_LAYOUTS} labels={L.hero} onChange={(v) => set((d) => void (d.hero.layout = v))} />
        <div>
          <FieldLabel htmlFor="ds-eyebrow">שורת פתיח מעל הכותרת (אופציונלי)</FieldLabel>
          <Input id="ds-eyebrow" maxLength={60} value={design.hero.eyebrow ?? ''} placeholder="לדוגמה: סטודיו פרחים בתל אביב" onChange={(e) => set((d) => void (d.hero.eyebrow = e.target.value || undefined))} />
        </div>
        <Segmented label="קומפוזיציה" value={design.composition} options={COMPOSITIONS} labels={L.composition} onChange={(v) => set((d) => void (d.composition = v))} />
      </Group>

      <Group title="רכיבים">
        <Segmented label="כרטיסים" value={design.components.card} options={CARD_VARIANTS} labels={L.card} onChange={(v) => set((d) => void (d.components.card = v))} />
        <Segmented label="שדות קלט" value={design.components.input} options={INPUT_VARIANTS} labels={L.input} onChange={(v) => set((d) => void (d.components.input = v))} />
        <Segmented label="אפשרויות בחירה" value={design.components.option} options={OPTION_VARIANTS} labels={L.option} onChange={(v) => set((d) => void (d.components.option = v))} />
        <Segmented label="כפתורים" value={design.components.button} options={BUTTON_VARIANTS} labels={L.button} onChange={(v) => set((d) => void (d.components.button = v))} />
        <Segmented label="פינות" value={design.radius} options={RADII} labels={L.radius} onChange={(v) => set((d) => void (d.radius = v))} />
        <Segmented label="צל" value={design.shadow} options={SHADOWS} labels={L.shadow} onChange={(v) => set((d) => void (d.shadow = v))} />
        <Segmented label="צפיפות" value={design.density} options={DENSITIES} labels={L.density} onChange={(v) => set((d) => void (d.density = v))} />
        <Segmented label="מחוון התקדמות" value={design.progress} options={PROGRESS_STYLES} labels={L.progress} onChange={(v) => set((d) => void (d.progress = v))} />
        <Segmented label="תנועה" value={design.motion} options={MOTION_LEVELS} labels={L.motion} onChange={(v) => set((d) => void (d.motion = v))} />
        <p className="text-xs text-ink-muted">משתמשים שביקשו להפחית תנועה במכשיר שלהם יראו את הטופס ללא אנימציות בכל מקרה.</p>
      </Group>

      <Group title="תמונות ולוגו" hint={`נשמרות מוקטנות בדפדפן זה בלבד (לוגו עד ${ASSET_LIMITS.logo.maxBytes / 1024}KB, כיסוי עד ${ASSET_LIMITS.cover.maxBytes / 1024}KB). בשימוש: ${Math.round(used / 1024)}KB מתוך ${Math.round(ASSET_LIMITS.totalBytes / 1024)}KB.`}>
        <ImagePicker kind="logo" label="לוגו" hint="PNG שקוף עובד הכי טוב." selected={design.logo.assetId} assets={assets} urls={assetUrls} orgId={orgId} onSelect={(id) => set((d) => void (d.logo.assetId = id))} />
        <ImagePicker kind="cover" label="תמונת כיסוי לפתיח" hint="מחליפה את האיור בפתיח. השתמשו רק בתמונות שבבעלותכם." selected={design.hero.coverAssetId} assets={assets} urls={assetUrls} orgId={orgId} onSelect={(id) => set((d) => void (d.hero.coverAssetId = id))} />
        <Toggle checked={design.logo.showName} onChange={(v) => set((d) => void (d.logo.showName = v))}>
          הצגת שם העסק ליד הלוגו
        </Toggle>
      </Group>

      <Group title="מובייל ואיורים">
        <Toggle checked={design.mobile.stickySummary} onChange={(v) => set((d) => void (d.mobile.stickySummary = v))}>
          סכום צמוד לתחתית המסך בטלפון (אחרת מוצג בסוף הטופס)
        </Toggle>
        <Toggle checked={design.mobile.compactHero} onChange={(v) => set((d) => void (d.mobile.compactHero = v))}>
          פתיח מצומצם בטלפון — פחות גלילה לפני השדה הראשון
        </Toggle>
        <Toggle checked={design.optionArt} onChange={(v) => set((d) => void (d.optionArt = v))}>
          איורים להמחשה לאפשרויות (זרים, מנות, תיקונים) — מסומנים תמיד כ״איור להמחשה״
        </Toggle>
      </Group>
    </div>
  );
}
