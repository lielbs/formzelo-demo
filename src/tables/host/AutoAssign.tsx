import { CheckCircle2, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button, Modal } from '../../components/ui';
import { moveReservation } from '../data/client';
import { proposeAssignments } from '../domain/autoAssign';
import type { TablesError } from '../domain/errors';
import type { Shift } from '../domain/types';

/**
 * Auto-assign for the evening (UX audit 2026-11, A3.7): the host sees one proposed table per
 * booking that has none, unticks what they want to keep for later, and applies the rest in one go.
 * Each move goes to the server on its own; one that no longer fits is reported, the rest continue.
 */
export function AutoAssign({ shift, onClose, onDone }: { shift: Shift; onClose: () => void; onDone: (message: string) => void }) {
  const { proposals, unplaced } = useMemo(() => proposeAssignments(shift), [shift]);
  const [chosen, setChosen] = useState(() => new Set(proposals.map((p) => p.reservation.id)));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);

  async function apply() {
    setBusy(true);
    const errors: string[] = [];
    let ok = 0;
    for (const p of proposals.filter((x) => chosen.has(x.reservation.id))) {
      try { await moveReservation(p.reservation.id, [p.tableId], p.reservation.lockVersion); ok++; }
      catch (e) { errors.push(`${p.reservation.guestName}: ${(e as TablesError).message}`); }
    }
    setBusy(false);
    if (errors.length) { setFailed(errors); onDone(ok ? `${ok} הזמנות שובצו` : ''); return; }
    onDone(ok === 1 ? 'הזמנה אחת שובצה' : `${ok} הזמנות שובצו`);
  }

  return (
    <Modal open onClose={onClose} title="שיבוץ אוטומטי"
      footer={proposals.length > 0 && !failed.length ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose} className="h-11">ביטול</Button>
          <Button icon={CheckCircle2} loading={busy} disabled={!chosen.size} onClick={() => void apply()} className="h-11">
            {chosen.size === 1 ? 'שיבוץ הזמנה אחת' : `שיבוץ ${chosen.size} הזמנות`}
          </Button>
        </div>
      ) : <div className="flex justify-end"><Button variant="secondary" onClick={onClose} className="h-11">סגירה</Button></div>}>
      {failed.length > 0 ? (
        <div role="alert" className="grid gap-2">
          <p className="font-medium">חלק מההזמנות לא שובצו, כי המצב השתנה בינתיים:</p>
          <ul className="list-inside list-disc text-sm text-red-800">{failed.map((f) => <li key={f}>{f}</li>)}</ul>
        </div>
      ) : proposals.length === 0 ? (
        <p className="text-sm text-ink-muted">{unplaced.length ? 'אין כרגע שולחן פנוי מתאים להזמנות שעוד בלי שולחן.' : 'לכל ההזמנות כבר יש שולחן.'}</p>
      ) : (
        <div className="grid gap-3">
          <p className="flex items-center gap-2 text-sm text-ink-muted"><Sparkles className="h-4 w-4" aria-hidden />
            לכל הזמנה בלי שולחן הוצע השולחן המתאים ביותר שפנוי בשעה שלה. אפשר לבטל סימון של הזמנה ולשבץ אותה ידנית.</p>
          <ul className="grid gap-1.5">
            {proposals.map((p) => (
              <li key={p.reservation.id}>
                <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-cloud-200 px-3">
                  <input type="checkbox" className="h-5 w-5 accent-orange-600" checked={chosen.has(p.reservation.id)}
                    onChange={(e) => setChosen((cur) => { const next = new Set(cur); if (e.target.checked) next.add(p.reservation.id); else next.delete(p.reservation.id); return next; })} />
                  <bdi dir="ltr" className="font-semibold tabular-nums">{p.reservation.time}</bdi>
                  <span className="min-w-0 flex-1 truncate">{p.reservation.guestName} · {p.reservation.party} סועדים</span>
                  <span className="shrink-0 font-semibold">שולחן {p.label}</span>
                </label>
              </li>
            ))}
          </ul>
          {unplaced.length > 0 && (
            <p className="text-sm text-amber-800">אין שולחן פנוי מתאים ל: {unplaced.map((r) => `${r.guestName} (${r.time})`).join(', ')}. אפשר לחבר שולחנות או לשבץ ידנית.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
