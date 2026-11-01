# Formangle — what is local today, and the minimum backend later

Nothing here is implemented. It records what the local demo deliberately does not do, and the
smallest architecture that would make each capability real. The UI already talks only to
`FormangleRepository` (`src/data/repository.ts`); a server implementation replaces
`LocalStorageRepository` behind the same interface.

## Status by capability

| Capability | Local demo (RC 1.0) | Status |
|---|---|---|
| Workflow creation, editing, design, Brand Kit | full, in this browser | functional locally |
| Publishing (immutable versions) | full, in this browser | functional locally |
| Request management, notes, statuses | full, in this browser | functional locally |
| Formangle Actions (create, answer, cancel, timeline) | full, same browser for owner and customer | functional locally |
| Analytics | computed from local data | functional locally |
| Customer submissions from other devices | — | **simulated / not connected** |
| Customer decisions delivered across devices | — | **not connected** |
| Notifications (email / SMS / WhatsApp) | previews only, labelled | **simulated** |
| Payment confirmation | demo button, labelled `*_simulated` | **simulated** |
| External payment link | opens the business's own page | real link, outcome unknown |
| Shared bookings / capacity | counted per browser | **simulated** |
| Authentication, tenant isolation | none (anyone in the browser is the owner) | **not connected** |
| AI generation | keyword + template engine | **not connected** |

## Minimum backend

1. **Workspace authentication.** Accounts, organisation membership and roles enforced on the
   server (owner / staff). Sessions via an established provider or self-hosted auth.
2. **Tenant isolation.** Every row carries `orgId`; database-level policies (e.g. Postgres
   row-level security) so one business can never read another's data.
3. **Published workflow storage.** `WorkflowVersion` rows are write-once. The public route
   `/f/:slug` reads the published version server-side; drafts never leave the owner's account.
4. **Customer submissions.** `POST /f/:slug/runs` validates with the same pure `engine/`
   functions (`validateRun`, `computePrice`, booking and capacity checks) server-side; the
   client total is never trusted (already true in `LocalStorageRepository.submitRun`).
5. **Secure personal request links.** Replace `?r=<runId>` with a signed, expiring,
   revocable token (random ≥128 bits, stored hashed) that grants access to one run only.
   Today run ids are random (64 bits) but act as bearer secrets with no expiry.
6. **Formangle Actions.**
   - Table `customer_actions`, mirroring `CustomerActionSchema`; insert-only for terms,
     with status, response and cancellation as guarded transitions (`engine/actions.ts`).
   - Answer endpoint authorised by the request token; idempotent, with a unique constraint
     of one response per action (no double answers under concurrency).
   - Server time for `createdAt`, `respondedAt` and expiry.
   - Optional delivery: a notification carrying the request link — delivery status is
     recorded only from the provider's callback, never assumed.
   - Legal note: an answer is a recorded choice, not an electronic signature, unless a
     qualified signature process is added deliberately.
7. **Server-side validation.** All writes through API routes or edge functions that parse
   with the Zod schemas in `src/domain/schema.ts` before touching the database.
8. **Payment webhook verification.** Hosted checkout per provider; a run is marked paid only
   after a signed webhook is verified and matched to the provider transaction id. External
   links remain "unknown" unless the provider confirms.
9. **Audit log.** Append-only event table (today: `RunEvent`) written in the same
   transaction as each state change, including actor and source IP / token id.
10. **Notification delivery.** Queue + worker, templates, retries, opt-out, delivery receipts.
11. **Uploads.** Object storage with size and type limits, malware scanning and signed URLs
    (today: downscaled data URLs in localStorage, 1.2 MB per workspace).

## What is already prepared
- Async repository interface with explicit customer-side methods
  (`getPublicRun`, `getPublicActions`, `respondToAction`, `cancelRunByCustomer`).
- Pure, deterministic engines reusable on the server (`src/engine/*`).
- Single-source Zod schemas and forward-only, tested migrations.
- Versioned, immutable published snapshots; runs and actions bound to their version.
