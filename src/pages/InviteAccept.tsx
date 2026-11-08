import { LogOut } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Brand';
import { Button, Card, ErrorState, Spinner } from '../components/ui';
import { useAuth } from '../auth/AuthProvider';
import { getProductionSupabaseClient } from '../production/supabaseClient';
import { runtimeConfiguration } from '../production/runtime';
import { PRIVACY_VERSION } from './Privacy';
import { appHref } from '../lib/links';

type InviteState = { token: string; organizationId: string };

export function parseInviteFragment(hash: string): InviteState | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('invitation_token');
  const organizationId = params.get('organization_id');
  return token && organizationId ? { token, organizationId } : null;
}

export function InviteAccept() {
  const auth = useAuth();
  const { refresh } = auth;
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InviteState | null>(() => parseInviteFragment(window.location.hash));
  const attempted = useRef(false);
  // Someone who arrives already signed in confirms the account first; signing in here is consent enough.
  const signedInHere = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  // New people create their password here; people who already have an account sign in.
  const [mode, setMode] = useState<'create' | 'login'>('create');
  const [confirm, setConfirm] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.location.hash) history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }, []);

  useEffect(() => {
    if (!['authenticated', 'unauthorized'].includes(auth.state.kind) || !invite || accepted || attempted.current) return;
    if (!signedInHere.current && !confirmed) return;
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
        return refresh();
      })
      .catch(() => active && setError('לא ניתן לקבל את ההזמנה. ייתכן שפג תוקפה, בוטלה או שאינה שייכת לזהות זו.'))
      .finally(() => active && setAccepting(false));
    return () => { active = false; };
  }, [auth.state.kind, refresh, invite, accepted, confirmed]);

  if (runtimeConfiguration.mode === 'demo') return <Navigate to="/demo" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    signedInHere.current = true;
    setError(await auth.signIn(email, password));
    setBusy(false);
  };
  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    if (!invite) return;
    if (password.length < 10) return setError('הסיסמה צריכה לכלול לפחות 10 תווים.');
    if (password !== confirm) return setError('שתי הסיסמאות אינן זהות.');
    if (!agreed) return setError('כדי להמשיך יש לאשר את תנאי השימוש ומדיניות הפרטיות.');
    setBusy(true);
    setError(null);
    try {
      const client = await getProductionSupabaseClient();
      const { data, error: fnError } = await client.functions.invoke<{ email?: string; error?: string }>('account-onboarding', {
        body: { invitationToken: invite.token, organizationId: invite.organizationId, password, acceptedPrivacyVersion: PRIVACY_VERSION },
      });
      const status = (fnError as { context?: Response } | null)?.context?.status;
      if (status === 409) {
        const body = await (fnError as { context: Response }).context.json().catch(() => ({}));
        setEmail(typeof body.email === 'string' ? body.email : '');
        setPassword('');
        setMode('login');
        setError('כבר יש חשבון לכתובת הזו. התחברו עם הסיסמה הקיימת כדי לקבל את ההזמנה.');
        return;
      }
      if (fnError || !data?.email) {
        setError(status === 404 ? 'ההזמנה אינה זמינה יותר. בקשו קישור חדש.' : status === 400 ? 'בדקו את הסיסמה (10 עד 72 תווים, בלי רווח בהתחלה או בסוף).' : 'יצירת החשבון נכשלה. נסו שוב.');
        return;
      }
      signedInHere.current = true;
      setError(await auth.signIn(data.email, password));
    } finally {
      setBusy(false);
    }
  };
  const signedInEmail = auth.state.kind === 'authenticated' || auth.state.kind === 'unauthorized' ? auth.state.email : null;
  const switchAccount = async () => {
    attempted.current = false;
    signedInHere.current = false;
    setConfirmed(false);
    setError(null);
    setMode('login');
    await auth.signOut();
  };
  const field = 'mt-1 w-full rounded-xl border border-cloud-300 px-3 py-2.5 text-base focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-200';

  return (
    <main className="flex min-h-screen items-center justify-center bg-cloud px-4 py-12" dir="rtl">
      <Card className="w-full max-w-lg p-7">
        <Logo endorsement={false} to="/" />
        <h1 className="mt-7 text-2xl font-semibold text-ink">ברוכים הבאים ל־Formangle</h1>
        {!invite && !accepted && <ErrorState error="קישור ההזמנה חסר או אינו תקין." />}
        {error && <div className="mt-4"><ErrorState error={error} onRetry={() => { attempted.current = false; setError(null); }} /></div>}
        {error && invite && signedInEmail !== null && (
          <Button variant="secondary" className="mt-3" icon={LogOut} onClick={switchAccount}>התנתקות והתחברות עם החשבון שהוזמן</Button>
        )}
        {invite && signedInEmail !== null && !signedInHere.current && !confirmed && !accepted && (
          <div className="mt-5">
            <p className="text-sm leading-6 text-ink-muted">
              אתם כבר מחוברים{signedInEmail ? <> כ־<span className="ltr font-medium text-ink">{signedInEmail}</span></> : ''}. ההזמנה תתקבל לחשבון הזה, ורק אם היא נשלחה לכתובת שלו.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => setConfirmed(true)}>קבלת ההזמנה בחשבון הזה</Button>
              <Button variant="secondary" icon={LogOut} onClick={switchAccount}>התנתקות והמשך עם חשבון אחר</Button>
            </div>
          </div>
        )}
        {accepting && !accepted && <Spinner label="מאמת ומקבל את ההזמנה…" />}
        {accepted && (
          <div className="mt-5">
            <p className="text-sm text-ink-muted">ההזמנה התקבלה בהצלחה והחברות בארגון פעילה.</p>
            <Button className="mt-5" onClick={() => navigate('/app', { replace: true })}>כניסה ללוח הבקרה</Button>
          </div>
        )}
        {invite && auth.state.kind === 'unauthenticated' && mode === 'create' && (
          <form className="mt-5 space-y-4" onSubmit={createAccount}>
            <p className="text-sm leading-6 text-ink-muted">בחרו סיסמה לחשבון שלכם. הכתובת שלכם היא זו שאליה נשלחה ההזמנה.</p>
            <label className="block text-sm font-medium">סיסמה חדשה<input className={field} type="password" autoComplete="new-password" minLength={10} maxLength={72} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <label className="block text-sm font-medium">הסיסמה שוב<input className={field} type="password" autoComplete="new-password" minLength={10} maxLength={72} required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
            <p className="text-xs text-ink-muted">לפחות 10 תווים. מומלץ משפט קצר שקל לזכור.</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-orange-600" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              <span>
                קראתי ואני מסכים/ה ל<a href={appHref('/privacy')} target="_blank" rel="noreferrer" className="font-medium text-orange-700 underline">תנאי השימוש ומדיניות הפרטיות</a>
              </span>
            </label>
            <Button type="submit" loading={busy} className="w-full">יצירת חשבון וכניסה</Button>
            <button type="button" className="block w-full text-center text-sm font-medium text-orange-700 underline-offset-2 hover:underline" onClick={() => { setMode('login'); setError(null); }}>
              כבר יש לי חשבון ב־Formangle
            </button>
          </form>
        )}
        {invite && auth.state.kind === 'unauthenticated' && mode === 'login' && (
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <p className="text-sm leading-6 text-ink-muted">יש להתחבר עם כתובת האימייל שאליה נשלחה ההזמנה.</p>
            <label className="block text-sm font-medium">אימייל<input className={field} type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            <label className="block text-sm font-medium">סיסמה<input className={field} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            <Button type="submit" loading={busy} className="w-full">התחברות וקבלת ההזמנה</Button>
            <button type="button" className="block w-full text-center text-sm font-medium text-orange-700 underline-offset-2 hover:underline" onClick={() => { setMode('create'); setError(null); }}>
              אין לי חשבון — יצירת סיסמה
            </button>
          </form>
        )}
        {invite && auth.state.kind === 'loading' && <Spinner label="בודק את מצב ההזדהות…" />}
      </Card>
    </main>
  );
}
