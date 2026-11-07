# Formangle Production Operations

Target: Supabase project `FORMANGLE` (`ppgdbqhwbzlgzwsjmkor`, eu-west-1, Pro), frontend on GitHub Pages at https://formangle.rockstackds.com. RAVO is a separate project and is never touched by any procedure here.

## 1. Backups and recovery

| What | How it is protected | Recovery |
|---|---|---|
| Database (all tenants, requests, quotes, notes, audit) | Supabase Pro daily backups, 7-day retention (included). Before every release: an additional logical export (below). | Dashboard → Database → Backups → restore (whole project, downtime of minutes). For a partial/forensic recovery, restore the logical export into a scratch database and copy rows back under review. |
| Schema, RLS, functions, storage bucket and storage policy | Version-controlled migrations in `supabase/migrations` | Replay migrations in order on a fresh database (`supabase db reset` locally; CI does this on every push). |
| Brand images (`brand-assets` bucket) | Objects are immutable and never deleted by clients; Storage objects are **not** in database backups. | Weekly export of the bucket (`supabase storage cp -r ss:///brand-assets ./backup/brand-assets --experimental` with the operator's access token), kept off-platform. Metadata rows are in the database backup. |
| Edge Functions | Source in `supabase/functions` | Redeploy from the tagged commit. |
| Frontend | Git history; GitHub Pages deploys `main` | Revert the commit and push (redeploys in ~1 minute). |

Point-in-time recovery is a paid add-on and is **not** enabled (zero-additional-cost rule); the recovery point objective is therefore up to 24 hours. Revisit when paying customers depend on intraday data.

### Pre-release logical export (run before every migration)
```bash
npx supabase@3.0.0 db dump --linked --data-only -f backup/pre-release-data.sql
npx supabase@3.0.0 db dump --linked -f backup/pre-release-schema.sql
```
Store outside the repository. Never commit dumps.

### Restore drill evidence (2026-11-08, local disposable stack)
- `pg_dump` (custom format, schemas `public` and `private`) of a database populated by the full E2E journey (11 organizations, 145 audit events, quotes, notes, assets).
- Restored into a fresh database together with `auth.users` and the platform schemas.
- Row counts identical for organizations, memberships, workflows, versions, submissions, events, quotes, actions, notes, assets, audit (11/8/5/5/5/25/4/0/4/4/145).
- Same number of RLS-enabled tables (16), triggers (28) and functions (83); `private.quote_totals` returns the same result (118.00).
- Difference found and documented: the Storage policy lives in the platform `storage` schema and is restored by replaying migration `20261108110000_brand_media_storage`, not by a logical dump of `public/private`.

## 2. Monitoring (no paid services)
- `.github/workflows/production-smoke.yml`: every 6 hours and on demand — the public site returns 200 with the CSP, the API answers, and an unknown public form resolves to nothing (proves the RPC layer is up and private data is not exposed). A failing run emails the repository owner (GitHub default).
- Supabase dashboard: Reports (API, Auth, Storage, Database), Logs Explorer, and Advisors (security + performance) after every migration.
- Quotas: Pro includes 8 GB database, 100 GB storage, 250 GB egress, 2M Edge Function calls. Check Usage monthly; Spend Cap stays **on** so overage is blocked rather than billed.

## 3. Incident response
1. Confirm scope: smoke workflow, Supabase status page, Logs Explorer (filter by function or `status >= 500`).
2. Contain: a broken release → revert the frontend commit; a broken function → redeploy the previous version; suspected data exposure → revoke customer links (`revoke_tracking_links`), suspend the organization (`update organizations set status='suspended'` by an operator in SQL editor — RLS then denies all access immediately).
3. Preserve evidence: export relevant `audit_events` and logs before changes.
4. Recover (section 1), verify with the post-deploy smoke list (section 6), then write a short incident note in `docs/production/incidents/`.
5. Personal-data breach: notify affected businesses; legal notification duties under the Israeli Privacy Protection Regulations (Data Security) apply — decision with legal counsel.

## 4. Support runbooks
| Request | Who | How |
|---|---|---|
| New business | Operator | `/operator` → עסק חדש → send the owner link (48 h, single use). |
| Owner invitation expired | Operator | `/operator` → הזמנה חדשה. |
| Owner forgot password | Operator | `/operator` → איפוס סיסמה → send the link (2 h, single use). The operator never sees the password. |
| Staff forgot password | Owner | Settings → team → key icon. |
| Add / remove staff | Owner | Settings → team. Removal is immediate. |
| Customer lost their request link | Owner | Request → עמוד הבקשה של הלקוח → new link (old ones keep working until revoked). |
| Link may have leaked | Owner | Request → ביטול כל הקישורים, then create a new one. |
| Business leaves | Operator | Export its data (SQL editor, filtered by organization_id), then suspend the organization. Deletion of rows is a separate, approved operation (restrict FKs prevent accidental cascades). |

## 5. Rollback
- Migrations are additive. Rollback = restore the pre-release backup (whole project) or, for a single new function/table, a reviewed down-migration. Never drop tenant tables in place.
- Edge Functions: redeploy the previous version from Git (`operator-invitations` v1 is unchanged by this release).
- Frontend: `git revert <release-commit>` on `main` and push; GitHub Pages redeploys.

## 6. Post-deployment smoke list
1. Site 200, CSP present, `/f/<unknown>` shows "הקישור אינו זמין".
2. Operator signs in on `/operator`, creates a test business, opens the owner link, creates the account (privacy accepted), sees the dashboard.
3. Owner creates a workflow from a catalog template, uploads a logo, publishes.
4. Phone browser submits as a customer → lands on `/track`.
5. Owner sends a quote and a link → customer approves → request approved in the inbox.
6. Second business cannot open the first business's request.
7. Recovery link changes a password; old password refused.
8. Security and performance advisors: no new warnings.
9. Remove the test business data (operator, reviewed SQL) or keep it suspended.
