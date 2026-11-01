/**
 * Design tab: the fill experience and the business's own add-ons (theme.flow, theme.extras).
 * Owner text is stored as typed and rendered as plain text; empty text simply shows nothing.
 */
import { Columns3, LayoutPanelTop, Newspaper, Plus, Smile, Target, Trash2, type LucideIcon } from 'lucide-react';
import { ImagePicker } from '../../../components/ImagePicker';
import { Button, cx, FieldLabel, Input, Select, Textarea } from '../../../components/ui';
import { FLOWS, PATTERNS, PROMISE_ICONS, type Asset, type ThemeExtras, type WorkflowTheme } from '../../../domain/theme';
import { PROMISE_ICON } from '../../../renderer/extras';
import { Group, Segmented, Toggle } from './DesignPanel';

type Flow = (typeof FLOWS)[number];

export const FLOW_INFO: Record<Flow, { label: string; text: string; icon: LucideIcon }> = {
  card: { label: 'כרטיס קלאסי', text: 'כל השלב בכרטיס אחד מעל הפתיח.', icon: LayoutPanelTop },
  focus: { label: 'שאלה אחת בכל פעם', text: 'שאלה גדולה למסך, מונה שאלות ו-Enter להמשך.', icon: Target },
  editorial: { label: 'מגזין', text: 'עמוד פתוח בלי כרטיס, פרקים וקווים מפרידים.', icon: Newspaper },
  console: { label: 'לוח עבודה', text: 'רשימת שלבים בצד ושדות בשתי עמודות.', icon: Columns3 },
  playful: { label: 'שובב', text: 'מסגרות עבות, צללים גרפיים ומדבקות.', icon: Smile },
};

const PATTERN_LABELS: Record<(typeof PATTERNS)[number], string> = {
  none: 'ללא',
  dots: 'נקודות',
  grid: 'רשת',
  waves: 'גלים',
  confetti: 'קונפטי',
  stripes: 'פסים',
  diamonds: 'יהלומים',
};

const ICON_LABELS: Record<(typeof PROMISE_ICONS)[number], string> = {
  sparkles: 'ניצוץ',
  truck: 'משלוח',
  leaf: 'עלה',
  shield: 'מגן',
  clock: 'שעון',
  heart: 'לב',
  star: 'כוכב',
  check: 'וי',
  wrench: 'מפתח ברגים',
  chef: 'שף',
  calendar: 'לוח שנה',
  phone: 'טלפון',
};

export function FlowPicker({ value, onChange }: { value: Flow; onChange: (f: Flow) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="חוויית מילוי">
      {FLOWS.map((f) => {
        const { label, text, icon: Icon } = FLOW_INFO[f];
        const active = value === f;
        return (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(f)}
            className={cx(
              'flex items-start gap-3 rounded-xl border p-3 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange',
              active ? 'border-midnight bg-cloud ring-2 ring-midnight/10' : 'border-cloud-300 bg-white hover:border-cloud-300 hover:bg-cloud/60',
            )}
          >
            <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', active ? 'bg-midnight text-white' : 'bg-cloud text-ink-muted')} aria-hidden>
              <Icon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{label}</span>
              <span className="block text-xs leading-relaxed text-ink-muted">{text}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function ExtrasEditor({
  design,
  set,
  orgId,
  assets,
  assetUrls,
}: {
  design: WorkflowTheme;
  set: (fn: (d: WorkflowTheme) => void) => void;
  orgId: string;
  assets: Asset[];
  assetUrls: Record<string, string>;
}) {
  const x = design.extras ?? {};
  const edit = (fn: (e: ThemeExtras) => void) =>
    set((d) => {
      const e = d.extras ?? {};
      fn(e);
      d.extras = e;
    });
  const promises = x.promises ?? [];

  return (
    <Group title="תוספות שמייחדות את העסק" hint="מופיעות בתהליך הזה בלבד. הכול טקסט שאתם כותבים — בלי הבטחות שהעסק לא עומד בהן.">
      <div>
        <FieldLabel htmlFor="ex-ribbon">פס הודעה בראש העמוד</FieldLabel>
        <Input id="ex-ribbon" maxLength={90} placeholder="לדוגמה: הזמנות לחג נפתחו · משלוח עד הבית" value={x.ribbon ?? ''} onChange={(e) => edit((v) => void (v.ribbon = e.target.value || undefined))} />
      </div>
      <div>
        <FieldLabel htmlFor="ex-badge">מדבקה על הפתיח</FieldLabel>
        <Input id="ex-badge" maxLength={24} placeholder="לדוגמה: עבודת יד · מאז 1998 · חדש" value={x.badge ?? ''} onChange={(e) => edit((v) => void (v.badge = e.target.value || undefined))} />
      </div>

      <Segmented label="דוגמת רקע" value={x.pattern ?? 'none'} options={PATTERNS} labels={PATTERN_LABELS} onChange={(p) => edit((v) => void (v.pattern = p === 'none' ? undefined : p))} />

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">הבטחות קצרות (עד 4)</p>
        {promises.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              aria-label={`סמל להבטחה ${i + 1}`}
              className="!w-32 shrink-0"
              value={p.icon}
              onChange={(e) => edit((v) => void (v.promises![i]!.icon = e.target.value as (typeof PROMISE_ICONS)[number]))}
            >
              {PROMISE_ICONS.map((ic) => (
                <option key={ic} value={ic}>
                  {ICON_LABELS[ic]}
                </option>
              ))}
            </Select>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-cloud text-ink-muted" aria-hidden>
              {(() => {
                const Icon = PROMISE_ICON[p.icon];
                return <Icon className="h-4 w-4" />;
              })()}
            </span>
            <Input aria-label={`הבטחה ${i + 1}`} maxLength={40} value={p.text} onChange={(e) => edit((v) => void (v.promises![i]!.text = e.target.value))} />
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              aria-label={`הסרת הבטחה ${i + 1}`}
              onClick={() =>
                edit((v) => {
                  v.promises = v.promises!.filter((_, j) => j !== i);
                  if (!v.promises.length) delete v.promises;
                })
              }
            />
          </div>
        ))}
        {promises.length < 4 && (
          <Button size="sm" variant="secondary" icon={Plus} onClick={() => edit((v) => void (v.promises = [...(v.promises ?? []), { icon: 'check', text: '' }]))}>
            הוספת הבטחה
          </Button>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-cloud-200 p-3">
        <Toggle checked={Boolean(x.welcome)} onChange={(on) => edit((v) => void (v.welcome = on ? { name: '', message: '' } : undefined))}>
          פתק אישי מבעלי העסק בשלב הראשון
        </Toggle>
        {x.welcome && (
          <div className="space-y-3 ps-6">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="ex-w-name">שם</FieldLabel>
                <Input id="ex-w-name" maxLength={40} value={x.welcome.name} onChange={(e) => edit((v) => void (v.welcome!.name = e.target.value))} />
              </div>
              <div>
                <FieldLabel htmlFor="ex-w-role">תפקיד (רשות)</FieldLabel>
                <Input id="ex-w-role" maxLength={50} value={x.welcome.role ?? ''} onChange={(e) => edit((v) => void (v.welcome!.role = e.target.value || undefined))} />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="ex-w-msg">ההודעה</FieldLabel>
              <Textarea id="ex-w-msg" rows={3} maxLength={240} value={x.welcome.message} onChange={(e) => edit((v) => void (v.welcome!.message = e.target.value))} />
            </div>
            <ImagePicker
              kind="logo"
              label="תמונה אישית (רשות)"
              hint="בלי תמונה מוצגת האות הראשונה של השם."
              selected={x.welcome.photoAssetId}
              assets={assets}
              urls={assetUrls}
              orgId={orgId}
              onSelect={(id) => edit((v) => void (v.welcome!.photoAssetId = id))}
            />
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-xl border border-cloud-200 p-3">
        <Toggle checked={Boolean(x.signoff)} onChange={(on) => edit((v) => void (v.signoff = on ? { message: '', name: '' } : undefined))}>
          חתימה אישית במסך הסיום
        </Toggle>
        {x.signoff && (
          <div className="grid gap-2 ps-6">
            <div>
              <FieldLabel htmlFor="ex-s-msg">משפט תודה</FieldLabel>
              <Textarea id="ex-s-msg" rows={2} maxLength={200} value={x.signoff.message} onChange={(e) => edit((v) => void (v.signoff!.message = e.target.value))} />
            </div>
            <div>
              <FieldLabel htmlFor="ex-s-name">חתימה</FieldLabel>
              <Input id="ex-s-name" maxLength={50} placeholder="לדוגמה: נועה, Bloom Studio" value={x.signoff.name} onChange={(e) => edit((v) => void (v.signoff!.name = e.target.value))} />
            </div>
          </div>
        )}
      </div>
    </Group>
  );
}
