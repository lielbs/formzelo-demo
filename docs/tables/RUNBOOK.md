# Formangle Tables — Operations Runbook

Scope: the Tables module inside Formangle (project `FORMANGLE`, ref `ppgdbqhwbzlgzwsjmkor`). RAVO is a
separate product and is never touched by anything here. No paid service is used: everything runs on
the existing Supabase project (database, Realtime, Storage) and the existing static hosting.

## 1. Turning Tables on and off (kill switch)
| Action | Who | How |
|---|---|---|
| Enable for a pilot business | Platform operator | `/operator` → the business row → **הפעלת שולחנות** (confirms). |
| Disable immediately (incident) | Platform operator | Same button (**שולחנות: פעיל** → confirm). Effect on the next request: no member can open Tables, every public booking/menu/waitlist page of that business shows "not available", manage links stop resolving. Reservations and data are kept. |
| Pause new bookings for one venue | Owner | Venue page → **השהיית הזמנות חדשות**. Existing reservations, host shift and manage links keep working. |
| Close a date | Owner/manager | Venue page → **ימים מיוחדים** → "סגור להזמנות". Applies at once, never cancels existing bookings. |

SQL equivalent (operator, SQL editor, only if the console is unavailable):
`update public.tables_organization_features set enabled = false where organization_id = '<org uuid>';`

## 2. Staff access
- Owners have full access to every venue of their business.
- Venue roles (manager / host / viewer) are given per venue on the venue page → **מי עובד במקום הזה**.
  The person must first be a team member (Settings → team). Removing a role or removing the member
  takes effect on their next screen refresh or action (verified by tests).

## 3. Guest privacy requests
Owner → venue page → **בקשות פרטיות של אורחים**: find by phone → **הורדת המידע** (JSON file) or
**מחיקת הפרטים האישיים** (removes name/phone/email/requests from all of the guest's reservations
and waitlist entries, revokes their links; refuses while the guest has an active upcoming booking).
Every export/anonymization is logged in `private.tables_privacy_log`. Staff notes are immutable and
are kept; deleting them requires an operator procedure under the approved retention policy.

## 4. What to watch (no paid monitoring)
- Supabase dashboard → Reports: database CPU/RAM/connections, API requests, Realtime connections
  and messages. Tables adds one Realtime channel per open host screen and one message per change.
- Logs Explorer: PostgREST errors with `tables:` messages. `tables:rate_limited` bursts mean abuse
  or a misbehaving client; `40001` (stale) is normal during busy shifts.
- Monthly: database size (`tables_reservations`, `tables_reservation_events`, `tables_allocations`,
  `private.tables_rate_events` – the last one self-cleans entries older than a day).

## 5. Incidents
1. Booking problems at one venue → owner pauses the venue (seconds); operator disables the business if broader.
2. Suspected data exposure → disable Tables for the business; revoke links by SQL:
   `update private.tables_access_tokens set revoked_at = now() where organization_id = '<org>' and revoked_at is null;`
3. Preserve evidence: export `tables_reservation_events`, `audit_events`, logs before changes.
4. Double-booking report → run the invariant query below; it must return 0:
   ```sql
   select count(*) from public.tables_allocations a join public.tables_allocations b
     on a.physical_table_id = b.physical_table_id and a.id < b.id and a.occupied_during && b.occupied_during
    where a.state in ('held','confirmed','seated') and b.state in ('held','confirmed','seated');
   ```
   (The database exclusion constraint makes a non-zero result impossible; a report usually means a
   seated party overstayed — check the host's list.)

## 6. Rollback
- Fastest: disable the module per business (section 1). The application keeps working for everything else.
- Application: revert the release commit on `main` and push (GitHub Pages redeploys).
- Database: the Tables migrations are additive (new tables/functions only, plus `operator_list_organizations`
  gaining one field). Rolling back the schema is `supabase/rollback/tables-down.sql` (drops the
  `tables_*` functions and tables, `private.tables_*`, the Realtime publication entry, restores the
  previous `operator_list_organizations`, and removes the 8 ledger rows; verified locally). It
  refuses to run while any venue exists or the module is enabled for any business: export first,
  disable, then delete deliberately under an approved incident plan. Never drop data without an export.
