# Test data — Impact Networks, one month of bookings

Requested by the founder on 2026-11-12 to exercise Formangle Tables with a realistic month.
Written to **production** (project `ppgdbqhwbzlgzwsjmkor`), test business `impact-networks` only,
venue **Impact Networks** (`/t/impact-networks`, id `10ca7b45-69b7-4a28-a434-05cc19eb7149`).
No other business or venue was touched. No message is sent to guests (Formangle sends none).

## What was created

| | |
| --- | --- |
| Bookings | 423 (1,320 covers), service dates 2026-11-13 → 2026-12-12 |
| Sources | 180 through the public booking function (as from the website), 243 as phone bookings by the owner |
| Guests | 416 fictional guests; ~15% with a request (birthday, high chair, allergy…) |
| Marker | guest phone in the fictional range **050-000-xxxx** (`+97250000…`) and `created_at = 2026-11-12 21:24:39.881448+00` (one transaction) |

Every booking went through the normal server functions (`tables_public_book`,
`tables_staff_create_reservation`), so tables, the 15-minute turnover buffer, lead time and the
30-day horizon were enforced; attempts that did not fit were refused, which is what makes some
evenings full.

Demand model (attempts per service before the server's refusals): dinners Sun 12, Mon 10, Tue 12,
Wed 15, Thu 30, Fri 26, Sat 28; lunches Sun–Thu 7–10; scaled by how far ahead the date is
(×1.0 first week, ×0.8, ×0.55, ×0.38 last 10 days) with ±25% noise; Hanukkah evenings
(4–12 Dec) ×1.3; Tuesday 24 Nov taken by a large group. Party sizes 1–6 (no table seats more).
Peak times weighted to 19:30–20:30 (dinner) and 12:30–13:30 (lunch). Seeded (`setseed(0.42)`).

## What it looks like (dinner availability right after the fill)

- Full or nearly full at peak hours, only early/late tables left: Fri 13, Sat 14, Wed 18, Thu 19,
  Fri 20, Sat 21, Tue 24 (group), Thu 26, Fri 27, Sat 28, Fri 4 Dec, Thu 10, Fri 11.
- No table for 6 at all: Sat 14, Fri 20, Tue 24, Thu 10 Dec.
- Wide open: most Sun–Wed evenings from the second week, e.g. Mon 23, Wed 25, Sun 29, Mon 30.

## Cleanup (needs the founder's go-ahead)

Cancels every booking from this fill through the normal transition (keeps the audit trail and frees
the tables). Run as SQL on the project; it acts as the venue owner.

```sql
do $$
declare r record; n int := 0;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '093137dc-69ad-4daf-8046-de74b2666d4c', 'role', 'authenticated')::text, true);
  for r in select id, lock_version from public.tables_reservations
    where venue_id = '10ca7b45-69b7-4a28-a434-05cc19eb7149' and guest_phone like '+97250000%'
      and created_at = timestamptz '2026-11-12 21:24:39.881448+00'
      and status in ('pending_approval', 'confirmed', 'arrived', 'seated')
  loop
    perform public.tables_transition(r.id, 'cancel', r.lock_version, 'test data cleanup');
    n := n + 1;
  end loop;
  raise notice 'cancelled %', n;
end $$;
```

Nothing is deleted. Removing the rows themselves would be a separate, destructive step.
