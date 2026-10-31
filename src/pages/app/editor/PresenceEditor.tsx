/**
 * Brand Kit → "נוכחות דיגיטלית וקישורים עסקיים". Links are configured once per
 * workspace; each workflow then chooses where and how to show them (Design Studio).
 */
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Badge, Button, cx, FieldLabel, Input, Select } from '../../../components/ui';
import { PRESENCE_ICONS, type PresenceLink } from '../../../domain/theme';
import { GROUP_LABELS, normalizeLink, PLATFORMS, PRESENCE_PLATFORMS, type PlatformGroup, type PresencePlatform } from '../../../engine/presence';
import { newId } from '../../../lib/id';
import { PresenceIcon } from '../../../renderer/presence';
import { move } from './FieldEditor';

const ICON_LABELS: Record<(typeof PRESENCE_ICONS)[number], string> = {
  link: 'קישור',
  globe: 'אתר',
  calendar: 'יומן',
  bag: 'חנות',
  star: 'כוכב',
  phone: 'טלפון',
  mail: 'מייל',
  pin: 'מיקום',
  chat: 'צ׳אט',
  music: 'מוזיקה',
};
const GROUPS: PlatformGroup[] = ['social', 'navigation', 'contact', 'reviews', 'custom'];
export const MAX_LINKS = 20;

/** Problems that block saving: an enabled link without a valid value. */
export function presenceErrors(links: PresenceLink[]): string[] {
  return links.flatMap((l) => {
    if (!l.value.trim()) return l.enabled ? [`${PLATFORMS[l.platform].label}: חסר ערך`] : [];
    const r = normalizeLink(l.platform, l.value);
    return r.ok ? [] : [`${l.label || PLATFORMS[l.platform].label}: ${r.error}`];
  });
}

function Row({ link, index, count, onChange, onRemove, onMove }: { link: PresenceLink; index: number; count: number; onChange: (l: PresenceLink) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void }) {
  const id = useId();
  const info = PLATFORMS[link.platform];
  const [touched, setTouched] = useState(false);
  const result = link.value.trim() ? normalizeLink(link.platform, link.value) : null;
  const error = result && !result.ok ? result.error : touched && link.enabled && !link.value.trim() ? 'השדה ריק' : null;
  const name = link.label || info.label;
  return (
    <li className={cx('rounded-xl border p-3 transition', link.enabled ? 'border-cloud-200 bg-white' : 'border-dashed border-cloud-300 bg-cloud/50')}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-700">
          <PresenceIcon link={link} />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold">{name}</span>
        {link.sample && <Badge tone="amber">לדוגמה · לא פעיל</Badge>}
        <label className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <input type="checkbox" className="h-4 w-4 accent-[#E96B3D]" checked={link.enabled} onChange={(e) => onChange({ ...link, enabled: e.target.checked })} />
          מוצג
        </label>
        <span className="flex">
          <Button size="sm" variant="ghost" aria-label={`העלאת ${name}`} disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" aria-label={`הורדת ${name}`} disabled={index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" aria-label={`הסרת ${name}`} onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>
      <div className="mt-2.5 space-y-2">
        <div>
          <FieldLabel htmlFor={`${id}-v`}>{link.platform === 'google_review' ? 'קישור לכתיבת ביקורת בגוגל' : info.kind === 'phone' ? 'מספר טלפון' : info.kind === 'email' ? 'כתובת אימייל' : link.platform === 'whatsapp' ? 'מספר או קישור וואטסאפ' : 'קישור'}</FieldLabel>
          <div className="flex gap-1.5">
            <Input
              id={`${id}-v`}
              dir="ltr"
              value={link.value}
              maxLength={500}
              placeholder={info.placeholder}
              invalid={Boolean(error)}
              aria-describedby={`${id}-h`}
              onBlur={() => setTouched(true)}
              // Editing a sample value turns it into the business's real link.
              onChange={(e) => onChange({ ...link, value: e.target.value, sample: undefined })}
            />
            {link.value && (
              <Button size="sm" variant="ghost" aria-label={`ניקוי ${name}`} onClick={() => onChange({ ...link, value: '', sample: undefined })}>
                ניקוי
              </Button>
            )}
          </div>
          <p id={`${id}-h`} className={cx('mt-1 text-xs', error ? 'font-medium text-red-600' : 'text-ink-muted')} role={error ? 'alert' : undefined}>
            {error ?? (result?.ok ? `יפתח: ${result.display}` : info.help ?? 'הקישור נבדק ומוצג רק אם הוא תקין.')}
          </p>
        </div>
        {link.platform === 'custom' && (
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input aria-label="שם הקישור" placeholder="שם הקישור" maxLength={40} value={link.label ?? ''} onChange={(e) => onChange({ ...link, label: e.target.value || undefined })} />
            <Input aria-label="תיאור קצר" placeholder="תיאור קצר (אופציונלי)" maxLength={80} value={link.description ?? ''} onChange={(e) => onChange({ ...link, description: e.target.value || undefined })} />
            <Select aria-label="אייקון" value={link.icon ?? 'link'} onChange={(e) => onChange({ ...link, icon: e.target.value as PresenceLink['icon'] })}>
              {PRESENCE_ICONS.map((ic) => (
                <option key={ic} value={ic}>
                  {ICON_LABELS[ic]}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
    </li>
  );
}

export function PresenceEditor({ links, onChange }: { links: PresenceLink[]; onChange: (links: PresenceLink[]) => void }) {
  const add = (platform: PresencePlatform) =>
    onChange([...links, { id: newId('lnk'), platform, value: '', enabled: true, ...(platform === 'custom' ? { label: 'קישור', icon: 'link' as const } : {}) }]);
  const used = new Set(links.map((l) => l.platform));
  return (
    <div className="space-y-4">
      {links.length ? (
        <ul className="space-y-2">
          {links.map((l, i) => (
            <Row
              key={l.id}
              link={l}
              index={i}
              count={links.length}
              onChange={(next) => onChange(links.map((x) => (x.id === l.id ? next : x)))}
              onRemove={() => onChange(links.filter((x) => x.id !== l.id))}
              onMove={(dir) => onChange(move(links, i, dir))}
            />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-cloud-300 p-4 text-center text-sm text-ink-muted">עדיין אין קישורים. הוסיפו אינסטגרם, ניווט, וואטסאפ או כל קישור שהלקוחות שלכם צריכים.</p>
      )}
      <div>
        <p className="mb-2 text-xs font-medium text-ink-muted">הוספת קישור</p>
        <div className="space-y-2">
          {GROUPS.map((g) => (
            <div key={g} className="flex flex-wrap items-center gap-1.5">
              <span className="w-24 shrink-0 text-[11px] font-semibold text-ink-soft">{GROUP_LABELS[g]}</span>
              {PRESENCE_PLATFORMS.filter((p) => PLATFORMS[p].group === g).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={links.length >= MAX_LINKS || (p !== 'custom' && used.has(p))}
                  onClick={() => add(p)}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full border border-cloud-300 bg-white px-2.5 text-xs font-medium text-ink-muted transition hover:border-ink-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange"
                >
                  <PresenceIcon link={{ platform: p, icon: undefined }} className="h-3.5 w-3.5" />
                  {PLATFORMS[p].label}
                  {p !== 'custom' && used.has(p) ? '' : <Plus className="h-3 w-3" aria-hidden />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-cloud p-3 text-xs leading-relaxed text-ink-muted">
        <p>
          <strong className="font-medium text-ink">ביקורות בגוגל:</strong> מבקשים רק אחרי שירות שהושלם, בניסוח ניטרלי, מכל הלקוחות — בלי תמריצים ובלי סינון לפי שביעות רצון. הבקשה מופיעה רק בתהליכים שבהם הפעלתם אותה בסטודיו.
        </p>
        <p className="mt-1.5">כל תהליך בוחר בסטודיו אילו קישורים להציג, איפה ובאיזה סגנון. תהליכים שכבר פורסמו לא משתנים עד הפרסום הבא.</p>
      </div>
    </div>
  );
}
