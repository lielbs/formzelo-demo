/**
 * The "describe in your own words" corpus: 186 real-sounding owner descriptions (plus 55 held-out ones
 * written after tuning, in corpus/heldout.ts) and what each must produce. Run with CORPUS_REPORT=<file> to write the per-check accuracy report (used to compare
 * engine versions); CORPUS_BASELINE=1 only reports and never fails.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WorkflowConfigSchema } from '../domain/schema';
import { generateWorkflowFromPrompt } from '../engine/generator';
import { logicIssues } from '../engine/logic';
import { CORPUS } from './corpus/descriptions';
import { HELD_OUT } from './corpus/heldout';
import { industryOf, scoreCase, type Check } from './corpus/score';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const baseline = env.CORPUS_BASELINE === '1';

const results = [...CORPUS, ...HELD_OUT].map((c) => {
  const r = generateWorkflowFromPrompt(c.text);
  return { c, r, checks: scoreCase(c, r) };
});

function summary() {
  const all = results.flatMap((x) => x.checks);
  const by = new Map<string, { ok: number; n: number }>();
  for (const ch of all) {
    const k = ch.name.split(':')[0]!.replace(/^q$/, `q:${ch.name.split(':')[1]}`);
    const v = by.get(k) ?? { ok: 0, n: 0 };
    v.n++;
    if (ch.ok) v.ok++;
    by.set(k, v);
  }
  const pct = (a: number, b: number) => `${((100 * a) / b).toFixed(1)}%`;
  const okChecks = all.filter((c) => c.ok).length;
  const perfect = results.filter((x) => x.checks.every((c) => c.ok)).length;
  const exact = results.filter((x) => industryOf(x.r) === x.c.industry).length;
  return {
    cases: results.length,
    checks: all.length,
    accuracy: pct(okChecks, all.length),
    fullyCorrect: `${perfect}/${results.length} (${pct(perfect, results.length)})`,
    exactBusinessType: `${exact}/${results.length} (${pct(exact, results.length)})`,
    byCheck: Object.fromEntries([...by].sort().map(([k, v]) => [k, `${v.ok}/${v.n} (${pct(v.ok, v.n)})`])),
    failures: results.filter((x) => x.checks.some((c) => !c.ok)).map((x) => ({ id: x.c.id, failed: x.checks.filter((c: Check) => !c.ok).map((c) => `${c.name}${c.detail ? ` [${c.detail}]` : ''}`) })),
  };
}

describe('describe-in-your-own-words corpus', () => {
  it('has at least 150 descriptions with unique ids', () => {
    expect(CORPUS.length).toBeGreaterThanOrEqual(150);
    const ids = [...CORPUS, ...HELD_OUT].map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports accuracy', () => {
    const s = summary();
    if (env.CORPUS_REPORT) writeFileSync(env.CORPUS_REPORT, JSON.stringify(s, null, 2));
    expect(s.cases).toBe(CORPUS.length + HELD_OUT.length);
  });

  it.skipIf(baseline).each(results.map((x) => [x.c.id, x] as const))('%s', (_id, { c, r, checks }) => {
    expect(WorkflowConfigSchema.safeParse(r.config).success).toBe(true);
    const keys = r.config.steps.flatMap((s) => s.fields.map((f) => f.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(industryOf(r)).toBe(c.industry);
    expect(logicIssues(r.config).filter((i) => i.level === 'error').map((i) => i.message)).toEqual([]);
    expect(checks.filter((ch) => !ch.ok).map((ch) => `${ch.name} ${ch.detail ?? ''}`)).toEqual([]);
  });
});
