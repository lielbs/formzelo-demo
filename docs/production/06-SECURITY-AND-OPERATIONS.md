# Security and Operations

## Threat summary

Primary protected assets are tenant data, customer PII and files, workflow/version integrity, pricing and payment state, customer decisions, provider credentials, support authority, and audit history.

Primary threats:

- cross-tenant BOLA/IDOR through guessed identifiers or incorrect RLS;
- leaked personal-link capability allowing unauthorized customer actions;
- client-tampered validation, price, status, or capacity;
- provider credential disclosure or forged/replayed webhook;
- malicious/oversized upload;
- automation amplification, retry storms, SSRF, and cost abuse;
- privileged RockStack support misuse;
- data loss or irrecoverable migration;
- PII leakage through logs, analytics, exports, URLs, or provider payloads.

The current formal repository scan found no embedded live credential and no validated product-source injection vulnerability. Its important outcomes are production design requirements, because the current application is intentionally a local static demo.

## Security baseline

### Application and API

- Deny by default; explicit endpoint schemas, body limits, timeouts, and response projections.
- Authorize every object at the server and RLS layers.
- Strict CORS allowlist for authenticated APIs; public endpoints do not need credentialed cross-origin access.
- CSRF protection where cookie-authenticated mutations are used; current Supabase browser token pattern must follow current official guidance.
- Rate limit by IP/network signal, organization, account, slug, customer token, and endpoint sensitivity. Add CAPTCHA only where abuse evidence justifies it.
- Idempotency keys on public submissions, publication, payment creation, action response, webhook intake, and manual replay.
- Output encoding through React text nodes; do not introduce arbitrary HTML workflow blocks.
- CSP and security headers at the CDN/hosting response layer: HSTS, CSP including `frame-ancestors`, `X-Content-Type-Options`, Referrer-Policy, Permissions-Policy. Decide whether public workflow embedding remains supported and constrain ancestors accordingly.

### Database

- RLS on all exposed tables, minimal grants, private schemas for secrets/helpers/admin data.
- Composite tenant foreign keys, constraints, and transaction functions for invariants.
- No public `security definer` functions; revoke `PUBLIC` execute and set safe `search_path`.
- Security-invoker views or unexposed views.
- Database advisor results reviewed on every migration release.
- Connection strings, service/secret keys, and direct database credentials restricted to CI/server operators; use scoped credentials and rotate.

### Customer tokens

- High entropy, hashed at rest, short/use-appropriate expiry, scoped capabilities, revocation, optional contact OTP.
- Token redaction in reverse-proxy, application, error, and analytics logs.
- Constant-time comparison and rate-limited lookup.
- Rotate on owner request or suspected disclosure; historical decisions remain linked to token record, not raw token.

### Files

- Private buckets and generated object paths.
- Allowlisted type/size/purpose; inspect magic bytes after upload.
- Image re-encoding for brand assets; malware/quarantine workflow for arbitrary customer documents.
- Content-Disposition attachment for risky document types; no inline active SVG/HTML without sanitization/isolation.
- Signed URLs, short expiry, download authorization, checksum, lifecycle deletion.

### Secrets

- No secrets in Git, frontend `VITE_*`, workflow JSON, logs, support exports, or browser storage.
- Separate per-environment and per-provider credentials.
- Envelope encryption/key versioning for per-organization secrets; platform master key in an approved secret facility.
- Rotation inventory, owners, expiry where supported, access audit, and emergency revocation runbook.

## Privacy and compliance readiness

Before accepting real data, RockStack must obtain legal review for applicable Israeli privacy, consumer, accessibility, communications, and payment obligations. Engineering must provide facts and controls, not invent legal conclusions.

Required product capabilities:

- data inventory and processor/subprocessor register;
- documented purposes/lawful basis and consent wording per workflow;
- organization-configurable retention within legal minimum/maximum rules;
- data subject search, export, correction, and deletion with identity verification;
- tenant export and verified deletion on termination;
- audit of privileged reads/exports/deletes;
- data residency and cross-border transfer decision;
- breach/incident notification procedure;
- production privacy notice, commercial terms, accessibility statement where required.

Do not put full answer bodies into analytics. Prefer derived metrics and pseudonymous identifiers.

## Retention proposal

Defaults require owner/legal confirmation:

- invitations and raw customer tokens: expire quickly; retain token metadata for audit without raw value;
- submissions: organization-configurable, suggested initial default 24 months unless business/legal needs differ;
- failed upload quarantine: days, not months;
- provider raw webhook bodies: shortest operational period, encrypted/restricted;
- automation attempt logs: 90 days online, summarized longer if needed;
- audit logs: longer tamper-resistant retention, suggested 2-7 years depending on event/legal need;
- deleted tenant data: purge from primary/storage promptly, then expire through backup lifecycle.

Deletion jobs must be idempotent, report partial failure, and respect legal holds.

## Backup and restore

- Confirm current plan backup schedule and PITR availability before launch: [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups).
- Database backup alone is insufficient: inventory Storage objects, function/config versions, Auth configuration, secrets metadata, and DNS/deployment configuration.
- Take logical exports before destructive migrations and major imports when supported.
- Quarterly staging restore drill for early V1; increase cadence with customer count/criticality.
- Define target RPO/RTO. Proposed starting objectives for owner approval: RPO <= 24 hours and RTO <= 8 hours for initial low-volume customers; tighter objectives require paid capabilities and tested automation.
- Restore into isolated staging/new project first, validate counts/checksums/RLS, rotate exposed credentials, then cut over through a documented approval.

## Monitoring and alerting

### Signals

- API error rate/latency and public submission failures;
- auth sign-in/invite anomalies and repeated authorization denials;
- database CPU/storage/connections/locks/slow queries;
- RLS/advisor findings and migration failures;
- queue depth/age, dead letters, retry storms;
- provider health, invalid webhook signatures, payment mismatches;
- Storage upload/scan failures and quota;
- backup completion and restore drill status;
- frontend error rate and Core Web Vitals with PII-safe telemetry;
- usage/cost thresholds per organization and platform.

### Alert routing

- P1: cross-tenant access evidence, credential leak, forged paid state, widespread data loss/unavailability.
- P2: sustained submission failure, queue backlog beyond SLO, provider outage with customer impact, backup failure.
- P3: individual automation dead letter, approaching quota, degraded non-critical integration.

Every alert needs owner, runbook, deduplication, severity, and recovery verification. Avoid alerting on expected individual validation failures.

## Incident response

1. Preserve evidence: correlation IDs, audit logs, deployment/migration versions, provider events; avoid editing affected data ad hoc.
2. Contain: revoke tokens/credentials, disable affected integration/rule, suspend support session or tenant endpoint, apply rate limit/circuit breaker.
3. Assess tenant/data scope and legal notification requirements.
4. Recover from verified migration/backup or forward fix; never silently rewrite immutable audit evidence.
5. Validate customer journey, cross-tenant isolation, queues, webhooks, and monitoring.
6. Communicate facts, uncertainty, workaround, and next update.
7. Post-incident review with corrective owners/dates and test coverage.

Runbooks required before launch: suspected customer-token leak, cross-tenant RLS failure, provider credential leak, payment webhook mismatch, automation backlog, bad migration, database restore, Storage malware, and account takeover.

## Deployment and rollback

- Protected production environment and approval; no automatic production deploy from unreviewed documentation/feature branches.
- Build once, promote the same artifact; environment-specific public config only.
- Database expand/migrate/contract sequence. Destructive migration requires current backup/export, impact analysis, staged rehearsal, and rollback/restore plan.
- Feature flags default off for new providers/automations and can disable without deploy.
- Canary/pilot by RockStack/internal tenant, then first customer, then wider rollout.
- Post-deploy smoke: auth, publish, public fetch, submission, owner inbox, cross-tenant denial, queue health.
- Roll back application independently when schema remains backward compatible; otherwise execute the pre-approved forward fix or restore plan.

## Availability and capacity

- Use request timeouts and bounded database statement timeouts.
- Paginate owner lists and audit/event history; no unbounded tenant exports in synchronous requests.
- Connection pool appropriate to serverless functions; avoid one direct connection per browser.
- Backpressure public submissions with fast 429/503 behavior rather than queue/database collapse.
- Provider circuit breakers isolate failures.
- Set hard limits for workflow JSON, steps/fields/options, answers, files, automation rules/actions, webhook body, retries, and monthly spend.

## Operational ownership checklist

Before production:

- named service owner and incident contact;
- on-call expectation and support hours stated commercially;
- environment/key/provider inventory;
- dashboards and alert tests;
- backup and restore evidence;
- runbooks exercised;
- privacy/security/accessibility facts reviewed;
- customer onboarding/offboarding checklist;
- dependency and patch cadence;
- monthly access/membership/support-session review;
- quarterly RLS regression and restore drill.

## Acceptance criteria

- Threats above map to implemented controls and automated tests.
- Production secrets are inventoried, scoped, rotated, and absent from clients/logs.
- Restore drill meets approved RPO/RTO.
- P1/P2 alerts reach a responsible human and link to a tested runbook.
- Data retention, export, and deletion are executable and audited.
- Production deployment has an approved rollback/forward-recovery path.
