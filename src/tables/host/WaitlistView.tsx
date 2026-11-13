import { Phone, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { Button, cx } from '../../components/ui';
import { waitlistClose, waitlistOffer, waitlistSeat } from '../data/client';
import type { TablesError } from '../domain/errors';
import { displayPhone, telHref } from '../domain/phone';
import { minutesBetween } from '../domain/time';
import type { Shift, WaitlistEntry } from '../domain/types';
import { Ltr } from '../ui';
import { CustomAnswers } from './CustomAnswers';

function Countdown({ until, now }: { until: string; now: Date }) {
  const left = Math.max(0, Math.ceil((new Date(until).getTime() - now.getTime()) / 60_000));
  return <span className="tabular-nums">{left > 0 ? `נשארו ${left} דק׳` : 'פג הזמן — יחזרו להמתנה ברענון הבא'}</span>;
}

export function WaitlistView({ shift, now, canAct, onDone, onAdd, labels }: {
  shift: Shift & { waitlist: WaitlistEntry[] }; now: Date; canAct: boolean; onDone: (m: string) => void; onAdd: () => void; labels: Map<string, string>;
}) {
  if (!shift.waitlist.length) {
    return (
      <div className="hs-empty">
        <p className="text-sm">אין אף אחד ברשימת ההמתנה.</p>
        {canAct && <Button className="mt-4 h-11" icon={Plus} onClick={onAdd}>הוספה לרשימת ההמתנה</Button>}
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="hs-section-h"><span>ממתינים לשולחן</span><span className="tabular-nums">· {shift.waitlist.length}</span></h2>
        {canAct && <Button variant="secondary" icon={Plus} onClick={onAdd} className="h-11">הוספה</Button>}
      </div>
      <ol className="hs-list">
        {shift.waitlist.map((e) => <WaitlistRow key={e.id} e={e} now={now} canAct={canAct} onDone={onDone} labels={labels} />)}
      </ol>
      <p className="hs-muted px-1 text-xs">הסדר: הצעות פתוחות, עדיפות, ואז זמן ההמתנה. השולחן המוצע מחושב לפי מה שפנוי עכשיו — ההחלטה שלכם.</p>
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
  const seatLabel = e.status === 'offered' ? `הושבה בשולחן ${held}` : suggestion ? `הושבה בשולחן ${suggestion}` : null;
  return (
    <li className="hs-wl" data-offered={e.status === 'offered' || undefined}>
      <div className="flex items-start gap-3">
        <span className="hs-wl-rank" aria-label={`מקום ${e.rank} בתור`}>{e.rank}</span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[16px] font-semibold">{e.guestName}</span>
            <span className="hs-muted text-sm tabular-nums">{e.party} סועדים</span>
          </p>
          <p className="hs-muted mt-0.5 flex flex-wrap gap-x-3 text-[13px]">
            {e.priority > 0 && <span className="inline-flex items-center gap-1 font-medium text-[var(--hs-arrived)]"><Star className="h-3.5 w-3.5" aria-hidden /> עדיפות: {e.priorityReason}</span>}
            {e.status === 'waiting' && <span>{suggestion ? `מתאים עכשיו: שולחן ${suggestion}` : 'אין עכשיו שולחן פנוי מתאים'}</span>}
            {e.quotedMin != null && <span>נאמר להם: <bdi dir="ltr">{e.quotedMin}–{e.quotedMax}</bdi> דק׳</span>}
            {e.source === 'public' && <span>נרשמו מהטלפון</span>}
            {e.notes && <span>הערה: {e.notes}</span>}
          </p>
          <CustomAnswers answers={e.customAnswers} compact />
        </div>
        <span className="hs-wl-wait" aria-label={`ממתינים ${waited} דקות`}><b>{waited}</b><small>דק׳</small></span>
      </div>
      {e.status === 'offered' && e.offerExpiresAt && (
        <p className="mt-2 rounded-lg bg-[var(--hs-accent-soft)] px-3 py-1.5 text-sm">שולחן {held} שמור להם · <Countdown until={e.offerExpiresAt} now={now} /></p>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {canAct && (
        <div className="mt-3 grid gap-2">
          {seatLabel && (
            <div className={cx('grid gap-2', e.status === 'waiting' && 'grid-cols-[1fr_auto]')}>
              <Button variant="dark" loading={busy === 'seat'} onClick={() => run('seat', () => waitlistSeat(e.id, e.status === 'offered' ? null : e.suggestion!.tableIds, e.lockVersion), `${e.guestName} הושבו`)} className="h-12">
                {seatLabel}
              </Button>
              {e.status === 'waiting' && (
                <Button variant="secondary" loading={busy === 'offer'} onClick={() => run('offer', () => waitlistOffer(e.id, e.suggestion!.tableIds, e.lockVersion), `שולחן ${suggestion} נשמר ל${e.guestName}`)} className="h-12">
                  לשמור שולחן
                </Button>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-1">
            {e.guestPhone && (
              <a href={telHref(e.guestPhone)} className="hs-quiet"><Phone className="h-4 w-4" aria-hidden /><span className="sr-only">התקשרות ל{e.guestName}: </span><Ltr>{displayPhone(e.guestPhone)}</Ltr></a>
            )}
            {e.status === 'offered' && <button type="button" disabled={!!busy} onClick={() => run('back', () => waitlistClose(e.id, 'waiting', e.lockVersion), 'ההצעה בוטלה, חזרו להמתנה')} className="hs-quiet">ביטול השמירה</button>}
            <button type="button" disabled={!!busy} onClick={() => run('left', () => waitlistClose(e.id, 'departed', e.lockVersion), `${e.guestName} הוסרו מהרשימה`)} className="hs-quiet">עזבו</button>
            <button type="button" disabled={!!busy} onClick={() => run('nr', () => waitlistClose(e.id, 'no_response', e.lockVersion), `${e.guestName}: לא ענו`)} className="hs-quiet">לא ענו</button>
          </div>
        </div>
      )}
    </li>
  );
}
