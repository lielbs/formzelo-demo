/**
 * RockStack operator console: onboard a business and hand its owner an invitation link.
 * Shows metadata only (names, counts, pending invitations) — never a business's requests.
 */
import { Building2, Copy, LogOut, MessageCircle, Plus, RefreshCw } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { Logo } from '../components/Brand';
import { copyText, useToast } from '../components/Toast';
import { Badge, Button, Card, EmptyState, ErrorState, FieldLabel, Input, Spinner } from '../components/ui';
import { formatDateTime } from '../lib/format';
import { isPlatformOperator, issueAccountRecovery, operatorOrganizations, operatorSetTablesEnabled, provisionBusiness, reinviteOwner, type OperatorOrganization } from '../production/admin';
import { runtimeConfiguration } from '../production/runtime';
import { confirmAction } from '../components/Confirm';

const slugFrom = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

function LinkResult({ title, link, onDone }: { title: string; link: string; onDone: () => void }) {
  const toast = useToast();
  return (
    <Card className="border-teal-200 bg-teal-50/60 p-5">
      <p className="font-semibold text-teal-900">{title}</p>
      <p className="mt-1 text-sm text-teal-900/80">
        {link.includes('/reset#') ? 'שלחו את הקישור לבעל/ת החשבון. הוא תקף לשעתיים ולשימוש אחד; הסיסמה נבחרת על ידם ואינה עוברת דרככם.' : 'שלחו את הקישור לבעלים. הוא תקף ל-48 שעות ולשימוש אחד, ונפתח רק לכתובת שהוזמנה.'}
      </p>
      <Input className="mt-3" readOnly dir="ltr" value={link} aria-label="קישור ההזמנה" onFocus={(e) => e.currentTarget.select()} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" icon={Copy} onClick={async () => toast((await copyText(link)) ? 'הקישור הועתק' : 'לא ניתן להעתיק', 'success')}>
          העתקה
        </Button>
        <a className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1f8f4d] px-3 text-sm font-medium text-white" target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`ההזמנה שלך ל-Formangle: ${link}`)}`}>
          <MessageCircle className="h-4 w-4" aria-hidden /> וואטסאפ
        </a>
        <Button size="sm" variant="ghost" onClick={onDone}>סגירה</Button>
      </div>
    </Card>
  );
}

function Console() {
  const toast = useToast();
  const [orgs, setOrgs] = useState<OperatorOrganization[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', ownerEmail: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ title: string; link: string } | null>(null);

  const load = async () => {
    setError(null);
    try {
      setOrgs(await operatorOrganizations());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'הטעינה נכשלה');
    }
  };
  useEffect(() => {
    void load();
  }, []);

  // Checked here so a taken address gets a clear answer; the server still enforces uniqueness.
  const slugTaken = Boolean(orgs?.some((o) => o.slug === form.slug.trim()));
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (slugTaken) return;
    setBusy('create');
    try {
      const { link } = await provisionBusiness({ name: form.name.trim(), slug: form.slug.trim(), ownerEmail: form.ownerEmail.trim() });
      setResult({ title: `${form.name.trim()} נוצר בהצלחה`, link });
      setForm({ name: '', slug: '', ownerEmail: '' });
      setSlugTouched(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'היצירה נכשלה', 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="space-y-4">
        <Card className="p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Plus className="h-4 w-4 text-orange-700" aria-hidden /> עסק חדש
          </h2>
          <form className="mt-4 space-y-3" onSubmit={create}>
            <div>
              <FieldLabel htmlFor="op-name" required>שם העסק</FieldLabel>
              <Input id="op-name" required maxLength={200} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugFrom(e.target.value) }))} placeholder="Bloom Studio" />
            </div>
            <div>
              <FieldLabel htmlFor="op-slug" required>כתובת באתר</FieldLabel>
              <Input id="op-slug" required dir="ltr" pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} invalid={slugTaken} aria-describedby="op-slug-hint" value={form.slug} onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() })); }} placeholder="bloom-studio" />
              <p id="op-slug-hint" role={slugTaken ? 'alert' : undefined} className={slugTaken ? 'mt-1 text-xs text-red-700' : 'mt-1 text-xs text-ink-muted'}>
                {slugTaken ? 'הכתובת הזו כבר שייכת לעסק אחר ברשימה. בחרו כתובת אחרת.' : 'אותיות לטיניות קטנות, ספרות ומקפים. מופיעה בכתובות הטפסים.'}
              </p>
            </div>
            <div>
              <FieldLabel htmlFor="op-email" required>אימייל של בעל/ת העסק</FieldLabel>
              <Input id="op-email" required type="email" dir="ltr" maxLength={320} value={form.ownerEmail} onChange={(e) => setForm((f) => ({ ...f, ownerEmail: e.target.value }))} placeholder="owner@business.co.il" />
            </div>
            <Button type="submit" loading={busy === 'create'} disabled={slugTaken} className="w-full">יצירת העסק והזמנת הבעלים</Button>
          </form>
        </Card>
        {result && <LinkResult {...result} onDone={() => setResult(null)} />}
      </div>
      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold">עסקים</h2>
          <Button size="sm" variant="ghost" icon={RefreshCw} onClick={load} aria-label="רענון" />
        </div>
        {error && <ErrorState error={error} onRetry={load} />}
        {!orgs && !error && <Spinner />}
        {orgs?.length === 0 && (
          <EmptyState icon={Building2} title="עוד אין עסקים">
            עסק שתיצרו כאן יופיע ברשימה, עם מצב ההזמנה של הבעלים.
          </EmptyState>
        )}
        <ul className="mt-3 divide-y divide-cloud-200">
          {orgs?.map((o) => (
            <li key={o.id} className="flex flex-wrap items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {o.name} <span className="ltr text-xs font-normal text-ink-muted">{o.slug}</span>
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  נוצר {formatDateTime(o.createdAt)} · {o.owners} בעלים · {o.staff} צוות · {o.workflows} תהליכים
                </p>
                {o.pendingOwnerInvitation && (
                  <p className="mt-1 text-xs text-amber-800">
                    הזמנה ממתינה ל-<span className="ltr">{o.pendingOwnerInvitation.email}</span> עד {formatDateTime(o.pendingOwnerInvitation.expiresAt)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {o.owners > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy === `r${o.id}`}
                    onClick={async () => {
                      const email = window.prompt('אימייל החשבון שצריך סיסמה חדשה');
                      if (!email) return;
                      setBusy(`r${o.id}`);
                      try {
                        setResult({ title: 'קישור לבחירת סיסמה חדשה', link: await issueAccountRecovery(email.trim().toLowerCase()) });
                      } catch (e) {
                        toast(e instanceof Error ? e.message : 'יצירת הקישור נכשלה', 'error');
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    איפוס סיסמה
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={o.tablesEnabled ? 'secondary' : 'ghost'}
                  aria-pressed={!!o.tablesEnabled}
                  loading={busy === `t${o.id}`}
                  onClick={async () => {
                    const enable = !o.tablesEnabled;
                    if (!(await confirmAction(enable ? { title: `להפעיל שולחנות עבור ${o.name}?`, confirmLabel: 'הפעלה' } : { title: `לכבות שולחנות עבור ${o.name}?`, message: 'דפי ההזמנה שלו ייסגרו מיד. ההזמנות עצמן נשמרות.', confirmLabel: 'כיבוי', destructive: true }))) return;
                    setBusy(`t${o.id}`);
                    try {
                      await operatorSetTablesEnabled(o.id, enable);
                      toast(enable ? 'מודול השולחנות הופעל' : 'מודול השולחנות כובה', 'success');
                      await load();
                    } catch (e) {
                      toast(e instanceof Error ? e.message : 'השינוי נכשל', 'error');
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {o.tablesEnabled ? 'שולחנות: פעיל' : 'הפעלת שולחנות'}
                </Button>
                <Badge tone={o.status === 'active' ? 'teal' : 'amber'}>{o.status === 'active' ? 'פעיל' : o.status === 'suspended' ? 'מושעה' : 'בהקמה'}</Badge>
                {o.owners === 0 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busy === o.id}
                    onClick={async () => {
                      const email = window.prompt('אימייל של בעל/ת העסק', o.pendingOwnerInvitation?.email ?? '');
                      if (!email) return;
                      setBusy(o.id);
                      try {
                        setResult({ title: `הזמנה חדשה ל${o.name}`, link: await reinviteOwner(o.id, email.trim().toLowerCase()) });
                        await load();
                      } catch (e) {
                        toast(e instanceof Error ? e.message : 'השליחה נכשלה', 'error');
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    הזמנה חדשה
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function Operator() {
  const auth = useAuth();
  const [operator, setOperator] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const signedIn = auth.state.kind === 'authenticated' || auth.state.kind === 'unauthorized';

  useEffect(() => {
    if (!signedIn) return setOperator(null);
    let active = true;
    isPlatformOperator().then((ok) => active && setOperator(ok));
    return () => {
      active = false;
    };
  }, [signedIn]);

  if (runtimeConfiguration.mode === 'demo') return <Navigate to="/demo" replace />;

  return (
    <main className="min-h-screen bg-cloud px-4 py-8" dir="rtl">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Logo endorsement={false} to="/" />
            <span className="rounded-full bg-midnight px-2.5 py-1 text-xs font-semibold text-white">מסוף מפעיל · RockStack</span>
          </div>
          {signedIn && (
            <Button size="sm" variant="ghost" icon={LogOut} onClick={() => auth.signOut()}>
              התנתקות
            </Button>
          )}
        </header>
        {auth.state.kind === 'loading' && <Spinner />}
        {auth.state.kind === 'error' && <ErrorState error={auth.state.message} onRetry={auth.refresh} />}
        {auth.state.kind === 'unauthenticated' && (
          <Card className="mx-auto max-w-md p-6">
            <h1 className="text-xl font-semibold">כניסת מפעילים</h1>
            <form
              className="mt-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(await auth.signIn(email, password));
              }}
            >
              <div>
                <FieldLabel htmlFor="op-login-email">אימייל</FieldLabel>
                <Input id="op-login-email" type="email" dir="ltr" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="op-login-password">סיסמה</FieldLabel>
                <Input id="op-login-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
              <Button type="submit" className="w-full">כניסה</Button>
            </form>
          </Card>
        )}
        {signedIn && operator === null && <Spinner label="בודק הרשאות…" />}
        {signedIn && operator === false && <ErrorState error="החשבון הזה אינו חשבון מפעיל של RockStack." />}
        {signedIn && operator && <Console />}
      </div>
    </main>
  );
}
