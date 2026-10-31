/**
 * Workspace brand kit: the default identity every inheriting workflow uses.
 * Published versions keep their frozen design until they are republished.
 */
import { Check, Palette, Pipette, RotateCcw, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImagePicker } from '../../components/ImagePicker';
import { useToast } from '../../components/Toast';
import { Badge, Button, cx, ErrorState, FieldLabel, Input, PageHeader, Spinner, Textarea } from '../../components/ui';
import { BUTTON_VARIANTS, DENSITIES, TYPOGRAPHY_PRESETS, type BrandKit } from '../../domain/theme';
import { useActiveOrg, useRepo, useRepoQuery } from '../../data/store';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard';
import { extractColors } from '../../lib/images';
import { WorkflowRenderer } from '../../renderer/WorkflowRenderer';
import { effectiveTheme } from '../../theme/brand';
import { buildTheme, PRESET_LIST } from '../../theme/presets';
import { PresetPreview } from '../../theme/PresetPreview';
import { themeTokens, TYPOGRAPHY } from '../../theme/tokens';
import { ColorInput, Group, L, Segmented, Toggle } from './editor/DesignPanel';
import { DevicePreview, DeviceToggle, type Device } from './editor/DevicePreview';

const PLACEMENT = { start: 'בצד', center: 'במרכז', hidden: 'מוסתר' } as const;
const ROLES = [
  ['primary', 'ראשי'],
  ['secondary', 'משני'],
  ['accent', 'הדגשה'],
] as const;

export function BrandKitPage() {
  const org = useActiveOrg();
  const { repo } = useRepo();
  const toast = useToast();
  const q = useRepoQuery(
    async (r) => {
      const [kit, workflows, assets] = await Promise.all([r.getBrandKit(org.id), r.listWorkflows(org.id), r.listAssets(org.id)]);
      return { kit, workflows, assets };
    },
    [org.id],
  );
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [device, setDevice] = useState<Device>('mobile');

  useUnsavedGuard(kit !== null && JSON.stringify(kit) !== saved);

  const loadedFor = q.data ? `${org.id}:${q.data.kit.updatedAt}` : '';
  useEffect(() => {
    if (q.data) {
      setKit(structuredClone(q.data.kit));
      setSaved(JSON.stringify(q.data.kit));
      setCandidates([]);
    }
    // Reload only when the stored kit changes (another tab, or after saving).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedFor]);

  const assetUrls = useMemo(() => Object.fromEntries((q.data?.assets ?? []).map((a) => [a.id, a.dataUrl])), [q.data?.assets]);
  const sample = q.data?.workflows.find((w) => w.status === 'published') ?? q.data?.workflows[0];
  const previewTheme = useMemo(() => (sample && kit ? effectiveTheme({ ...sample.design, inheritBrand: true }, kit) : null), [sample, kit]);

  if (q.loading || (q.data && !kit)) return <Spinner />;
  if (q.error || !q.data || !kit) return <ErrorState error={q.error ?? 'לא נטען'} onRetry={q.reload} />;

  const dirty = JSON.stringify(kit) !== saved;
  const inheriting = q.data.workflows.filter((w) => w.design.inheritBrand);
  const set = (fn: (k: BrandKit) => void) =>
    setKit((k) => {
      if (!k) return k;
      const next = structuredClone(k);
      fn(next);
      return next;
    });
  const warnings = previewTheme ? themeTokens(previewTheme).warnings : [];

  const save = async () => {
    if (!kit.displayName.trim()) return toast('נדרש שם תצוגה', 'error');
    setBusy(true);
    try {
      const stored = await repo.updateBrandKit(org.id, { ...kit, displayName: kit.displayName.trim(), description: kit.description.trim() });
      setSaved(JSON.stringify(stored));
      setKit(stored);
      toast('ערכת המותג נשמרה · תהליכים שיורשים יתעדכנו בטיוטה');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'השמירה נכשלה', 'error');
    } finally {
      setBusy(false);
    }
  };

  const extract = async () => {
    const url = kit.logoAssetId ? assetUrls[kit.logoAssetId] : undefined;
    if (!url) return toast('בחרו או העלו לוגו קודם', 'error');
    try {
      const colors = await extractColors(url);
      setCandidates(colors);
      toast(colors.length ? `נמצאו ${colors.length} צבעים בלוגו` : 'לא נמצאו צבעים בולטים בלוגו', colors.length ? 'success' : 'info');
    } catch {
      toast('לא ניתן לקרוא את הלוגו', 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="ערכת מותג"
        description="הזהות הוויזואלית של העסק. תהליכים שמוגדרים ״לרשת מהמותג״ מקבלים את הצבעים, הגופן, הלוגו והכפתורים מכאן."
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                if (!window.confirm('לאפס צבעים, גופן, כפתורים וריווח לברירת המחדל של הסגנון שנבחר? השם, התיאור והתמונות נשמרים. השינוי יחול רק אחרי שמירה.')) return;
                const preset = buildTheme(kit.personality);
                set((k) => {
                  k.palette = { primary: preset.palette.primary, secondary: preset.palette.secondary, accent: preset.palette.accent, background: preset.palette.background };
                  k.typography = preset.typography;
                  k.button = preset.components.button;
                  k.density = preset.density;
                  k.decorations = true;
                  k.logoPlacement = 'start';
                });
                setCandidates([]);
              }}
            >
              איפוס לברירת מחדל
            </Button>
            <Button variant="ghost" icon={RotateCcw} disabled={!dirty} onClick={() => setKit(JSON.parse(saved))}>
              ביטול שינויים
            </Button>
            <Button icon={Save} onClick={save} loading={busy} disabled={!dirty}>
              שמירה
            </Button>
          </>
        }
      />
      <p className="mb-5 rounded-xl border border-cloud-200 bg-white p-3 text-xs leading-relaxed text-ink-muted">
        {inheriting.length} מתוך {q.data.workflows.length} תהליכים יורשים את המותג.{' '}
        <strong className="font-medium text-ink">גרסאות שכבר פורסמו לא משתנות</strong> — השינוי יופיע בקישור הציבורי רק אחרי פרסום גרסה חדשה. התמונות נשמרות בדפדפן זה בלבד ואינן נשלחות לשום מקום.
      </p>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <div className="space-y-5">
          <Group title="זהות">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="bk-name" required>
                  שם תצוגה
                </FieldLabel>
                <Input id="bk-name" maxLength={60} value={kit.displayName} invalid={!kit.displayName.trim()} onChange={(e) => set((k) => void (k.displayName = e.target.value))} />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium">מיקום הלוגו</p>
                <div className="flex gap-1.5" role="radiogroup" aria-label="מיקום הלוגו">
                  {(['start', 'center', 'hidden'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      role="radio"
                      aria-checked={kit.logoPlacement === p}
                      onClick={() => set((k) => void (k.logoPlacement = p))}
                      className={cx('min-h-[40px] flex-1 rounded-lg border text-xs font-medium', kit.logoPlacement === p ? 'border-midnight bg-midnight text-white' : 'border-cloud-300 bg-white text-ink-muted')}
                    >
                      {PLACEMENT[p]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="bk-desc">תיאור קצר</FieldLabel>
              <Textarea id="bk-desc" rows={2} maxLength={240} value={kit.description} onChange={(e) => set((k) => void (k.description = e.target.value))} />
            </div>
          </Group>

          <Group title="לוגו ותמונות" hint="PNG / JPG / WebP. מוקטנים מקומית לפני השמירה; מגבלת אחסון בדמו ~1.2MB לסביבת עבודה.">
            <ImagePicker kind="logo" label="לוגו ראשי" hint="רקע שקוף נראה הכי טוב." selected={kit.logoAssetId} assets={q.data.assets} urls={assetUrls} orgId={org.id} onSelect={(id) => set((k) => void (k.logoAssetId = id))} />
            <ImagePicker kind="logo" label="לוגו משני (אופציונלי)" hint="סימן קטן / אייקון, לשימוש עתידי בכותרות קומפקטיות." selected={kit.secondaryLogoAssetId} assets={q.data.assets} urls={assetUrls} orgId={org.id} onSelect={(id) => set((k) => void (k.secondaryLogoAssetId = id))} />
            <ImagePicker kind="cover" label="תמונת כיסוי ברירת מחדל" hint="משמשת בפתיח כשלתהליך אין תמונה משלו. רק תמונות שבבעלותכם." selected={kit.coverAssetId} assets={q.data.assets} urls={assetUrls} orgId={org.id} onSelect={(id) => set((k) => void (k.coverAssetId = id))} />
          </Group>

          <Group title="צבעים" hint="אפשר לחלץ הצעות צבע מהלוגו — חישוב מקומי בדפדפן, לא AI.">
            <div className="grid gap-3 sm:grid-cols-2">
              <ColorInput label="ראשי" value={kit.palette.primary} onChange={(v) => set((k) => void (k.palette.primary = v))} />
              <ColorInput label="משני" value={kit.palette.secondary} onChange={(v) => set((k) => void (k.palette.secondary = v))} />
              <ColorInput label="הדגשה" value={kit.palette.accent} onChange={(v) => set((k) => void (k.palette.accent = v))} />
              <ColorInput label="רקע" value={kit.palette.background} onChange={(v) => set((k) => void (k.palette.background = v))} />
            </div>
            <Button size="sm" variant="secondary" icon={Pipette} onClick={extract} disabled={!kit.logoAssetId}>
              חילוץ צבעים מהלוגו
            </Button>
            {candidates.length > 0 && (
              <ul className="space-y-2" aria-label="צבעים שנמצאו בלוגו">
                {candidates.map((c) => (
                  <li key={c} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="h-6 w-6 rounded-full ring-1 ring-black/10" style={{ background: c }} aria-hidden />
                    <code dir="ltr" className="w-16">
                      {c}
                    </code>
                    {ROLES.map(([role, label]) => (
                      <Button key={role} size="sm" variant="ghost" onClick={() => set((k) => void (k.palette[role] = c))}>
                        כ{label}
                      </Button>
                    ))}
                  </li>
                ))}
              </ul>
            )}
            {warnings.length > 0 && (
              <ul role="status" className="space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
                {warnings.map((w) => (
                  <li key={w}>• {w}</li>
                ))}
              </ul>
            )}
          </Group>

          <Group title="סגנון">
            <div>
              <p className="mb-1.5 text-sm font-medium">גופן</p>
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="גופן">
                {TYPOGRAPHY_PRESETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={kit.typography === t}
                    onClick={() => set((k) => void (k.typography = t))}
                    className={cx('rounded-xl border px-3 py-2 text-start transition', kit.typography === t ? 'border-midnight bg-cloud' : 'border-cloud-300 hover:border-ink-soft')}
                  >
                    <span className="block text-lg leading-tight" style={{ fontFamily: TYPOGRAPHY[t].display, fontWeight: TYPOGRAPHY[t].weight }}>
                      {kit.displayName || 'כל רעיון הופך לתהליך'}
                    </span>
                    <span className="text-[11px] text-ink-muted">{TYPOGRAPHY[t].label}</span>
                  </button>
                ))}
              </div>
            </div>
            <Segmented label="צורת כפתורים" value={kit.button} options={BUTTON_VARIANTS} labels={L.button} onChange={(v) => set((k) => void (k.button = v))} />
            <Segmented label="צפיפות" value={kit.density} options={DENSITIES} labels={L.density} onChange={(v) => set((k) => void (k.density = v))} />
            <Toggle checked={kit.decorations} onChange={(v) => set((k) => void (k.decorations = v))}>
              איורים דקורטיביים בפתיח (כבוי = מראה נקי בלי איורים)
            </Toggle>
          </Group>

          <Group title="אישיות עיצובית ברירת מחדל" hint="הסגנון שמוצע לתהליכים חדשים. כל תהליך יכול לבחור אחר.">
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3" role="radiogroup" aria-label="אישיות עיצובית">
              {PRESET_LIST.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={kit.personality === p.id}
                  onClick={() => set((k) => void (k.personality = p.id))}
                  className={cx('rounded-2xl border bg-white p-2 text-start transition', kit.personality === p.id ? 'border-midnight ring-2 ring-midnight/15' : 'border-cloud-200 hover:border-ink-soft')}
                >
                  <PresetPreview theme={buildTheme(p.id)} />
                  <span className="mt-2 flex items-center gap-1.5 px-1 text-sm font-semibold">
                    {p.nameHe}
                    {kit.personality === p.id && <Check className="ms-auto h-4 w-4" aria-hidden />}
                  </span>
                </button>
              ))}
            </div>
          </Group>
        </div>

        <div className="xl:sticky xl:top-6 xl:self-start">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <Palette className="h-3.5 w-3.5" aria-hidden /> תצוגה חיה{sample ? `: ${sample.draft.title}` : ''}
              {dirty && <Badge tone="amber">לא נשמר</Badge>}
            </span>
            <DeviceToggle device={device} onChange={setDevice} />
          </div>
          {sample && previewTheme ? (
            <DevicePreview device={device} height={device === 'mobile' ? 700 : 560}>
              <WorkflowRenderer
                key={`${sample.id}-${device}`}
                config={{ ...sample.draft, branding: { ...sample.draft.branding, logoText: kit.displayName || sample.draft.branding.logoText } }}
                theme={previewTheme}
                assets={assetUrls}
                mode="preview"
                embedded
                scrollFrame
              />
            </DevicePreview>
          ) : (
            <p className="rounded-xl bg-white p-6 text-center text-sm text-ink-muted">
              אין עדיין תהליכים לתצוגה. <Link className="font-medium text-orange" to="/app/workflows/new">צרו תהליך</Link>.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
