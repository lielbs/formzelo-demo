/** Approval rules as readable sentences, plus a browser preview of the server's decision order. */
import { iso, range } from './bidi';
import type { ApprovalRule, Policy, Weekday, ZoneDef } from './types';

export const WEEKDAY_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;
export const WEEKDAY_SHORT_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] as const;

export function daysText(days: Weekday[] | undefined): string {
  if (!days || days.length === 0 || days.length === 7) return 'בכל יום';
  const sorted = [...days].sort();
  return `בימי ${sorted.map((d) => WEEKDAY_HE[d]).join(', ')}`;
}

/** "Parties of 8 or more require approval on Friday and Saturday." */
export function ruleSentence(rule: ApprovalRule, zones: ZoneDef[] = []): string {
  const w = rule.when;
  const parts: string[] = [];
  if (w.partyAtLeast && w.partyAtMost) parts.push(`קבוצות של ${range(w.partyAtLeast, w.partyAtMost)} סועדים`);
  else if (w.partyAtLeast) parts.push(`קבוצות של ${w.partyAtLeast} סועדים ומעלה`);
  else if (w.partyAtMost) parts.push(`קבוצות של עד ${w.partyAtMost} סועדים`);
  else parts.push('כל ההזמנות');
  if (w.weekdays && w.weekdays.length && w.weekdays.length < 7) parts.push(daysText(w.weekdays));
  if (w.fromTime && w.untilTime) parts.push(`בין ${iso(w.fromTime)} ל-${iso(w.untilTime)}`);
  else if (w.fromTime) parts.push(`מ-${iso(w.fromTime)}`);
  else if (w.untilTime) parts.push(`עד ${iso(w.untilTime)}`);
  if (w.zoneIds?.length) parts.push(`באזור ${w.zoneIds.map((id) => zones.find((z) => z.id === id)?.name ?? '—').join(' או ')}`);
  if (w.usesCombination) parts.push('שצריכות שולחנות מחוברים');
  return `${parts.join(' ')} ${rule.then === 'require_manual' ? 'דורשות אישור שלכם' : 'מאושרות מיד'}.`;
}

export interface PreviewInput { party: number; weekday: number; time: string; zoneId?: string | null; usesCombination?: boolean; dateRule?: boolean }

/** Mirrors private.tables_approval for the owner's live preview. The server stays authoritative. */
export function previewApproval(policy: Pick<Policy, 'approvalMode' | 'rules'>, i: PreviewInput): { manual: boolean; rule: string } {
  if (i.dateRule) return { manual: true, rule: 'date_rule' };
  if (policy.approvalMode === 'manual') return { manual: true, rule: 'venue_default' };
  if (policy.approvalMode === 'conditional') {
    let manualRule: string | null = null;
    let autoRule: string | null = null;
    const sorted = [...policy.rules].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.id.localeCompare(b.id));
    for (const r of sorted) {
      if (r.enabled === false) continue;
      const w = r.when;
      const ok = (w.partyAtLeast == null || i.party >= w.partyAtLeast)
        && (w.partyAtMost == null || i.party <= w.partyAtMost)
        && (!w.weekdays?.length || w.weekdays.includes(i.weekday as Weekday))
        && (!w.fromTime || i.time >= w.fromTime)
        && (!w.untilTime || i.time < w.untilTime)
        && (!w.zoneIds?.length || (!!i.zoneId && w.zoneIds.includes(i.zoneId)))
        && (w.usesCombination == null || w.usesCombination === !!i.usesCombination);
      if (!ok) continue;
      if (r.then === 'require_manual' && !manualRule) manualRule = r.id;
      if (r.then === 'auto' && !autoRule) autoRule = r.id;
    }
    if (manualRule) return { manual: true, rule: manualRule };
    if (autoRule) return { manual: false, rule: autoRule };
  }
  return { manual: false, rule: 'venue_default' };
}

export function minutesText(m: number): string {
  if (m === 0) return 'עד מועד ההזמנה';
  if (m % 1440 === 0) return m === 1440 ? 'יום לפני' : `${m / 1440} ימים לפני`;
  if (m % 60 === 0) return m === 60 ? 'שעה לפני' : m === 120 ? 'שעתיים לפני' : `${m / 60} שעות לפני`;
  return `${m} דקות לפני`;
}
