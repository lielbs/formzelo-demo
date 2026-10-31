import { Compass } from 'lucide-react';
import { Logo } from '../components/Brand';
import { ButtonLink } from '../components/ui';

export function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-cloud px-4 text-center">
      <Logo />
      <Compass className="mt-10 h-10 w-10 text-ink-soft" aria-hidden />
      <h1 className="mt-4 text-2xl font-semibold">העמוד לא נמצא</h1>
      <p className="mt-2 text-sm text-ink-muted">ייתכן שהקישור שגוי או שהעמוד הועבר.</p>
      <div className="mt-6 flex gap-2">
        <ButtonLink to="/" variant="secondary">
          דף הבית
        </ButtonLink>
        <ButtonLink to="/app">ללוח הבקרה</ButtonLink>
      </div>
    </main>
  );
}
