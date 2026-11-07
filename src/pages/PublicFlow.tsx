import { ArrowRight, CalendarX2, Eye, Link2Off, Lock } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Logo } from '../components/Brand';
import { ButtonLink, Spinner } from '../components/ui';
import type { WorkflowRun, WorkflowVersion } from '../domain/schema';
import type { WorkflowTheme } from '../domain/theme';
import { useRepo, useRepoQuery } from '../data/store';
import { hasOptionCapacity } from '../engine/capacity';
import { answersToValues } from '../engine/validation';
import { workflowTitle } from '../lib/meta';
import { RequestActions } from '../renderer/actions';
import { Confirmation } from '../renderer/Confirmation';
import { referencedAssets } from '../renderer/media';
import { DigitalPresence } from '../renderer/presence';
import { WorkflowRenderer } from '../renderer/WorkflowRenderer';
import { buildTheme } from '../theme/presets';
import { ThemeScope } from '../theme/ThemeScope';
import { runtimeConfiguration } from '../production/runtime';
import { trackPath } from '../data/track';

const EDITABLE: WorkflowRun['status'][] = ['awaiting_customer', 'changes_requested'];
const NEUTRAL = buildTheme('modern_minimal');

/** Page frame: the customer's business identity first, a quiet Formangle credit last. */
export function Shell({ children, theme = NEUTRAL, orgName }: { children: ReactNode; theme?: WorkflowTheme; orgName?: string }) {
  return (
    <ThemeScope theme={theme} className="fz-page flex flex-col">
      <main id="main" className="flex-1">
        {children}
      </main>
      <footer className="fz-footer">
        <p>
          {orgName ? `${orgName} · ` : ''}{runtimeConfiguration.mode === 'demo' ? 'דמו מקומי: הנתונים נשמרים בדפדפן זה בלבד, ללא תשלומים וללא שליחת הודעות אמיתיות.' : 'הטופס מאובטח ומופעל על ידי Formangle. לא מתבצע תשלום דרך טופס זה.'}
        </p>
        <span className="fz-powered">
          <span>מופעל על ידי</span> <Logo endorsement={false} className="scale-[0.7] !no-underline" />
        </span>
      </footer>
    </ThemeScope>
  );
}

export function Notice({ icon: Icon, title, children }: { icon: typeof Lock; title: string; children: ReactNode }) {
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
  // Owner switched perspective from the inbox ("צפייה כלקוח"); a link back, nothing more.
  const fromInbox = params.get('from') === 'inbox';
  const navigate = useNavigate();
  const { repo } = useRepo();
  const [submitted, setSubmitted] = useState<{ run: WorkflowRun; version: WorkflowVersion } | null>(null);

  const pub = useRepoQuery((r) => r.resolvePublic(slug), [slug]);
  const runQ = useRepoQuery((r) => (runId ? r.getPublicRun(slug, runId) : Promise.resolve(null)), [slug, runId]);
  // New requests only: a personal link (?r=) always opens, whatever the intake rules say.
  const intakeQ = useRepoQuery((r) => (runId ? Promise.resolve(null) : r.getIntakeState(slug)), [slug, runId]);
  const actionsQ = useRepoQuery((r) => (runId ? r.getPublicActions(slug, runId) : Promise.resolve([])), [slug, runId]);
  // A run is rendered with the exact version (config + design) it is bound to.
  const version = runQ.data?.version ?? pub.data?.version;
  const assetsQ = useRepoQuery(
    (r) => (pub.data && version ? r.getAssetUrls(pub.data.organization.id, referencedAssets(version.design, version.config)) : Promise.resolve({} as Record<string, string>)),
    [pub.data?.organization.id, version?.id],
  );

  // Customers see the business's name in the tab, not the platform's.
  const tabTitle = pub.data && version ? workflowTitle(version.config.title, pub.data.organization.name) : null;
  useEffect(() => {
    if (tabTitle) document.title = tabTitle;
  }, [tabTitle]);

  if (pub.loading || runQ.loading || intakeQ.loading)
    return (
      <Shell>
        <Spinner />
      </Shell>
    );

  if (!pub.data || !version) {
    return (
      <Shell>
        <Notice icon={Link2Off} title="הקישור אינו זמין">
          <p>{runtimeConfiguration.mode === 'demo' ? 'ייתכן שהתהליך עדיין לא פורסם, הועבר לארכיון, או שהקישור נפתח בדפדפן אחר — בדמו הנתונים נשמרים רק בדפדפן שבו נוצרו.' : 'ייתכן שהתהליך עדיין לא פורסם, הועבר לארכיון או שהקישור אינו תקין.'}</p>
          <div className="mt-6 flex justify-center gap-2">
            {runtimeConfiguration.mode === 'demo' && <ButtonLink to="/demo" variant="secondary">לסביבות הדמו</ButtonLink>}
            <ButtonLink to="/">לדף הבית</ButtonLink>
          </div>
        </Notice>
      </Shell>
    );
  }

  const { organization } = pub.data;
  const found = submitted ?? runQ.data;
  const { config, design } = version;
  const assets = assetsQ.data ?? {};
  const ownerStrip = fromInbox && found && (
    <div className="fz-owner-strip" role="note">
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">תצוגת לקוח: כך {found.run.customerName || 'הלקוח/ה'} רואה את הבקשה (בדמו, בדפדפן הזה).</span>
      <Link to={`/app/requests/${found.run.id}`} className="inline-flex shrink-0 items-center gap-1 font-semibold underline">
        <ArrowRight className="h-3.5 w-3.5" aria-hidden /> חזרה לבקשה
      </Link>
    </div>
  );
  const requestActions = found && (
    <RequestActions
      actions={actionsQ.data ?? []}
      business={organization.name}
      reference={found.run.reference}
      onRespond={async (actionId, optionId) => {
        await repo.respondToAction(slug, found.run.id, actionId, optionId);
      }}
    />
  );

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
        {ownerStrip}
        <Confirmation
          actions={requestActions}
          run={found.run}
          config={config}
          theme={design}
          logoUrl={design.logo.assetId ? assets[design.logo.assetId] : undefined}
          assets={assets}
          justSubmitted={justSubmitted}
          onCancelBooking={
            config.booking?.enabled
              ? async () => {
                  await repo.cancelRunByCustomer(slug, found.run.id);
                  navigate(`/f/${slug}?r=${found.run.id}`, { replace: true });
                }
              : undefined
          }
        />
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

  const intake = intakeQ.data;
  if (!found && intake && !intake.open) {
    return (
      <Shell theme={design} orgName={organization.name}>
        <Notice icon={CalendarX2} title={`${config.title} · ${organization.name}`}>
          <p className="text-base">{pub.data.workflow.intake?.closedMessage || intake.message}</p>
        </Notice>
        <div className="mx-auto max-w-lg px-3 pb-10">
          <DigitalPresence theme={design} slot="completion" title="אפשר ליצור איתנו קשר" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell theme={design} orgName={organization.name}>
      {ownerStrip}
      {found && (actionsQ.data ?? []).length > 0 && <div className="mx-3 mt-4 sm:mx-auto sm:max-w-2xl">{requestActions}</div>}
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
        getAvailability={config.booking?.enabled ? (date) => repo.getBookingAvailability(slug, date) : undefined}
        getOptionUsage={hasOptionCapacity(config) ? () => repo.getOptionUsage(slug) : undefined}
        onSubmit={async (values, consent, { payNow }) => {
          const run = await repo.submitRun(slug, { values, consent, runId: found?.run.id, payNow });
          if (runtimeConfiguration.mode === 'production') {
            // The customer's private request page; without it, the confirmation still shows here.
            const access = await repo.customerAccess(slug, run.id).catch(() => null);
            if (access) return navigate(trackPath(access, true), { replace: true });
            setSubmitted({ run, version });
          }
          navigate(`/f/${slug}?r=${run.id}&sent=1`, { replace: true });
        }}
      />
    </Shell>
  );
}
