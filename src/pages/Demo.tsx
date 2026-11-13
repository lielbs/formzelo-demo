import { ArrowLeft, Car, ExternalLink, Flower2, RotateCcw, Trophy, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SiteFooter, SiteHeader } from '../components/SiteChrome';
import { useToast } from '../components/Toast';
import { Badge, Button, Card, DemoBadge, ErrorState, Modal, Spinner } from '../components/ui';
import { useRepo, useRepoQuery } from '../data/store';
import { DEMO_GARAGE_CASE_ID, DEMO_ORG_IDS, DEMO_SLUGS } from '../data/seed';
import { PENDING_STATUSES } from '../engine/transitions';
import { TablesShowcase } from './TablesShowcase';
import { formatNumber } from '../lib/format';

const META: Record<string, { icon: typeof Flower2; scenario: string; publicHref: string; publicLabel: string; secondHref?: string; secondLabel?: string }> = {
  [DEMO_ORG_IDS.bloom]: { icon: Flower2, scenario: 'הזמנות זרים עם תקציב, צבעוניות, ברכה ומשלוח.', publicHref: `/f/${DEMO_SLUGS.flowers}`, publicLabel: 'הזמנה כלקוח' },
  [DEMO_ORG_IDS.autocare]: { icon: Car, scenario: 'פתיחת תיק לרכב ואישור או דחייה של כל תיקון בנפרד.', publicHref: `/f/${DEMO_SLUGS.garage}?r=${DEMO_GARAGE_CASE_ID}`, publicLabel: 'תיק פתוח כלקוח' },
  [DEMO_ORG_IDS.urban]: {
    icon: UtensilsCrossed,
    scenario: 'אירועים פרטיים עם הערכת מחיר ומקדמה מדומה אחרי אישור, והזמנת שולחן — בקשה עד אישור המסעדה.',
    publicHref: `/f/${DEMO_SLUGS.events}`,
    publicLabel: 'בקשת אירוע',
    secondHref: `/f/${DEMO_SLUGS.booking}`,
    secondLabel: 'הזמנת שולחן',
  },
  [DEMO_ORG_IDS.valley]: { icon: Trophy, scenario: 'הרשמה למרוץ: מסלולים עם מכסת מקומות, אישור הורה לקטינים ותשלום מדומה אופציונלי.', publicHref: `/f/${DEMO_SLUGS.contest}`, publicLabel: 'הרשמה כמשתתף' },
};

export function Demo() {
  const { switchOrg, activeOrg, repo } = useRepo();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const q = useRepoQuery(async (r) => {
    await r.init();
    const orgs = await r.listOrganizations();
    return Promise.all(
      orgs.map(async (o) => {
        const [workflows, runs] = await Promise.all([r.listWorkflows(o.id), r.listRuns(o.id)]);
        return { o, workflows: workflows.filter((w) => w.status === 'published').length, runs: runs.length, pending: runs.filter((x) => PENDING_STATUSES.includes(x.status)).length };
      }),
    );
  }, []);

  return (
    <div className="min-h-screen bg-cloud">
      <SiteHeader />
      <main id="main" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <DemoBadge />
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-midnight">בחרו סביבת עבודה</h1>
        <p className="mt-2 max-w-xl text-ink-muted">
          ארבעה עסקים בדיוניים, כל אחד עם נתונים נפרדים לחלוטין — במסך ובאחסון. אפשר לעבור ביניהם בכל רגע מהתפריט באפליקציה.
        </p>

        {q.loading ? (
          <Spinner />
        ) : q.error || !q.data ? (
          <ErrorState error={q.error ?? 'לא נטען'} onRetry={q.reload} />
        ) : (
          <ul className="mt-8 grid gap-5 md:grid-cols-3">
            {q.data.map(({ o, workflows, runs, pending }) => {
              const m = META[o.id];
              const Icon = m?.icon ?? Flower2;
              return (
                <li key={o.id}>
                  <Card className="flex h-full flex-col p-6">
                    <div className="flex items-start justify-between">
                      <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ background: o.brand.primaryColor }}>
                        <Icon className="h-6 w-6" aria-hidden />
                      </span>
                      {activeOrg?.id === o.id && <Badge tone="teal">פעילה</Badge>}
                    </div>
                    <h2 className="mt-5 text-xl font-semibold">{o.name}</h2>
                    <p className="text-sm text-ink-soft">{o.industry}</p>
                    <p className="mt-3 flex-1 text-sm leading-relaxed text-ink-muted">{m?.scenario ?? o.tagline}</p>
                    <dl className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-cloud p-3 text-center">
                      <div>
                        <dt className="text-[11px] text-ink-muted">תהליכים</dt>
                        <dd className="font-semibold tabular-nums">{formatNumber(workflows)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-muted">בקשות</dt>
                        <dd className="font-semibold tabular-nums">{formatNumber(runs)}</dd>
                      </div>
                      <div>
                        <dt className="text-[11px] text-ink-muted">ממתינות</dt>
                        <dd className="font-semibold tabular-nums">{formatNumber(pending)}</dd>
                      </div>
                    </dl>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button
                        className="flex-1"
                        onClick={async () => {
                          await switchOrg(o.id);
                          navigate('/app');
                        }}
                      >
                        כניסה ללוח הבקרה <ArrowLeft className="h-4 w-4" aria-hidden />
                      </Button>
                      {m && (
                        <Link to={m.publicHref} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-cloud-300 bg-white px-3 text-sm font-medium hover:bg-cloud">
                          <ExternalLink className="h-4 w-4" aria-hidden /> {m.publicLabel}
                        </Link>
                      )}
                      {m?.secondHref && (
                        <Link to={m.secondHref} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-cloud-300 bg-white px-3 text-sm font-medium hover:bg-cloud">
                          <ExternalLink className="h-4 w-4" aria-hidden /> {m.secondLabel}
                        </Link>
                      )}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}

        <Card className="mt-10 flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="flex-1 text-sm text-ink-muted">
            <p className="font-medium text-ink">איך הדמו עובד</p>
            כל סביבה נשמרת תחת מפתח localStorage משלה. הנתונים בדיוניים, נשמרים בדפדפן הזה בלבד ולא מסתנכרנים למכשירים אחרים. אין תשלומים, הודעות או הזמנות אמיתיות.
          </div>
          <Button variant="secondary" icon={RotateCcw} onClick={() => setConfirm(true)}>
            איפוס נתוני הדמו
          </Button>
        </Card>
      </main>
      <TablesShowcase className="border-t border-cloud-200 bg-white py-16" />
      <SiteFooter />

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="איפוס נתוני הדמו?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              ביטול
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await repo.resetDemoData();
                setConfirm(false);
                toast('נתוני הדמו נטענו מחדש');
              }}
            >
              איפוס
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">כל השינויים שביצעתם בשלוש הסביבות יימחקו מהדפדפן ונתוני ההתחלה ייטענו מחדש.</p>
      </Modal>
    </div>
  );
}
