# Production V1 Implementation Roadmap

## Planning assumptions

This roadmap is a sequence of verified capabilities, not a calendar promise. Estimates assume two experienced full-stack engineers with part-time product/design, security, and QA review; existing UI and pure engines remain; Supabase is the first production platform; and provider requirements do not expand during a milestone.

Recommended planning ranges:

- first production vertical slice: **5–8 engineering weeks**;
- production foundation through a controlled pilot: **12–20 engineering weeks**;
- broader provider catalogue, enterprise controls, and scale work: subsequent increments driven by validated demand.

The range excludes legal review, provider onboarding delays, external certification, large redesigns, and migration repair for data formats not found in the current repository.

## Delivery principles

- Deliver thin end-to-end slices with real authorization and persistence.
- Treat RLS, server recomputation, idempotency, and auditability as acceptance criteria, not later hardening.
- Keep provider SDKs behind adapters and keep secrets in trusted runtimes.
- Promote the same migration and application artifact through isolated environments.
- Use expand/migrate/contract database changes and preserve a rollback window.
- Do not call a slice complete until failure paths and operational evidence exist.

## Milestone 0 — production foundation

Scope:

- resolve blocking decisions and name system owners;
- create isolated development/staging/production projects and environments;
- establish SQL migrations, generated database types, seed fixtures, and CI drift checks;
- create organization membership and invitation primitives;
- establish secret management, structured logging, request/trace IDs, and baseline dashboards;
- define the production repository configuration boundary;
- add local development and incident/rollback runbooks.

Acceptance criteria:

- a clean project can be reproduced from migrations and documented configuration;
- environment credentials are separate and no service secret appears in a browser bundle;
- CI runs lint (if configured), typecheck, unit tests, build, migration checks, and secret scanning;
- staging backup restore is demonstrated;
- on-call and deployment/rollback owners are named.

Dependencies: open decisions for region, hosting, auth method, roles, retention, and RPO/RTO.

## Milestone 1 — first working production vertical slice

This is the recommended Phase 1 build scope. It intentionally excludes real payments, messages, CRM, calendar, generalized automations, and user file uploads.

Required demonstration:

1. An invited owner logs in and sees only an organization of which they are a member.
2. The owner creates or edits a workflow draft and publishes an immutable version.
3. A customer on another device or clean browser session opens the public workflow and submits valid answers.
4. The authorized owner sees the persisted submission and event history.
5. A second tenant and an anonymous session are denied access to the first tenant's data, including by direct object ID.
6. The workflow and submission survive browser restart, application redeploy, and access from another authorized device.
7. The server reloads the published version and recomputes normalization, validation, rules, price, and terminal state; client-tampered totals or hidden answers are rejected.

Implementation scope:

- Auth session and invitation flow;
- organizations, memberships, workflows, immutable versions, submissions, answers, and events;
- RLS policies and policy-test harness;
- production repository methods for the slice;
- server-owned publish and submit commands;
- opaque, hashed, expiring public access token with revocation;
- idempotency key on submission completion;
- structured audit and operational telemetry;
- contract/parity tests shared with `LocalStorageRepository` where semantics match.

Acceptance criteria:

- all seven demonstrations pass in staging with recorded evidence;
- positive and negative RLS tests use at least two tenants, two members, and an anonymous role;
- a duplicate submit request produces one logical completion and one set of effects;
- a stale draft update returns a conflict instead of overwriting newer data;
- client and server engine parity fixtures pass; tampered input fails closed;
- p95 latency and error rate meet the approved pilot budget under an agreed load profile;
- audit records identify actor, tenant, command, target, result, and trace without storing sensitive answer bodies;
- rollback to the prior application version is rehearsed while the schema remains compatible.

## Milestone 2 — actions, files, and capacity

Scope:

- owner action lifecycle with optimistic concurrency;
- private file upload/download using signed URLs, limits, quarantine, and scanning state;
- atomic capacity holds/reservations and expiry;
- owner dashboards with bounded pagination and filters;
- data export and tenant deletion workflows.

Acceptance criteria:

- unauthorized storage object IDs and signed URLs cannot cross tenants;
- invalid, oversized, or unsafe files never become downloadable to ordinary users;
- concurrent requests cannot oversell capacity;
- action transitions are validated and audited;
- exports are complete, access-controlled, and expire; deletion respects approved legal holds and provider cleanup.

## Milestone 3 — first payment and messaging adapters

Scope:

- select one payment provider and one transactional messaging provider;
- credential references and rotation workflow;
- server-side payment intent/order creation;
- signed webhook inbox, deduplication, state reconciliation, and refund/cancellation behavior;
- transactional confirmation and owner notification templates;
- sandbox and failure-injection tests.

Acceptance criteria:

- price and currency are derived from the immutable workflow version on the server;
- webhook signatures, timestamp tolerance, uniqueness, and state transitions are enforced;
- duplicate/out-of-order callbacks converge on the correct state;
- provider outages do not lose accepted work and do not block unrelated tenants;
- operators can reconcile a submission with provider event IDs and replay safe jobs;
- secrets are rotated without redeploying client code.

## Milestone 4 — automation platform and additional integrations

Scope:

- versioned trigger/condition/action definitions;
- transactional outbox and durable queues;
- bounded retries, jitter, dead-letter state, replay controls, and per-tenant quotas;
- CRM, calendar, and outbound webhook adapters selected by demand;
- SSRF-safe destinations, payload allowlists, and signing;
- automation execution timeline and admin operations.

Acceptance criteria:

- every job has tenant, rule version, source event, idempotency key, attempt, and trace context;
- retryable and permanent errors are classified; no infinite retry loop exists;
- replay requires authorization and cannot duplicate completed external effects;
- outbound destinations are verified and private/link-local addresses are blocked after DNS resolution;
- a noisy tenant is rate/cost limited without starving others;
- dead-letter age and queue lag alerts link to tested runbooks.

## Milestone 5 — pilot readiness and migration

Scope:

- execute the staging rehearsal and tenant migration plan;
- complete accessibility, privacy, security, load, restore, and incident exercises;
- validate support access, operational dashboards, cost limits, and provider production configuration;
- onboard a small consenting pilot cohort;
- record go/no-go and rollback decisions.

Acceptance criteria:

- no open critical/high security or data-integrity defect;
- cross-tenant denial and public-token lifecycle tests pass in the release candidate;
- WCAG target and supported browser/device matrix are approved and tested;
- restore drill meets RPO/RTO and the pilot load has documented capacity headroom;
- migration reconciliation has no unexplained differences;
- alerts reach the responsible human and incident/rollback runbooks are exercised;
- legal/privacy copy, retention, deletion, export, and subprocessors are approved;
- pilot success metrics and stop conditions are explicit.

## Milestone 6 — general availability hardening

Scope is evidence-driven: entitlement/billing controls, custom domains, regional strategy, advanced roles, SSO, higher limits, analytics, additional providers, and scale work are added only after pilot usage and commercial priorities justify them.

Acceptance criteria:

- service limits, support expectations, and provider dependencies are customer-visible;
- cost per active tenant/submission and quota enforcement are observable;
- capacity test supports the approved launch target with headroom;
- operational ownership and security/privacy reviews have an ongoing cadence.

## Workstreams and ownership

| Workstream | Accountable owner | Key evidence |
|---|---|---|
| Product scope and open decisions | Product lead | Decision log, launch criteria |
| Database and RLS | Backend/data lead | Migrations, policy tests, restore report |
| Auth and invitations | Backend lead | Session/invitation abuse tests |
| Repository and server commands | Full-stack lead | Contract and engine parity tests |
| UI/public flow/accessibility | Frontend lead | Browser/a11y test report |
| Providers and automation | Integrations lead | Sandbox, idempotency, replay evidence |
| Security/privacy | Security/privacy reviewer | Threat review, retention/deletion approval |
| Reliability/deployment | Platform owner | Dashboards, load/restore/rollback exercises |
| Migration/support | Delivery/support owner | Reconciliation and support runbooks |

One person may hold multiple roles, but each acceptance artifact needs a named approver who did not author the highest-risk control where practical.

## Required test portfolio

- pure engine unit and property tests;
- repository contract tests against local and production adapters;
- SQL constraint and migration tests;
- RLS positive/negative tests with real JWT claims;
- server command integration tests;
- browser tests across authenticated/public flows and multiple sessions;
- automated accessibility plus keyboard and screen-reader review;
- webhook/provider sandbox and fault-injection tests;
- queue retry/idempotency/dead-letter tests;
- load, rate-limit, and tenant-isolation tests;
- backup restore, migration rehearsal, and rollback exercises;
- dependency, secret, and application security scans.

## Not in the first vertical slice

- multiple production providers per category;
- a generalized no-code automation editor;
- custom domains, SSO/SAML, SCIM, or enterprise audit export;
- real-money settlement;
- customer file upload;
- broad migration of every browser demo dataset;
- active-active regions or bespoke high-availability infrastructure;
- a visual redesign.

Deferring these keeps the first milestone focused on proving identity, tenancy, persistence, immutable publication, public submission, and server authority—the foundation every later capability depends on.
