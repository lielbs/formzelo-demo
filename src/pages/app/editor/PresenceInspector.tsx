/** Design Studio → per-workflow presentation of the Brand Kit links (stored in the draft design). */
import { Link } from 'react-router-dom';
import { Badge, Card, cx, FieldLabel, Select } from '../../../components/ui';
import type { PresenceLink, PresenceSettings } from '../../../domain/theme';
import { linksForWorkflow, presenceOf, reviewLink, validLinks } from '../../../engine/presence';
import { PresenceIcon } from '../../../renderer/presence';
import { Segmented, Toggle } from './DesignPanel';

const VISIBILITY: Record<PresenceSettings['visibility'], string> = { all: 'כל הקישורים', selected: 'נבחרים בלבד', hidden: 'מוסתר' };
const STYLES: Record<PresenceSettings['style'], string> = { icons: 'שורת אייקונים', icon_label: 'אייקון ותווית', cards: 'כרטיסי פעולה', compact: 'ניווט נייד קומפקטי' };
const PLACEMENTS: Record<PresenceSettings['placement'], string> = {
  header: 'בראש התהליך',
  footer: 'בתחתית התהליך',
  completion: 'במסך הסיום',
  header_completion: 'ראש התהליך + מסך הסיום',
  footer_completion: 'תחתית התהליך + מסך הסיום',
  all: 'בכל המקומות',
};

export function PresenceInspector({
  settings,
  kitLinks,
  booking,
  onChange,
}: {
  settings?: Partial<PresenceSettings>;
  kitLinks: PresenceLink[];
  /** Booking requests are not delivered services — the review request is discouraged there. */
  booking: boolean;
  onChange: (s: Omit<PresenceSettings, 'links'>) => void;
}) {
  const s = presenceOf(settings);
  const { links: _frozen, ...current } = s;
  const set = (patch: Partial<PresenceSettings>) => onChange({ ...current, ...patch });
  const available = validLinks(kitLinks).filter((l) => l.platform !== 'google_review');
  const shown = linksForWorkflow(kitLinks, s);
  const review = reviewLink(kitLinks);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="font-semibold">נוכחות דיגיטלית</h2>
        <p className="mt-1 text-xs text-ink-muted">
          הקישורים מגיעים מ
          <Link className="text-orange-600 underline" to="/app/brand">
            ערכת המותג
          </Link>
          . כאן בוחרים מה מוצג בתהליך הזה, איפה ואיך. הפעולה העיקרית של התהליך תמיד נשארת הבולטת.
        </p>
        {!available.length && <p className="mt-3 rounded-lg bg-cloud p-3 text-xs text-ink-muted">עדיין אין קישורים תקינים בערכת המותג. הוסיפו אותם שם — ואז חזרו לכאן.</p>}
      </Card>

      <Card className="space-y-4 p-4">
        <Segmented label="מה להציג" value={s.visibility} options={['all', 'selected', 'hidden'] as const} labels={VISIBILITY} onChange={(visibility) => set({ visibility })} />
        {s.visibility === 'selected' && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">קישורים בתהליך הזה</legend>
            <ul className="space-y-1">
              {available.map((l) => (
                <li key={l.id}>
                  <label className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-cloud">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[#E96B3D]"
                      checked={s.selected.includes(l.id)}
                      onChange={(e) => set({ selected: e.target.checked ? [...s.selected, l.id] : s.selected.filter((x) => x !== l.id) })}
                    />
                    <PresenceIcon link={l} className="h-3.5 w-3.5 text-ink-soft" />
                    {l.label}
                    {l.sample && <Badge tone="amber">לדוגמה</Badge>}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        {s.visibility !== 'hidden' && (
          <>
            <div>
              <FieldLabel htmlFor="pr-place">איפה</FieldLabel>
              <Select id="pr-place" value={s.placement} onChange={(e) => set({ placement: e.target.value as PresenceSettings['placement'] })}>
                {(Object.keys(PLACEMENTS) as PresenceSettings['placement'][]).map((p) => (
                  <option key={p} value={p}>
                    {PLACEMENTS[p]}
                  </option>
                ))}
              </Select>
            </div>
            <Segmented label="סגנון" value={s.style} options={['icons', 'icon_label', 'cards', 'compact'] as const} labels={STYLES} onChange={(style) => set({ style })} />
          </>
        )}
        <p className={cx('text-xs', shown.length ? 'text-ink-muted' : 'text-amber-700')}>
          {s.visibility === 'hidden' ? 'הקישורים לא יוצגו בתהליך הזה.' : shown.length ? `${shown.length} קישורים יוצגו · ${PLACEMENTS[s.placement]}` : 'אין קישורים להצגה בבחירה הנוכחית.'}
        </p>
      </Card>

      <Card className="p-4">
        <Toggle checked={s.reviewCta} onChange={(reviewCta) => set({ reviewCta })}>
          <span className="font-medium">בקשה ניטרלית לביקורת בגוגל</span>
          <span className="block text-xs text-ink-muted">
            "שתפו את החוויה שלכם בגוגל" — מוצג רק לבקשה שסומנה כ"הושלם" (שירות שניתן בפועל), לכל הלקוחות, בלי תמריצים ובלי סינון.
          </span>
        </Toggle>
        {s.reviewCta && !review && <p className="mt-2 text-xs font-medium text-amber-700">אין בערכת המותג קישור תקין לכתיבת ביקורת בגוגל, ולכן הבקשה לא תוצג.</p>}
        {s.reviewCta && booking && <p className="mt-2 text-xs text-ink-muted">בתהליך הזמנה הבקשה תוצג רק אחרי שההזמנה סומנה כהושלמה — לא אחרי בקשה או אישור.</p>}
      </Card>
      <p className="text-[11px] text-ink-soft">שינויים נכנסים לטיוטה (כולל ביטול/ביצוע מחדש). בקישור הציבורי הם יופיעו רק אחרי פרסום גרסה חדשה.</p>
    </div>
  );
}
