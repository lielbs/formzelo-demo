/**
 * Forward-only migrations for persisted workspace data. Each step is pure
 * (input JSON -> output JSON) so it can be unit-tested and, in production,
 * replayed server-side. Unknown or newer payloads are returned untouched and
 * left to schema validation (which quarantines rather than deletes them).
 */
import { SCHEMA_VERSION } from '../domain/schema';
import type { OrgData } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { brandKitFromTheme } from '../theme/brand';
import { buildTheme, DEFAULT_PRESET, PRESETS, SIGNATURES } from '../theme/presets';
import { DEMO_EXTRAS } from './demoExtras';
import { recommendTheme } from '../theme/resolver';
import { appendBookingDemo, DEMO_LINKS, DEMO_ORG_IDS, DEMO_SLUGS } from './seed';

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): Json[] => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/**
 * v1 -> v2: add a design to every workflow (chosen by the local theme resolver
 * from its template and text) and freeze the same design onto each existing
 * version. Business config, runs, answers and statuses are not touched.
 */
function v1ToV2(input: Json): Json {
  const data = structuredClone(input);
  const industry = isObj(data.organization) ? str(data.organization.industry) : undefined;
  const byWorkflow = new Map<string, WorkflowTheme>();
  for (const wf of arr(data.workflows)) {
    if (!isObj(wf.design)) {
      const draft = isObj(wf.draft) ? wf.draft : {};
      wf.design = recommendTheme({
        templateKey: str(wf.templateKey),
        title: str(draft.title),
        description: str(draft.description),
        prompt: str(wf.sourcePrompt),
        industry,
      }).theme;
    }
    byWorkflow.set(String(wf.id), wf.design as WorkflowTheme);
  }
  for (const v of arr(data.versions)) {
    if (!isObj(v.design)) v.design = structuredClone(byWorkflow.get(String(v.workflowId)) ?? buildTheme(DEFAULT_PRESET));
  }
  data.schemaVersion = 2;
  return data;
}

/**
 * v2 -> v3: create the workspace brand kit from its main workflow's design and
 * let workflows that already match it inherit it (so nothing changes visually).
 * Published versions are untouched: their new optional fields stay absent and
 * engine/completion.ts derives the legacy behaviour. Existing Urban Table
 * workspaces also receive the new table-booking demo (added, never replacing).
 */
function v2ToV3(input: Json, now = Date.now()): Json {
  const data = structuredClone(input);
  const org = isObj(data.organization) ? data.organization : {};
  const workflows = arr(data.workflows);
  const main = workflows.find((w) => w.status === 'published' && isObj(w.design)) ?? workflows.find((w) => isObj(w.design));
  const design = (main?.design as WorkflowTheme | undefined) ?? buildTheme(DEFAULT_PRESET);
  const at = new Date(now).toISOString();
  const kit = brandKitFromTheme(str(org.name) ?? 'העסק שלי', str(org.tagline) ?? '', design, at);
  data.brandKit = kit;
  for (const wf of workflows) {
    const d = wf.design as WorkflowTheme | undefined;
    if (d && isObj(d)) d.inheritBrand = d.presetId === kit.personality && d.palette?.primary === kit.palette.primary;
  }
  data.schemaVersion = 3;
  if (org.id === DEMO_ORG_IDS.urban && !workflows.some((w) => w.slug === DEMO_SLUGS.booking)) {
    // Only safe after the payload is otherwise valid v3 — the caller re-validates.
    return appendBookingDemo(data as unknown as OrgData, now) as unknown as Json;
  }
  return data;
}

/**
 * v4 -> v5: Business Engagement Kit. Brand kits gain an (empty) links list; the
 * fictional demo workspaces get their labelled, non-clickable sample links.
 * Published versions are untouched, so live workflows keep their exact look until
 * the owner republishes.
 */
function v4ToV5(input: Json): Json {
  const data = structuredClone(input);
  const org = isObj(data.organization) ? data.organization : {};
  if (isObj(data.brandKit)) {
    const kit = data.brandKit;
    const existing = Array.isArray(kit.links) ? kit.links : [];
    const demo = org.isDemo === true ? DEMO_LINKS[String(org.id)] : undefined;
    kit.links = existing.length ? existing : structuredClone(demo ?? []);
  }
  data.schemaVersion = 5;
  return data;
}

/**
 * v5 -> v6: fill experiences and business add-ons. Real workspaces only get the version bump:
 * their designs have no `flow`, which renders as the classic card, exactly as before. The
 * fictional demo workspaces adopt their design's experience and the demo businesses' own
 * add-ons on the draft AND the published version, because the demo exists to show the product.
 * Business config, runs, answers and statuses are not touched.
 */
function v5ToV6(input: Json): Json {
  const data = structuredClone(input);
  const org = isObj(data.organization) ? data.organization : {};
  if (org.isDemo === true) {
    const upgrade = (design: unknown, slug: string) => {
      if (!isObj(design)) return;
      const preset = PRESETS[String(design.presetId) as keyof typeof PRESETS];
      if (!preset) return;
      if (design.flow === undefined) design.flow = SIGNATURES[preset.meta.id].flow;
      if (design.extras === undefined) {
        const extras = { ...(preset.theme.extras ?? {}), ...structuredClone(DEMO_EXTRAS[slug] ?? {}) };
        if (Object.keys(extras).length) design.extras = extras;
      }
    };
    const slugs = new Map<string, string>();
    for (const wf of arr(data.workflows)) {
      slugs.set(String(wf.id), String(wf.slug));
      upgrade(wf.design, String(wf.slug));
    }
    for (const v of arr(data.versions)) upgrade(v.design, slugs.get(String(v.workflowId)) ?? '');
  }
  data.schemaVersion = 6;
  return data;
}

export function migrateOrgData(raw: unknown, now = Date.now()): { value: unknown; migrated: boolean } {
  if (!isObj(raw) || typeof raw.schemaVersion !== 'number' || raw.schemaVersion >= SCHEMA_VERSION) return { value: raw, migrated: false };
  let value = raw;
  if (value.schemaVersion === 1) value = v1ToV2(value);
  if (value.schemaVersion === 2) value = v2ToV3(value, now);
  // v3 -> v4: no structural change to a workspace (new fields are optional); new demo workspaces are added at the meta level.
  if (value.schemaVersion === 3) value = { ...value, schemaVersion: 4 };
  if (value.schemaVersion === 4) value = v4ToV5(value);
  if (value.schemaVersion === 5) value = v5ToV6(value);
  return { value, migrated: value !== raw };
}

export function migrateMeta(raw: unknown): { value: unknown; migrated: boolean } {
  if (!isObj(raw) || typeof raw.schemaVersion !== 'number' || raw.schemaVersion >= SCHEMA_VERSION) return { value: raw, migrated: false };
  return { value: { ...raw, schemaVersion: SCHEMA_VERSION }, migrated: true };
}
