/**
 * Forward-only migrations for persisted workspace data. Each step is pure
 * (input JSON -> output JSON) so it can be unit-tested and, in production,
 * replayed server-side. Unknown or newer payloads are returned untouched and
 * left to schema validation (which quarantines rather than deletes them).
 */
import { SCHEMA_VERSION } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { buildTheme, DEFAULT_PRESET } from '../theme/presets';
import { recommendTheme } from '../theme/resolver';

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

export function migrateOrgData(raw: unknown): { value: unknown; migrated: boolean } {
  if (!isObj(raw) || typeof raw.schemaVersion !== 'number' || raw.schemaVersion >= SCHEMA_VERSION) return { value: raw, migrated: false };
  let value = raw;
  if (value.schemaVersion === 1) value = v1ToV2(value);
  return { value, migrated: value !== raw };
}

export function migrateMeta(raw: unknown): { value: unknown; migrated: boolean } {
  if (!isObj(raw) || raw.schemaVersion !== 1) return { value: raw, migrated: false };
  return { value: { ...raw, schemaVersion: SCHEMA_VERSION }, migrated: true };
}
