/**
 * The workspace team in production: who has access, invite staff with a private link, revoke a
 * pending invitation, or remove someone (immediately, on the server). Owners only manage.
 */
import { Copy, KeyRound, UserMinus, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { copyText, useToast } from '../../components/Toast';
import { Badge, Button, Card, ErrorState, Input, Spinner } from '../../components/ui';
import { formatDateTime } from '../../lib/format';
import { inviteStaff, issueStaffRecovery, listTeam, removeMember, revokeInvitation, type TeamInvitation, type TeamMember } from '../../production/admin';
import { confirmAction } from '../../components/Confirm';

export function TeamCard({ orgId }: { orgId: string }) {
  const toast = useToast();
  const [team, setTeam] = useState<{ members: TeamMember[]; invitations: TeamInvitation[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const isOwner = Boolean(team?.members.find((m) => m.self)?.role === 'owner');

  const load = useCallback(async () => {
    setError(null);
    try {
      setTeam(await listTeam(orgId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הטעינה נכשלה');
    }
  }, [orgId]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'הפעולה נכשלה', 'error');
    } finally {
      setBusy(null);
    }
  };

  const invite = (event: FormEvent) => {
    event.preventDefault();
    void run('invite', async () => {
      const created = await inviteStaff(orgId, email.trim());
      setLink(created.link);
      setEmail('');
    });
  };

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        <Users className="h-4 w-4" aria-hidden /> חברי צוות
      </h2>
      <p className="mt-0.5 text-xs text-ink-muted">צוות רואה ומטפל בבקשות. רק בעלים עורכים תהליכים, מיתוג וצוות.</p>
      {error && <ErrorState error={error} onRetry={load} />}
      {!team && !error && <Spinner />}
      {team && (
        <ul className="mt-3 space-y-2">
          {team.members.map((m) => (
            <li key={m.userId} className="flex items-center gap-2 rounded-xl bg-cloud px-3 py-2 text-sm">
              <span className="ltr min-w-0 flex-1 break-all leading-snug" title={m.email}>{m.email}{m.self ? ' (את/ה)' : ''}</span>
              <Badge tone={m.role === 'owner' ? 'dark' : 'neutral'}>{m.role === 'owner' ? 'בעלים' : 'צוות'}</Badge>
              {isOwner && m.role === 'staff' && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={KeyRound}
                  aria-label={`קישור לאיפוס סיסמה ל${m.email}`}
                  loading={busy === `r${m.userId}`}
                  onClick={() => run(`r${m.userId}`, async () => setLink(await issueStaffRecovery(orgId, m.userId)))}
                />
              )}
              {isOwner && !m.self && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon={UserMinus}
                  aria-label={`הסרת ${m.email}`}
                  loading={busy === m.userId}
                  onClick={async () => (await confirmAction({ title: 'להסיר מהצוות?', message: <><span className="ltr break-all font-medium">{m.email}</span> לא יוכל/תוכל להיכנס יותר. הגישה נחסמת מיד.</>, confirmLabel: 'הסרה', destructive: true })) && run(m.userId, () => removeMember(orgId, m.userId))}
                />
              )}
            </li>
          ))}
          {team.invitations.map((i) => (
            <li key={i.id} className="flex items-center gap-2 rounded-xl border border-dashed border-cloud-300 px-3 py-2 text-sm">
              <span className="ltr min-w-0 flex-1 break-all leading-snug">{i.email}</span>
              <span className="text-xs text-ink-muted">ממתין · עד {formatDateTime(i.expiresAt)}</span>
              {i.role === 'staff' && (
                <Button size="sm" variant="ghost" loading={busy === i.id} onClick={() => run(i.id, () => revokeInvitation(orgId, i.id))}>
                  ביטול
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isOwner && (
        <form className="mt-4 flex gap-2" onSubmit={invite}>
          <Input type="email" dir="ltr" required placeholder="email@business.co.il" aria-label="אימייל של איש/אשת צוות" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" icon={UserPlus} loading={busy === 'invite'} className="shrink-0">
            הזמנה
          </Button>
        </form>
      )}
      {link && (
        <div className="mt-3 rounded-xl bg-teal-50 p-3 text-sm text-teal-900">
          <p>{link.includes('/reset#') ? 'קישור לבחירת סיסמה חדשה. תקף לשעתיים, לשימוש אחד. אתם לא רואים את הסיסמה.' : 'שלחו את הקישור לאיש/אשת הצוות. תקף ל-7 ימים, לשימוש אחד.'}</p>
          <div className="mt-2 flex gap-2">
            <Input readOnly dir="ltr" value={link} aria-label="קישור ההזמנה" onFocus={(e) => e.currentTarget.select()} />
            <Button size="sm" icon={Copy} onClick={async () => toast((await copyText(link)) ? 'הקישור הועתק' : 'לא ניתן להעתיק', 'success')} aria-label="העתקת הקישור" />
          </div>
        </div>
      )}
    </Card>
  );
}
