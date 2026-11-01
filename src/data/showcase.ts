/**
 * The demo businesses' own identity: invented logos and CC0 / public-domain photos
 * (public/showcase/CREDITS.md). They ship as static files of the site, never in the visitor's
 * localStorage, and resolve like uploaded assets (same-origin paths, so the CSP stays self-only).
 * `applyShowcase` puts them on a demo workspace: brand kit, every design (draft and published),
 * option photos and contact details. Real workspaces are never touched.
 */
import type { OrgData, WorkflowConfig } from '../domain/schema';
import type { Asset, MediaSettings, PresenceLink, WorkflowTheme } from '../domain/theme';

type Entry = { key: string; kind: Asset['kind']; name: string; w: number; h: number };
const ORG = { bloom: 'org_bloom', autocare: 'org_autocare', urban: 'org_urban', valley: 'org_valley' } as const;
const FOLDER: Record<string, string> = { [ORG.bloom]: 'bloom', [ORG.autocare]: 'garage', [ORG.urban]: 'urban', [ORG.valley]: 'valley' };

const LIBRARY: Record<string, Entry[]> = {
  [ORG.bloom]: [
    { key: 'logo', kind: 'logo', name: 'לוגו Bloom Studio', w: 420, h: 112 },
    { key: 'mark', kind: 'logo', name: 'סמל Bloom Studio', w: 100, h: 100 },
    { key: 'cover', kind: 'cover', name: 'זר ורוד', w: 1600, h: 1200 },
    { key: 'roses', kind: 'image', name: 'ורדים אדומים', w: 900, h: 675 },
    { key: 'garden', kind: 'image', name: 'אדמוניות', w: 900, h: 675 },
    { key: 'tall', kind: 'image', name: 'זר גבוה באגרטל', w: 900, h: 675 },
    { key: 'peonies', kind: 'image', name: 'אדמוניות על עץ', w: 900, h: 900 },
    { key: 'vase', kind: 'image', name: 'אגרטל אדמוניות', w: 900, h: 900 },
    { key: 'orange-roses', kind: 'image', name: 'ורדים כתומים', w: 900, h: 900 },
  ],
  [ORG.autocare]: [
    { key: 'logo', kind: 'logo', name: 'לוגו AutoCare', w: 420, h: 112 },
    { key: 'mark', kind: 'logo', name: 'סמל AutoCare', w: 100, h: 100 },
    { key: 'engine-wide', kind: 'cover', name: 'תא המנוע', w: 1400, h: 1050 },
    { key: 'sockets', kind: 'image', name: 'בוקסות', w: 900, h: 900 },
    { key: 'extension', kind: 'image', name: 'מאריך לבוקסות', w: 900, h: 900 },
    { key: 'bits', kind: 'image', name: 'ביטים', w: 900, h: 900 },
    { key: 'engine', kind: 'image', name: 'מנוע', w: 900, h: 900 },
  ],
  [ORG.urban]: [
    { key: 'logo', kind: 'logo', name: 'לוגו Urban Table', w: 420, h: 112 },
    { key: 'mark', kind: 'logo', name: 'סמל Urban Table', w: 100, h: 100 },
    { key: 'terrace', kind: 'cover', name: 'שולחן במרפסת', w: 1600, h: 1200 },
    { key: 'table', kind: 'cover', name: 'החדר הפרטי', w: 1600, h: 1200 },
    { key: 'view', kind: 'image', name: 'שולחן מול המים', w: 900, h: 900 },
    { key: 'slate', kind: 'image', name: 'מנת שף', w: 900, h: 900 },
    { key: 'gnocchi', kind: 'image', name: 'ניוקי', w: 900, h: 900 },
    { key: 'lasagna', kind: 'image', name: 'לזניה', w: 900, h: 900 },
  ],
  [ORG.valley]: [
    { key: 'logo', kind: 'logo', name: 'לוגו Valley Run', w: 420, h: 112 },
    { key: 'mark', kind: 'logo', name: 'סמל Valley Run', w: 100, h: 100 },
    { key: 'valley', kind: 'cover', name: 'העמק', w: 1600, h: 1200 },
    { key: 'trail', kind: 'image', name: 'שביל ביער', w: 900, h: 675 },
    { key: 'track', kind: 'image', name: 'מסלול ריצה', w: 900, h: 675 },
    { key: 'hills', kind: 'image', name: 'גבעות ירוקות', w: 900, h: 675 },
    { key: 'mountains', kind: 'image', name: 'נוף העמק', w: 900, h: 900 },
  ],
};

/** Asset id of a showcase file: `ast_sh` + business + file key (letters and digits only). */
export const showcaseId = (orgId: string, key: string) => `ast_sh${FOLDER[orgId]}${key.replace(/[^a-z0-9]/g, '')}`;
export const isShowcaseId = (id: string) => id.startsWith('ast_sh');

/** The library as assets (never stored; `dataUrl` holds the site-relative path). */
export function showcaseAssets(orgId: string): Asset[] {
  return (LIBRARY[orgId] ?? []).map((e) => ({
    id: showcaseId(orgId, e.key),
    orgId,
    kind: e.kind,
    name: e.name,
    mime: e.kind === 'logo' ? 'image/svg+xml' : 'image/jpeg',
    dataUrl: `showcase/${FOLDER[orgId]}/${e.key}.${e.kind === 'logo' ? 'svg' : 'jpg'}`,
    bytes: 1,
    width: e.w,
    height: e.h,
    createdAt: '2026-01-01T00:00:00.000Z',
  }));
}

/** Contact details shown on the demo forms (rendered as non-navigating previews). */
const CONTACT: Record<string, Record<string, string>> = {
  [ORG.bloom]: { lnk_bloom_ig: 'הזרים של השבוע', lnk_bloom_web: 'הקטלוג המלא', lnk_bloom_wa: 'מענה עד שעה', lnk_bloom_tel: '03-555-0100', lnk_bloom_review: 'כל ביקורת עוזרת לנו' },
  [ORG.autocare]: { lnk_auto_waze: 'רח׳ המלאכה 14, אזור התעשייה', lnk_auto_wa: 'שאלות על התיקון', lnk_auto_tel: '03-555-0177', lnk_auto_maps: 'פתוח א׳–ה׳ 07:30–18:00', lnk_auto_review: 'כל ביקורת עוזרת לנו' },
  [ORG.urban]: { lnk_urban_ig: 'המנות והאווירה', lnk_urban_maps: 'שדרות הים 3, קומת קרקע', lnk_urban_web: 'התפריט המלא', lnk_urban_tel: '03-555-0133', lnk_urban_tt: 'מאחורי הקלעים במטבח' },
  [ORG.valley]: { lnk_valley_web: 'כל פרטי המרוץ', lnk_valley_ig: 'עדכונים מהמסלול', lnk_valley_fb: 'קהילת הרצים', lnk_valley_rules: 'כללים, ציוד ומסלולים' },
};

type Look = { cover: string; media: MediaSettings; logoStyle?: MediaSettings['logoStyle']; options?: Record<string, Record<string, string>> };

/** Per demo workflow (by slug): which photo opens it, how it sits, and the gallery. */
const LOOKS: Record<string, Look> = {
  'bloom-flowers': {
    cover: 'cover',
    media: { coverStyle: 'panel', tone: 'natural', gallery: ['peonies', 'vase', 'orange-roses'], galleryTitle: 'מהסטודיו השבוע', galleryStyle: 'mosaic', galleryPlacement: 'completion' },
    options: { bouquet_style: { round: 'roses', garden: 'garden', tall: 'tall' } },
  },
  'bloom-workshop': { cover: 'vase', media: { coverStyle: 'frame', frame: 'arch', tone: 'natural', gallery: ['peonies', 'orange-roses', 'roses'], galleryStyle: 'strip', galleryPlacement: 'intro' } },
  'autocare-repairs': {
    cover: 'engine-wide',
    media: { coverStyle: 'band', tone: 'mono', gallery: ['sockets', 'extension', 'bits'], galleryTitle: 'הכלים שלנו', galleryStyle: 'strip', galleryPlacement: 'completion' },
  },
  'urban-table-events': {
    cover: 'table',
    media: { coverStyle: 'backdrop', tone: 'warm', gallery: ['slate', 'gnocchi', 'lasagna', 'view'], galleryTitle: 'מהמטבח שלנו', galleryStyle: 'mosaic', galleryPlacement: 'intro' },
  },
  'urban-table-booking': {
    cover: 'terrace',
    media: { coverStyle: 'backdrop', tone: 'warm', gallery: ['slate', 'gnocchi', 'lasagna'], galleryTitle: 'מחכה לכם על השולחן', galleryStyle: 'strip', galleryPlacement: 'completion' },
  },
  'valley-run': {
    cover: 'valley',
    media: { coverStyle: 'panel', tone: 'natural', gallery: ['trail', 'mountains', 'track'], galleryTitle: 'המסלולים', galleryStyle: 'polaroid', galleryPlacement: 'completion' },
    options: { track: { family_3k: 'hills', classic_10k: 'trail', half_21k: 'track' } },
  },
};

function dress(design: WorkflowTheme, orgId: string, look: Look | undefined) {
  const id = (key: string) => showcaseId(orgId, key);
  // The full logo (mark + name) shown large; the name is already part of it.
  design.logo.assetId = id('logo');
  design.logo.showName = false;
  if (!look) {
    design.media = { ...(design.media ?? {}), logoStyle: 'wordmark' };
    return;
  }
  design.hero.coverAssetId = id(look.cover);
  design.media = { ...look.media, gallery: look.media.gallery?.map(id), logoStyle: look.logoStyle ?? 'wordmark' };
}

function dressOptions(config: WorkflowConfig, orgId: string, look: Look | undefined) {
  for (const step of config.steps)
    for (const f of step.fields) {
      const map = look?.options?.[f.key];
      if (!map) continue;
      for (const o of f.options ?? []) if (map[o.value]) o.image = showcaseId(orgId, map[o.value]!);
      if (f.appearance === undefined || f.appearance === 'auto' || f.appearance === 'tiles') f.appearance = 'image_cards';
    }
}

const dressLinks = (links: PresenceLink[] | undefined, orgId: string) =>
  links?.forEach((l) => {
    const d = CONTACT[orgId]?.[l.id];
    if (d) l.description = d;
  });

/** Puts the showcase identity on a demo workspace (idempotent). */
export function applyShowcase(data: OrgData): OrgData {
  const orgId = data.organization.id;
  if (!data.organization.isDemo || !LIBRARY[orgId]) return data;
  data.brandKit.logoAssetId = showcaseId(orgId, 'logo');
  data.brandKit.secondaryLogoAssetId = showcaseId(orgId, 'mark');
  dressLinks(data.brandKit.links, orgId);
  const slugOf = new Map(data.workflows.map((w) => [w.id, w.slug]));
  for (const w of data.workflows) {
    dress(w.design, orgId, LOOKS[w.slug]);
    dressLinks(w.design.presence?.links, orgId);
    dressOptions(w.draft, orgId, LOOKS[w.slug]);
  }
  // Demo versions are dressed too: the demo exists to show the product (as in the v5 -> v6 step).
  for (const v of data.versions) {
    const look = LOOKS[slugOf.get(v.workflowId) ?? ''];
    dress(v.design, orgId, look);
    dressLinks(v.design.presence?.links, orgId);
    dressOptions(v.config, orgId, look);
  }
  return data;
}
