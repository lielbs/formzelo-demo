import { Link2Off, Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Brand';
import { ButtonLink, Spinner } from '../components/ui';
import type { WorkflowRun } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { useRepo, useRepoQuery } from '../data/store';
import { answersToValues } from '../engine/validation';
import { Confirmation } from '../renderer/Confirmation';
import { WorkflowRenderer } from '../renderer/WorkflowRenderer';
import { buildTheme } from '../theme/presets';
import { ThemeScope } from '../theme/ThemeScope';

const EDITABLE: WorkflowRun['status'][] = ['awaiting_customer', 'changes_requested'];
const NEUTRAL = buildTheme('modern_minimal');

/** Page frame: the customer's business identity first, a quiet Formzelo credit last. */
function Shell({ children, theme = NEUTRAL, orgName }: { children: ReactNode; theme?: WorkflowTheme; orgName?: string }) {
  return (
    <ThemeScope theme={theme} className="fz-page flex flex-col">
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="fz-footer">
        <p>
          {orgName ? `${orgName} · ` : ''}דמו מקומי: הנתונים נשמרים בדפדפן זה בלבד, ללא תשלומים וללא שליחת הודעות אמיתיות.
        </p>
        <span className="fz-powered">
          <span>מופעל על ידי</span> <Logo endorsement={false} className="scale-[0.7] !no-underline" />
        </span>
      </footer>
    </ThemeScope>
  );
}

function Notice({ icon: Icon, title, children }: { icon: typeof Lock; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-lg px-3 py-10 sm:py-16">
      <div className="fz-card fz-pad text-center">
        <span className="fz-confirm-icon" aria-hidden>
          <Icon className="h-7 w-7" />
        </span>
        <h1 className="fz-display mt-4 text-xl">{title}</h1>
        <div className="fz-muted mt-2 text-sm leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

export function PublicFlow() {
  const { slug = '' } = useParams();
  const [params] = useSearchParams();
  const runId = params.get('r');
  const justSubmitted = params.get('sent') === '1';
  const navigate = useNavigate();
  const { repo } = useRepo();

  const pub = useRepoQuery((r) => r.resolvePublic(slug), [slug]);
  const runQ = useRepoQuery((r) => (runId ? r.getPublicRun(slug, runId) : Promise.resolve(null)), [slug, runId]);
  // A run is rendered with the exact version (config + design) it is bound to.
  const version = runQ.data?.version ?? pub.data?.version;
  const assetsQ = useRepoQuery(
    (r) => (pub.data && version ? r.getAssetUrls(pub.data.organization.id, [version.design.logo.assetId, version.design.hero.coverAssetId]) : Promise.resolve({} as Record<string, string>)),
    [pub.data?.organization.id, version?.id],
  );

  if (pub.loading || runQ.loading)
    return (
      <Shell>
        <Spinner />
      </Shell>
    );

  if (!pub.data || !version) {
    return (
      <Shell>
        <Notice icon={Link2Off} title="הקישור אינו זמין">
          <p>ייתכן שהתהליך עדיין לא פורסם, הועבר לארכיון, או שהקישור נפתח בדפדפן אחר — בדמו הנתונים נשמרים רק בדפדפן שבו נוצרו.</p>
          <div className="mt-6 flex justify-center gap-2">
            <ButtonLink to="/demo" variant="secondary">
              לסביבות הדמו
            </ButtonLink>
            <ButtonLink to="/">לדף הבית</ButtonLink>
          </div>
        </Notice>
      </Shell>
    );
  }

  const { organization } = pub.data;
  const found = runQ.data;
  const { config, design } = version;
  const assets = assetsQ.data ?? {};

  if (runId && !found) {
    return (
      <Shell theme={design} orgName={organization.name}>
        <Notice icon={Link2Off} title="הבקשה לא נמצאה">
          הקישור האישי אינו תקין בדפדפן זה. פנו לעסק לקבלת קישור חדש.
        </Notice>
      </Shell>
    );
  }

  if (found && !EDITABLE.includes(found.run.status)) {
    return (
      <Shell theme={design} orgName={organization.name}>
        <Confirmation run={found.run} config={config} theme={design} logoUrl={design.logo.assetId ? assets[design.logo.assetId] : undefined} justSubmitted={justSubmitted} />
      </Shell>
    );
  }

  if (!found && config.mode === 'case') {
    return (
      <Shell theme={design} orgName={organization.name}>
        <Notice icon={Lock} title="נדרש קישור אישי">
          <p>{organization.name} שולחים לכל לקוח קישור אישי עם פרטי התיק שלו.</p>
          <p className="mt-2">
            בדמו: פתחו תיק חדש מתוך{' '}
            <Link className="fz-ink font-semibold underline" to="/app/requests">
              תיבת הבקשות
            </Link>{' '}
            בסביבת {organization.name}.
          </p>
        </Notice>
      </Shell>
    );
  }

  return (
    <Shell theme={design} orgName={organization.name}>
      {found?.run.status === 'changes_requested' && (
        <p role="status" className="fz-warn mx-3 mt-4 sm:mx-auto sm:max-w-2xl">
          העסק ביקש שינויים בבקשה {found.run.reference}. עדכנו את הפרטים ושלחו שוב.
        </p>
      )}
      <WorkflowRenderer
        key={found?.run.id ?? 'new'}
        config={config}
        theme={design}
        assets={assets}
        mode="live"
        initialValues={found ? answersToValues(found.run.answers) : undefined}
        caseAnswers={found?.run.caseAnswers}
        onSubmit={async (values, consent) => {
          const run = await repo.submitRun(slug, { values, consent, runId: found?.run.id });
          navigate(`/f/${slug}?r=${run.id}&sent=1`, { replace: true });
        }}
      />
    </Shell>
  );
}
