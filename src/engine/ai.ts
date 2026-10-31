/**
 * Seam for a future, real model-backed generator. NOT used in the demo:
 * the app only ships the deterministic local generator (generator.ts) and
 * always labels it "יצירת דמו מקומית — ללא חיבור ל-AI".
 *
 * A production implementation must run server-side (no API keys in the
 * browser), validate output with WorkflowConfigSchema / WorkflowThemeSchema,
 * bound tokens, cost, rate and retries, and require human review before
 * publishing. Generated configs are data only — never executable code.
 */
import type { WorkflowConfig } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { generateWorkflowFromPrompt } from './generator';

export interface GenerationRequest {
  prompt: string;
  locale: 'he';
  industryHint?: string;
}

export interface GenerationResponse {
  config: WorkflowConfig;
  theme: WorkflowTheme;
  /** Human-readable notes about what was inferred. */
  notes: string[];
  source: 'local-deterministic' | 'model';
}

export interface AIProvider {
  readonly id: string;
  readonly live: boolean;
  generate(req: GenerationRequest): Promise<GenerationResponse>;
}

/** The only provider in the demo: deterministic keyword matching, no network. */
export const localDeterministicProvider: AIProvider = {
  id: 'local-deterministic',
  live: false,
  async generate(req) {
    const r = generateWorkflowFromPrompt(req.prompt);
    return { config: r.config, theme: r.theme, notes: r.adjustments, source: 'local-deterministic' };
  },
};
