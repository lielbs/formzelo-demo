# Formangle Tables — Consolidated Production-Change Proposal

Status: **awaiting founder approval. Nothing below has been executed.** Approval of one item does
not approve another; please name each item you approve.

## 1. What would ship
- Commits (local branch `production-v1`, on top of `8ed2d2b`; not pushed): `e2aa454` database, `6b59b2f` app,
  `81d49b3` tests, and the documentation commit that contains this file.
- Application: one GitHub Pages artifact built from that commit (demo at `/` unchanged; production app
  at `/live/` gains the Tables module, the operator switch and the `/t/...` guest pages). Tables is
  invisible to every business until an operator enables it.

## 2. Database migrations (apply in this order, exact files)
SHA-256 of the committed files (commit `e2aa454`), applied in this order:

| Migration | SHA-256 |
|---|---|
| `20261110090000_tables_foundation.sql` | `f3d576bdb3215c61cea0b17e9d3704dd0b05ccb4158aedf5a035d694939100d5` |
| `20261110100000_tables_inventory.sql` | `21ed6963590f2d01511f0ac04e3da80e8045c5028dab5e23b385ebd8352b660c` |
| `20261110110000_tables_policies.sql` | `82b3d84a41b579872ce3b791561713240f69b66b2d4c37dbd49ebca76887846e` |
| `20261110120000_tables_live_shift.sql` | `ca55cd67684c3579a4c37517fc2dfc474e8faa05a37c2f0181ecdbfc36b2df8e` |
| `20261110130000_tables_waitlist.sql` | `8db0c31c1892f94a0575063899d60d9e15685d6b3f2f682a207d87bcd66fd422` |
| `20261110140000_tables_menus.sql` | `0d2f315bb088d5fab0c851ed2db17e21907b612479060c0a2e41f5a19a6401bf` |
| `20261110150000_tables_analytics.sql` | `61168cd4121897fb83e2b15c8490c5716eda73e1e2105313b21dffb2de86fb9e` |
| `20261110160000_tables_hardening.sql` | `86ba31e0b34391950c146322ef79314484fe7fdb7562589c32cf394cb89872b7` |

Rollback script `supabase/rollback/tables-down.sql`: `f85891db2e41316d0c4e4d9be1ee8b8048c3570d864d900bd3663516e7ba3b3b`.
Before applying, recompute the hashes from the merged commit and compare; any difference stops the rollout.

Reviewed SQL impact: additive only — new `tables_*` tables/functions in `public` and `private`, the
`btree_gist` extension (in `extensions`), one Realtime publication entry (`tables_shift_revisions`),
and `operator_list_organizations()` replaced with one extra field (`tablesEnabled`). No existing
table, row, policy or grant is changed. Every new table has RLS enabled before grants; operational
tables have no client grants (RPC only).

## 3. Edge Functions / configuration
- Edge Functions: **none** (public booking uses SQL functions with database rate limits, like the existing public forms).
- `vite.config.ts` CSP: `connect-src` gains `wss://ppgdbqhwbzlgzwsjmkor.supabase.co` (Realtime for the host screen).
- Supabase dashboard: **Realtime must be on for the project** (it is a standard Pro feature; verify
  it is not disabled; no add-on). The local `config.toml` change only affects the local stack.

## 4. Target guard and RAVO exclusion
Every step targets project ref `ppgdbqhwbzlgzwsjmkor` only (the app's runtime guard pins it; the
migration tool will be called with that ref after a read-only `get_project` check of name/ref/region).
No RAVO project, credential or resource is read, referenced or changed by any file in this change
(`git grep -i ravo` on the change: only documentation sentences saying RAVO is excluded).

## 5. Backup and recovery
- Before migrating: note the latest daily Pro backup time and take a logical export (OPERATIONS §1).
- RPO 24 h (daily backups; PITR is a paid add-on and is not requested). RTO: module kill switch in
  seconds; app revert ~2 min; schema rollback with `supabase/rollback/tables-down.sql` (verified locally)
  minutes, only while no Tables data exists — after pilot data exists, restore/export procedure instead.

## 6. Rollout, smoke tests, stop conditions
1. Read-only checks: project, migration ledger (11 versions), advisors.
2. Apply the 8 migrations in order; verify ledger = repository (19 versions) and advisors (no new errors).
3. Merge `production-v1` → `main`, push; Pages deploys; verify `/` and `/live/` as before.
4. Operator enables Tables for **one approved test/pilot business only**.
5. Smoke on the live site with that business: owner setup + publish; guest booking on a phone;
   host sees it live; modify + cancel by link; approval; walk-in; waitlist offer/seat; menu publish
   and view; second business cannot see the venue; anonymous direct table reads denied; a tampered
   link shows nothing; the per-IP rate limit sees the client IP header (read-only check in logs).
6. Watch 48 h: database CPU/connections, Realtime connections/messages, API errors (`tables:`).
Stop conditions: any double booking, any cross-tenant read, error rate on Tables RPCs > 2 %, p95 of
host actions > 750 ms sustained → disable the module for the business first, then follow rollback.

## 7. Evidence summary
Details in `IMPLEMENTATION_PROGRESS.md`. In short (local stack, after a clean reset):
pgTAP 427 passed (RLS, tenant isolation, grants); vitest 375 passed incl. 10 real-connection races
and the database busy shift (every invariant 0: no double booking, no partial combination, no lost
update); Playwright 32 passed (22 existing + 10 Tables, incl. three hosts converging on the database
and Realtime delivery in ~0.3 s); visual sweep 756 screenshots, 12 sizes, light/dark, he/en — 31
defects found and fixed; owner walkthrough — 8 confusions fixed; query cost flat from 1 to 100
venues (availability 33 → 37 ms); rollback verified; typecheck, lint, build pass; npm audit 0.
Not performed: manual screen reader, physical touch device, Cloud timing.

## 8. Cost
No new subscription, add-on, compute, branch, Edge Function, paid API or external service.
Uses existing quotas: database rows/disk, Realtime (one channel per open host screen, one message
per change), Storage only for menu images that already exist in the Brand Kit. Pilot projection
(1–5 venues) is far inside the included Pro quotas (ZERO_COST_AND_SCALING.md §4). Spend Cap stays on.

## 9. Live data and identities needed
- One business to pilot (the founder chooses; `impact-networks` exists as a test business).
- Smoke-test reservations would be created in that venue as clearly named test bookings and
  cancelled afterwards; they remain in the history (no deletion without approval).
- No new accounts are needed by the assistant; any staff account is created by the founder.

## 10. Residual risks and founder decisions
See the "Residual risks" section of `IMPLEMENTATION_PROGRESS.md`.
