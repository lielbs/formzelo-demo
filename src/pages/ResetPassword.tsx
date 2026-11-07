/**
 * Choose a new password from a single-use recovery link (issued by RockStack or by the
 * workspace owner). The secret stays in the URL fragment and is removed from the address bar.
 */
import { KeyRound } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Brand';
import { Button, Card, FieldLabel, Input } from '../components/ui';
import { runtimeConfiguration } from '../production/runtime';
import { getProductionSupabaseClient } from '../production/supabaseClient';

export const parseRecoveryFragment = (hash: string) => {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('recovery_token');
  return token && /^[0-9a-f]{64}$/.test(token) ? token : null;
};

export function ResetPassword() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [token] = useState(() => parseRecoveryFragment(window.location.hash));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  }, []);

  if (runtimeConfiguration.mode === 'demo') return <Navigate to="/demo" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token) return;
    if (password.length < 10) return setError('הסיסמה צריכה לכלול לפחות 10 תווים.');
    if (password !== confirm) return setError('שתי הסיסמאות אינן זהות.');
    setBusy(true);
    setError(null);
    try {
      const client = await getProductionSupabaseClient();
      await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
      const { data, error: fnError } = await client.functions.invoke<{ email?: string }>('account-onboarding', { body: { action: 'recover', recoveryToken: token, password } });
      const status = (fnError as { context?: Response } | null)?.context?.status;
      if (fnError || !data?.email) {
        setError(status === 404 ? 'הקישור כבר נוצל, הוחלף בקישור חדש או שפג תוקפו. בקשו קישור חדש.' : status === 400 ? 'בדקו את הסיסמה (10 עד 72 תווים, בלי רווח בהתחלה או בסוף).' : 'שינוי הסיסמה נכשל. נסו שוב.');
        return;
      }
      const signInError = await auth.signIn(data.email, password);
      if (signInError) return setError(signInError);
      navigate('/app', { replace: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-cloud px-4 py-12" dir="rtl">
      <Card className="w-full max-w-md p-7">
        <Logo endorsement={false} to="/" />
        <div className="mt-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">
          <KeyRound className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-semibold text-ink">בחירת סיסמה חדשה</h1>
        {!token ? (
          <p className="mt-3 text-sm leading-6 text-ink-muted">הקישור חסר או אינו תקין. בקשו קישור חדש מ־RockStack או מבעל/ת העסק.</p>
        ) : (
          <form className="mt-5 space-y-3" onSubmit={submit}>
            <div>
              <FieldLabel htmlFor="reset-password">סיסמה חדשה</FieldLabel>
              <Input id="reset-password" type="password" autoComplete="new-password" minLength={10} maxLength={72} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="reset-confirm">הסיסמה שוב</FieldLabel>
              <Input id="reset-confirm" type="password" autoComplete="new-password" minLength={10} maxLength={72} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <p className="text-xs text-ink-muted">לפחות 10 תווים. הקישור תקף לשעתיים ולשימוש אחד.</p>
            {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <Button type="submit" loading={busy} className="w-full">שמירה וכניסה</Button>
          </form>
        )}
      </Card>
    </main>
  );
}
