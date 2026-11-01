/**
 * The "focus" fill experience shows one question at a time. A step's visible fields are grouped
 * into screens: every answerable field gets its own screen, and presentation blocks (a heading, an
 * image, highlights, a note) travel with the question that follows them, so context is never lost.
 * Trailing presentation blocks join the last question. A step of presentation only is one screen.
 */
import { isDisplayField, type WorkflowField } from '../domain/schema';

export function focusScreens(fields: readonly WorkflowField[]): WorkflowField[][] {
  const screens: WorkflowField[][] = [];
  let pending: WorkflowField[] = [];
  for (const f of fields) {
    if (isDisplayField(f)) {
      pending.push(f);
      continue;
    }
    screens.push([...pending, f]);
    pending = [];
  }
  if (pending.length) {
    if (screens.length) screens[screens.length - 1]!.push(...pending);
    else screens.push(pending);
  }
  return screens.length ? screens : [[]];
}

/** "Question n of N" across all steps, for the focus counter. */
export function focusPosition(perStep: readonly number[], stepIndex: number, screenIndex: number): { n: number; total: number } {
  const total = perStep.reduce((a, b) => a + b, 0);
  const before = perStep.slice(0, stepIndex).reduce((a, b) => a + b, 0);
  return { n: Math.min(total, before + screenIndex + 1), total };
}
