import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Brand';
import { Button, Card, ErrorState, Spinner } from '../components/ui';
import { useAuth } from '../auth/AuthProvider';
import { getProductionSupabaseClient } from '../production/supabaseClient';
import { runtimeConfiguration } from '../production/runtime';

type InviteState = { token: string; organizationId: string };

export function parseInviteFragment(hash: string): InviteState | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('invitation_token');
  const organizationId = params.get('organization_id');
  return token && organizationId ? { token, organizationId } : null;
}

export function InviteAccept() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteState | null>(() => parseInviteFragment(window.location.hash));
  const attempted = useRef(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (window.location.hash) history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    if (!['authenticated', 'unauthorized'].includes(auth.state.kind) || !invite || accepted || attempted.current) return;
    let active = true;
    attempted.current = true;
    setAccepting(true);
    getProductionSupabaseClient()
      .then((client) => client.rpc('accept_owner_invitation', {
        invitation_token: invite.token,
        expected_organization_id: invite.organizationId,
      }))
      .then(({ error: rpcError }) => {
        if (!active) return;
        if (rpcError) throw rpcError;
        setInvite(null);
        setAccepted(true);
        return auth.refresh();
      })
      .catch(() => active && setError('לא ניתן לקבל את ההזמנה. ייתכן שפג תוקפה, בוטלה או שאינה שייכת לזהות זו.'))
      .finally(() => active && setAccepting(false));
    return () => { active = false; };
  }, [auth.state.kind, auth.refresh, invite, accepted]);

  if (runtimeConfiguration.mode === 'demo') return <Navigate to="/demo" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(await auth.signIn(email, password));
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-cloud px-4 py-12" dir="rtl">
      <Card className="w-full max-w-lg p-7">
        <Logo endorsement={false} to="/" />
        <h1 className="mt-7 text-2xl font-semibold text-ink">קבלת הזמנה ל־Formangle</h1>
        {!invite && !accepted && <ErrorState error="קישור ההזמנה חסר או אינו תקין." />}
        {error && <div className="mt-4"><ErrorState error={error} onRetry={() => { attempted.current = false; setError(null); }} /></div>}
        {accepting && <Spinner label="מאמת ומקבל את ההזמנה…" />}
        {accepted && (
          <div className="mt-5">
            <p className="text-sm text-ink-muted">ההזמנה התקבלה בהצלחה והחברות בארגון פעילה.</p>
            <Button className="mt-5" onClick={() => navigate('/app', { replace: true })}>כניסה ללוח הבקרה</Button>
          </div>
        )}
        {invite && auth.state.kind === 'unauthenticated' && (
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <p className="text-sm leading-6 text-ink-muted">יש להתחבר עם כתובת האימייל שאליה נשלחה ההזמנה.</p>
            <label className="block text-sm font-medium">אימייל<input className="mt-1 w-full rounded-xl border border-cloud-300 px-3 py-2" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="block text-sm font-medium">סיסמה<input className="mt-1 w-full rounded-xl border border-cloud-300 px-3 py-2" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <Button type="submit">התחברות וקבלת ההזמנה</Button>
          </form>
        )}
        {invite && auth.state.kind === 'loading' && <Spinner label="בודק את מצב ההזדהות…" />}
      </Card>
    </main>
  );
}
