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
import { buildTheme, DEFAULT_PRESET } from '../theme/presets';
import { recommendTheme } from '../theme/resolver';
import { appendBookingDemo, DEMO_ORG_IDS, DEMO_SLUGS } from './seed';

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

export function migrateOrgData(raw: unknown, now = Date.now()): { value: unknown; migrated: boolean } {
  if (!isObj(raw) || typeof raw.schemaVersion !== 'number' || raw.schemaVersion >= SCHEMA_VERSION) return { value: raw, migrated: false };
  let value = raw;
  if (value.schemaVersion === 1) value = v1ToV2(value);
  if (value.schemaVersion === 2) value = v2ToV3(value, now);
  // v3 -> v4: no structural change to a workspace (new fields are optional); new demo workspaces are added at the meta level.
  if (value.schemaVersion === 3) value = { ...value, schemaVersion: 4 };
  return { value, migrated: value !== raw };
}

export function migrateMeta(raw: unknown): { value: unknown; migrated: boolean } {
  if (!isObj(raw) || typeof raw.schemaVersion !== 'number' || raw.schemaVersion >= SCHEMA_VERSION) return { value: raw, migrated: false };
  return { value: { ...raw, schemaVersion: SCHEMA_VERSION }, migrated: true };
}
