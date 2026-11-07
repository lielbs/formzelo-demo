# Production V1 Open Decisions

## How to use this log

The defaults below are recommendations, not silently accepted product requirements. Assign a named owner and record a decision before the indicated milestone. If a decision changes a security boundary, data model, migration, provider, or launch commitment, update the related architecture document and acceptance tests in the same change.

Statuses: `proposed`, `accepted`, `rejected`, or `superseded`.

## Decisions established by this audit

| Decision | Status | Rationale |
|---|---|---|
| Evolve the current product rather than rewrite it | accepted | UI, renderer, schema, engines, and repository seam provide reusable foundations |
| Use a modular monolith for Production V1 | accepted | Maintains transactional simplicity and a small operational surface while preserving module boundaries |
| Use Supabase/Postgres as the first production system of record | accepted for architecture | Fits relational tenancy, RLS, Auth, Storage, migrations, and managed operations; commercial/project choice still requires approval |
| Keep tenant data on a shared platform with strict `organization_id` isolation | accepted for V1 design | Simplest credible model for the expected stage; enterprise isolation can be a later tier |
| Preserve `LocalStorageRepository` as a demo/offline adapter during migration | accepted | Protects the working demo and enables contract comparison |
| Make server commands authoritative for validation, pricing, capacity, and side effects | accepted | Browser state and calculations are not a trust boundary |
| Require RLS in addition to application authorization | accepted | Provides database-level tenant isolation and defense in depth |
| Keep this phase non-production and documentation-only | accepted | No authorized production project, credentials, backup, or rollback context exists |

## Blocking decisions

| ID | Decision | Recommended default | Owner | Decide before | Status |
|---|---|---|---|---|---|
| D-01 | Launch countries and data region | One region nearest the initial Israeli/European customer base; document cross-border processing | Product + privacy | Milestone 0 environment creation | proposed |
| D-02 | Workforce login method | Email magic link or OTP for V1; optional password only if customer research requires it | Product + security | Milestone 0 Auth setup | proposed |
| D-03 | Organization roles | `owner`, `admin`, `editor`, `operator`, `viewer`; keep billing/support capabilities separate | Product + engineering | Schema/RLS implementation | proposed |
| D-04 | Invitation lifecycle | Single-use hashed invitation, 72-hour expiry, role/tenant bound, revocable, audited | Product + security | Auth vertical slice | proposed |
| D-05 | Customer/public access | Anonymous opaque submission token by default; add verified email OTP only for resume or sensitive flows | Product + privacy | Public command API | proposed |
| D-06 | Public token lifetime | 24 hours for unfinished flows; configurable shorter lifetime for sensitive workflows; explicit revocation | Product + security | Public command API | proposed |
| D-07 | First payment provider and markets | Select one provider based on supported countries/currencies, webhook quality, refunds, and compliance—not UI catalogue order | Product + finance + engineering | Milestone 3 | proposed |
| D-08 | Payment timing | Create provider intent only after server validation; decide authorization vs capture per workflow category | Product + finance | Payment design | proposed |
| D-09 | First messaging provider/channel | Transactional email first; add SMS/WhatsApp only with demonstrated need and consent model | Product + privacy | Milestone 3 | proposed |
| D-10 | File upload scope | Defer customer files from first slice; later use private objects, strict limits, scanning/quarantine, and short signed URLs | Product + security | Milestone 2 | proposed |
| D-11 | Data retention | Tenant-configurable within legal bounds; proposed 30-day incomplete submissions, 24-month completed submissions, 12-month operational audit, shorter raw logs | Product + privacy/legal | Before storing pilot data | proposed |
| D-12 | Backup RPO/RTO | Pilot default RPO ≤24h and RTO ≤8h; tighten only after business-impact analysis and plan/cost approval | Product + platform | Milestone 0 backup design | proposed |
| D-13 | Hosting/runtime | Managed server/edge runtime compatible with chosen Supabase region; previews isolated and never use production secrets | Engineering/platform | Milestone 0 | proposed |
| D-14 | Production domains | Separate app and public-flow subdomains; add custom tenant domains only after V1 | Product + engineering | Deployment/security headers | proposed |
| D-15 | Support access | No standing cross-tenant support read role; time-boxed approved impersonation/support sessions with reason and audit | Support + security | Pilot operations | proposed |
| D-16 | Accessibility target | WCAG 2.2 AA for owner and public flows, including RTL and supported screen readers | Product + design | Milestone 1 test plan | proposed |
| D-17 | Pilot scale and limits | Define tenants, monthly submissions, workflow/file limits, peak RPS, and provider budget before load testing | Product + platform | Milestone 1 capacity test | proposed |
| D-18 | Migration population | Opt-in pilot workspaces only; no automatic harvesting of arbitrary browser local storage | Product + support | Migration rehearsal | proposed |

## Important non-blocking decisions

| ID | Decision | Recommended default | Owner | Decide before | Status |
|---|---|---|---|---|---|
| D-19 | Billing and entitlements | Keep plan/limit enforcement server-side; manual pilot entitlement before self-service billing | Product + finance | General availability | proposed |
| D-20 | Automation launch scope | Fixed curated triggers/actions first; generalized builder only after queue operations are proven | Product + engineering | Milestone 4 | proposed |
| D-21 | CRM/calendar providers | Choose from signed customer demand and API quality; one adapter per category initially | Product + integrations | Milestone 4 | proposed |
| D-22 | Outbound webhooks | Allow only verified HTTPS destinations, signed payloads, bounded DNS/redirect handling, and tenant quotas | Security + engineering | Milestone 4 | proposed |
| D-23 | Analytics | Privacy-preserving product events with documented purpose; no answer bodies or arbitrary form values | Product + privacy | Pilot instrumentation | proposed |
| D-24 | Error monitoring vendor | Managed EU-region-capable vendor or equivalent; scrub request/answer payloads before export | Platform + privacy | Milestone 0 telemetry | proposed |
| D-25 | Log retention | 30 days hot operational logs by default; longer security/audit data only when justified and access-controlled | Platform + privacy | Pilot operations | proposed |
| D-26 | Custom domains | Post-V1; require automated certificate lifecycle and domain ownership verification | Product + platform | General availability | proposed |
| D-27 | Advanced identity | Defer SSO/SAML/SCIM; design membership model so external identity providers can be added later | Product | Enterprise roadmap | proposed |
| D-28 | Enterprise isolation | Shared database for V1; offer dedicated project/region only after commercial and operational analysis | Product + platform | Enterprise contract | proposed |
| D-29 | Localization | Hebrew/RTL remains first-class; define English content parity and locale-specific formatting before launch | Product + design | Pilot content QA | proposed |
| D-30 | Workflow schema evolution | Immutable published version JSON with versioned readers; migrations only for canonical projections/constraints | Engineering | First publish command | proposed |
| D-31 | Calculation compatibility | Version engine semantics and store engine version with each publication/submission | Engineering | Server recomputation | proposed |
| D-32 | Deletion and legal hold | Soft workflow lifecycle; hard tenant/submission deletion through audited job with explicit legal-hold override | Privacy/legal + engineering | Pilot privacy review | proposed |
| D-33 | Service level/support hours | Best-effort pilot with explicit support window; no uptime SLA until monitored operating history exists | Product + support | Pilot agreement | proposed |
| D-34 | Open-source/dependency policy | Automated inventory and vulnerability review; approve licenses before adding provider SDKs | Engineering + legal | Provider implementation | proposed |

## Provider selection scorecard

Before selecting any payment, messaging, CRM, calendar, storage-processing, or monitoring provider, record:

- countries, currencies, languages, and data-residency/subprocessor facts;
- security controls, webhook signing, credential scopes, rotation, and audit features;
- sandbox fidelity, idempotency support, API/version policy, SDK quality, and rate limits;
- failure behavior, export/deletion capability, portability, and vendor lock-in;
- pricing at pilot, expected, and stress volumes, including logs/egress/messages;
- accessibility and localization impact where the provider exposes user-facing UI;
- contractual, privacy, tax, and regulatory review owner;
- fallback/manual recovery path and exit plan.

The provider catalogue currently shown in the product is a UX/demo inventory, not evidence that those providers are integrated, approved, or suitable.

## Decision record template

Use this template when closing an item:

```markdown
### D-XX — Decision title

- Status: accepted | rejected | superseded
- Date:
- Owner:
- Approvers:
- Context and constraints:
- Options considered:
- Decision:
- Security/privacy/operational impact:
- Cost impact:
- Required implementation/document updates:
- Revisit trigger or date:
```

## Immediate decision workshop

Before implementation begins, run a 60–90 minute product/engineering/security session focused only on D-01 through D-06, D-11 through D-13, D-16, and D-17. The output should be an approved V1 boundary, not provider implementation. Payment, messaging, and migration population can be finalized before their respective milestones.

## Unresolved evidence gaps

These require environment or stakeholder evidence rather than repository inspection:

- actual customer countries, sensitivity, retention expectations, and accessibility needs;
- expected tenants, submissions, files, concurrency, and provider spend;
- approved Supabase plan, region, organization ownership, and backup features;
- legal basis, privacy notices, subprocessors, payment/tax obligations, and deletion constraints;
- provider accounts, credentials, webhook endpoints, and commercial terms;
- support model, incident contacts, pilot users, and service expectations;
- whether any existing browser-only data is business-critical and must be migrated.

Do not convert an evidence gap into an implicit technical requirement. Record the owner and decide it at the named gate.
