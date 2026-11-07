# Formangle Production V1 — Release Package

Status: **awaiting founder approval.** Nothing below has been applied remotely.

## Target (verified read-only, 2026-11-08)
- Supabase project `FORMANGLE`, ref `ppgdbqhwbzlgzwsjmkor`, eu-west-1, PostgreSQL 17.11, ACTIVE_HEALTHY.
- Applied migrations: 4 (Milestone 0–1). Edge Functions: `operator-invitations` v1 only.
- Data: 0 organizations, 0 auth users, 0 operators, 0 storage buckets, database 12 MB.
- RAVO is a different project and is not referenced anywhere in this package.

## Inventory
### Database migrations (apply in this order)
| Version | Purpose |
|---|---|
| 20261104162858_milestone_2_workspace_workflows | Workflow lifecycle RPCs, plan limits, organization provisioning |
| 20261104165034_public_delivery_submissions | Public resolver, transactional submissions, status transitions |
| 20261107120000_server_rule_parity | Server rules identical to the browser engine; booking/intake/option capacity; public counts |
| 20261107140000_customer_portal_quotes | Tracking tokens (hash only), notes, customer actions, interactive quotes |
| 20261107160000_team_onboarding | Roles on invitations, staff invitations/removal, onboarding target, operator overview |
| 20261108090000_password_recovery | Single-use recovery links (hash only), operator/owner issuance |
| 20261108110000_brand_media_storage | `brand-assets` bucket (public read, 1 MB, PNG/JPEG/WebP), tenant-scoped upload policy, asset metadata |

### Edge Functions
| Function | Change | JWT verification | Secrets |
|---|---|---|---|
| operator-organizations | new | gateway on (`verify_jwt=true`) + handler checks operator | existing `FORMANGLE_APP_ORIGIN` |
| account-onboarding | new | off (`verify_jwt=false`); authorises with the invitation/recovery token itself | existing `FORMANGLE_APP_ORIGIN` |
| operator-invitations | unchanged (v1) | — | — |

### Frontend
- GitHub Pages artifact with two builds: the marketing site and demo at `/` (unchanged behaviour) and the production app at `/live/` (dedicated project, publishable key only). Requires merging `production-v1` into `main` and pushing `main`.
- New repository variable (optional, for monitoring): `FORMANGLE_PUBLISHABLE_KEY` (public value).

### Settings to confirm in the Supabase dashboard (no change unless they differ)
- Authentication → Sign In / Providers → **Allow new users to sign up: OFF** (accounts are invitation-only).
- Authentication → Password: minimum length 10 recommended; Leaked-password protection on (included in Pro).
- Billing → Spend Cap: **ON**.

## Execution steps (after approval)
1. Logical export of the empty project (schema + data) and note the latest daily backup time.
2. Apply the 7 migrations in order with `apply_migration`; after each, verify the ledger version and name (reconcile tool timestamps to the committed version as in Milestone 1).
3. Run Security and Performance advisors; expect no new warnings.
4. Deploy `operator-organizations` (verify_jwt true) and `account-onboarding` (verify_jwt false). Smoke: unauthenticated `operator-organizations` → 401; `account-onboarding` with a malformed token → 400; wrong origin → 403.
5. Create the first operator account (RockStack): `auth.admin.createUser` with a strong password chosen by the founder, then insert into `private.platform_operators`. (Requires the founder's chosen operator email.)
6. Merge `production-v1` → `main`, push; wait for the Pages workflow; verify `/` (demo unchanged) and `/live/` (sign-in).
7. Post-deployment journey on the live site with a clearly named test business (OPERATIONS.md §6), including tenant isolation, quote approval, logo upload and password recovery.
8. Remove or suspend the test business; record evidence in PROGRESS.md.

## Rollback (verified locally)
- Database: `supabase/rollback/release-v1-down.sql` returns the schema to the 4-migration state. Verified: apply all 11 migrations → run the script → `pg_dump` of `public`/`private` identical to a 4-migration database; 0 buckets; 0 storage policies; ledger back to 4 versions. The script refuses to run once application data exists; then restore the pre-release backup instead.
- Edge Functions: delete the two new functions (dashboard) — `operator-invitations` v1 is untouched.
- Frontend: `git revert` the merge on `main` and push; the previous demo-only artifact is redeployed.

## Evidence (local, synthetic data)
- Clean replay of 11 migrations; 233 pgTAP/RLS assertions; db lint clean; generated types identical to the schema.
- 340 Vitest tests including browser⇄server parity: 58 templates × 60 generated submissions (repeated with several seeds), 2,000 generated quotes to the agora, an eight-way race for the last booking slot, two-connection invitation concurrency.
- Playwright journey (8 tests, repeated 3× without failure): operator onboarding of two businesses, invitation account creation with privacy acceptance, workflow create/publish, cross-device draft, phone customer submission to the private page, owner status/note/quote/link, customer approval, tenant isolation, password recovery, logo upload/display/removal.
- Responsive sweep: 14 screens × 8 widths (320–1440) without overflow, clipped controls, tiny touch targets or runtime errors; screenshots reviewed.
- Restore drill: dump → fresh database → identical counts, policies, triggers, functions and results.
- Production artifact emulated locally: demo routes unchanged, `/live/` deep links restored through the 404 hand-off, no secret key or service_role JWT in the bundle.

## Cost
Zero additional cost: everything runs inside the existing Supabase Pro quotas (database, Storage ≤100 GB, Edge Functions ≤2M calls, egress ≤250 GB) and free GitHub Pages/Actions on a public repository. No add-ons (no PITR, no image transformations, no custom SMTP, no CAPTCHA service).

## Known limitations at launch
- Customer file uploads: the form asks for a link instead (anonymous uploads would open an abuse/cost vector; see decision in the approval request).
- No automatic email/SMS/WhatsApp: businesses share links themselves (copy or WhatsApp click-to-chat).
- Personal-case workflows (owner opens a case first) are not available in production; such templates become public forms.
- Recovery point objective up to 24 h (daily backups; PITR is a paid add-on).
- The privacy notice awaits legal review and the legal entity details.
