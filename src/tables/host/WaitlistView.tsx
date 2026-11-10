import { Clock, Phone, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { Button, cx } from '../../components/ui';
import { waitlistClose, waitlistOffer, waitlistSeat } from '../data/client';
import type { TablesError } from '../domain/errors';
import { displayPhone, telHref } from '../domain/phone';
import { minutesBetween } from '../domain/time';
import type { Shift, WaitlistEntry } from '../domain/types';
import { Ltr } from '../ui';

function Countdown({ until, now }: { until: string; now: Date }) {
  const left = Math.max(0, Math.ceil((new Date(until).getTime() - now.getTime()) / 60_000));
  return <span className="tabular-nums">{left > 0 ? `נשארו ${left} דק׳` : 'פג הזמן — יחזרו להמתנה ברענון הבא'}</span>;
}

export function WaitlistView({ shift, now, canAct, onDone, onAdd, labels }: {
  shift: Shift & { waitlist: WaitlistEntry[] }; now: Date; canAct: boolean; onDone: (m: string) => void; onAdd: () => void; labels: Map<string, string>;
}) {
  if (!shift.waitlist.length) {
    return (
      <div className="rounded-2xl border border-dashed border-cloud-300 bg-white p-8 text-center">
        <p className="text-sm text-ink-muted">אין אף אחד ברשימת ההמתנה.</p>
        {canAct && <Button className="mt-4 h-11" icon={Plus} onClick={onAdd}>הוספה לרשימת ההמתנה</Button>}
      </div>
    );
  }
  return (
    <div className="grid gap-2">
      <p className="text-xs text-ink-muted">הסדר: הצעות פתוחות, עדיפות (עם סיבה), ואז לפי זמן ההמתנה. ההצעה לשולחן מחושבת לפי מה שפנוי עכשיו — ההחלטה שלכם.</p>
      <ol className="grid gap-2">
        {shift.waitlist.map((e) => <WaitlistRow key={e.id} e={e} now={now} canAct={canAct} onDone={onDone} labels={labels} />)}
      </ol>
      {canAct && <div><Button variant="secondary" icon={Plus} onClick={onAdd} className="h-11">הוספה לרשימה</Button></div>}
    </div>
  );
}

function WaitlistRow({ e, now, canAct, onDone, labels }: { e: WaitlistEntry; now: Date; canAct: boolean; onDone: (m: string) => void; labels: Map<string, string> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const waited = minutesBetween(e.joinedAt, now);
  const suggestion = e.suggestion ? e.suggestion.tableIds.map((id) => labels.get(id) ?? '?').join('+') : null;
  const held = e.heldTableIds.map((id) => labels.get(id) ?? '?').join('+');
  async function run(key: string, fn: () => Promise<unknown>, message: string) {
    setBusy(key);
    setError(null);
    try { await fn(); onDone(message); } catch (err) {
      const te = err as TablesError;
      setError(te.message);
      if (te.isConflict) onDone('');
    } finally { setBusy(null); }
  }
  return (
    <li className={cx('rounded-xl border bg-white p-3', e.status === 'offered' ? 'border-sky-300' : 'border-cloud-200')}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cloud text-sm font-semibold tabular-nums" aria-label={`מקום ${e.rank} בתור`}>{e.rank}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{e.guestName}</span>
            <span className="rounded-md bg-cloud px-1.5 text-sm font-semibold tabular-nums">{e.party}</span>
            {e.priority > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 text-xs text-amber-900"><Star className="h-3 w-3" aria-hidden /> עדיפות: {e.priorityReason}</span>}
            {e.source === 'public' && <span className="text-xs text-ink-muted">נרשמו מהטלפון</span>}
          </span>
          <span className="flex flex-wrap items-center gap-x-3 text-xs text-ink-muted">
            <span><Clock className="inline h-3 w-3" aria-hidden /> ממתינים {waited} דק׳</span>
            {e.quotedMin != null && <span>הערכה שנמסרה: <bdi dir="ltr">{e.quotedMin}–{e.quotedMax}</bdi> דק׳</span>}
            {e.status === 'waiting' && <span>{suggestion ? `מתאים עכשיו: שולחן ${suggestion}` : 'אין עכשיו שולחן פנוי מתאים'}</span>}
            {e.notes && <span>הערה: {e.notes}</span>}
          </span>
        </span>
        {e.guestPhone && (
          <a href={telHref(e.guestPhone)} className="inline-flex h-11 items-center gap-1 rounded-xl border border-cloud-300 px-3 text-sm">
            <Phone className="h-4 w-4" aria-hidden /> <span className="sr-only">התקשרות ל{e.guestName}: </span><Ltr>{displayPhone(e.guestPhone)}</Ltr>
          </a>
        )}
      </div>
      {e.status === 'offered' && e.offerExpiresAt && (
        <p className="mt-2 rounded-lg bg-sky-50 px-3 py-1.5 text-sm text-sky-900">שולחן {held} שמור להם · <Countdown until={e.offerExpiresAt} now={now} /></p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {canAct && (
        <div className="mt-2 flex flex-wrap gap-2">
          {e.status === 'waiting' && suggestion && (
            <Button variant="secondary" loading={busy === 'offer'} onClick={() => run('offer', () => waitlistOffer(e.id, e.suggestion!.tableIds, e.lockVersion), `שולחן ${suggestion} נשמר ל${e.guestName}`)} className="h-11">
              לשמור את שולחן {suggestion}
            </Button>
          )}
          {(e.status === 'offered' || suggestion) && (
            <Button variant="dark" loading={busy === 'seat'} onClick={() => run('seat', () => waitlistSeat(e.id, e.status === 'offered' ? null : e.suggestion!.tableIds, e.lockVersion), `${e.guestName} הושבו`)} className="h-11">
              הושבה עכשיו{e.status === 'offered' ? ` בשולחן ${held}` : ` בשולחן ${suggestion}`}
            </Button>
          )}
          {e.status === 'offered' && <Button variant="ghost" loading={busy === 'back'} onClick={() => run('back', () => waitlistClose(e.id, 'waiting', e.lockVersion), 'ההצעה בוטלה, חזרו להמתנה')} className="h-11">ביטול השמירה</Button>}
          <Button variant="ghost" loading={busy === 'left'} onClick={() => run('left', () => waitlistClose(e.id, 'departed', e.lockVersion), `${e.guestName} הוסרו מהרשימה`)} className="h-11">עזבו</Button>
          <Button variant="ghost" loading={busy === 'nr'} onClick={() => run('nr', () => waitlistClose(e.id, 'no_response', e.lockVersion), `${e.guestName}: לא ענו`)} className="h-11">לא ענו</Button>
        </div>
      )}
    </li>
  );
}
