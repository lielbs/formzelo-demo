import { LogOut, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from '../components/Brand';
import { Button, Card, ErrorState, Spinner } from '../components/ui';
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

/** Protects workforce routes while preserving the existing demo until its replacement is validated. */
export function ProductionRouteBoundary({ children }: { children: ReactNode }) {
  const { state, refresh, signOut } = useAuth();
  if (state.kind === 'demo') return children;
  if (state.kind === 'loading') return <Spinner label="מאמת הרשאה…" />;
  if (state.kind === 'error') return <div className="mx-auto max-w-xl p-6"><ErrorState error={state.message} onRetry={() => void refresh()} /></div>;

  if (state.kind === 'unauthenticated') {
    return (
      <AccessPage>
        <h1 className="mt-4 text-xl font-semibold text-ink">כניסה בהזמנה בלבד</h1>
        <p className="mt-2 text-sm leading-6 text-ink-muted">
          Formangle אינו מאפשר הרשמה עצמית. יש לפתוח את קישור ההזמנה שקיבלתם מ־RockStack.
        </p>
      </AccessPage>
    );
  }

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

  // The identity and membership boundary is live, but the production repository
  // is deliberately not wired to the demo UI. This prevents authenticated users
  // from seeing localStorage data under a production configuration.
  return (
    <AccessPage>
      <h1 className="mt-4 text-xl font-semibold text-ink">הגישה המאובטחת אומתה</h1>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        חיבור נתוני הייצור טרם הופעל. ממשק הדמו המקומי נשאר מבודד עד להשלמת ה־repository המאובטח.
      </p>
      <Button variant="secondary" className="mt-5" icon={LogOut} onClick={() => void signOut()}>התנתקות</Button>
    </AccessPage>
  );
}
