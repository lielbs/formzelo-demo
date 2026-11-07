import { LogOut, ShieldCheck } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Logo } from '../components/Brand';
import { Button, Card, ErrorState, FieldLabel, Input, Spinner } from '../components/ui';
import { useAuth } from './AuthProvider';

function AccessPage({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cloud px-4 py-12">
      <Card className="w-full max-w-lg p-7 text-center">
        <Logo endorsement={false} to="/" />
        <div className="mx-auto mt-7 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700">
          <ShieldCheck className="h-6 w-6" aria-hidden />
        </div>
        {children}
      </Card>
    </main>
  );
}

/** Returning owners and staff sign in here. Accounts are created only from an invitation. */
function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(await signIn(email, password));
    setBusy(false);
  };
  return (
    <AccessPage>
      <h1 className="mt-4 text-xl font-semibold text-ink">כניסה לסביבת העבודה</h1>
      <form className="mt-5 space-y-3 text-start" onSubmit={submit}>
        <div>
          <FieldLabel htmlFor="signin-email">אימייל</FieldLabel>
          <Input id="signin-email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="signin-password">סיסמה</FieldLabel>
          <Input id="signin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button type="submit" loading={busy} className="w-full">כניסה</Button>
      </form>
      <p className="mt-5 text-xs leading-5 text-ink-muted">
        אין עדיין חשבון? הכניסה הראשונה היא מקישור ההזמנה שקיבלתם. שכחתם סיסמה? בקשו מבעל/ת העסק או מ־RockStack קישור לבחירת סיסמה חדשה.
      </p>
    </AccessPage>
  );
}

/** Protects workforce routes while preserving the existing demo until its replacement is validated. */
export function ProductionRouteBoundary({ children }: { children: ReactNode }) {
  const { state, refresh, signOut } = useAuth();
  if (state.kind === 'demo') return children;
  if (state.kind === 'loading') return <Spinner label="מאמת הרשאה…" />;
  if (state.kind === 'error') return <div className="mx-auto max-w-xl p-6"><ErrorState error={state.message} onRetry={() => void refresh()} /></div>;

  if (state.kind === 'unauthenticated') return <SignIn />;

  if (state.kind === 'unauthorized') {
    return (
      <AccessPage>
        <h1 className="mt-4 text-xl font-semibold text-ink">אין חברות פעילה בארגון</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          הזהות אומתה, אך לא נמצאה חברות פעילה. פנו ל־RockStack או למנהל הארגון.
        </p>
        <Button variant="secondary" className="mt-5" icon={LogOut} onClick={() => void signOut()}>התנתקות</Button>
      </AccessPage>
    );
  }

  return children;
}
