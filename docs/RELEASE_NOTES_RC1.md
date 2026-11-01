# Formangle — Release Candidate 1.0

Branch `rc-v1`, built on `main` @ `f69e11c`. Local demo; no backend, no paid services.

## New

### Formangle Actions (schema v7)
Structured, documented requests from the business to the customer, attached to a request:

| Type | Customer sees | Responses |
|------|---------------|-----------|
| בקשת אישור | details, optional amount | exactly two (default "מאשר" / "לא מאשר", editable) |
| בחירה בין שתי אפשרויות | details, optional amount | exactly two owner-written options |
| עדכון ללקוח | information only | none |

- Owner: "פעולה חדשה ללקוח" on the request page, live preview in the business's design,
  optional amount, note and answer window (24 h / 3 days / week).
- Immutable once created. The owner may cancel an open action; an answered one never changes.
  New terms mean a new action, so each answer keeps exactly what the customer saw
  (title, amount, both option labels, workflow version).
- Customer: open actions appear first on the personal request page; approving an amount asks
  for a second confirmation; one answer per action; duplicates are refused.
- Lifecycle: `pending → responded | cancelled | expired` (expiry is derived from time),
  updates are `posted`.
- Timeline entries tagged "ללקוח" / "החלטת לקוח" / "בוטל", apart from internal notes.
- Inbox badges and filters ("ממתין להחלטת לקוח", "הלקוח השיב"); dashboard card
  "החלטות לקוחות"; "צפייה כלקוח" with a strip back to the request.
- Demo workspaces gain sample open and answered actions (fresh seed and v6 → v7 migration).

### Publishing and sharing
- "התהליך פורסם בהצלחה": workflow, version, publish time, link, copy, open, WhatsApp share
  (`wa.me` click-to-chat link, no Business API), QR code (generated locally; PNG for print,
  SVG for design; decoding verified in tests), website snippets (link button, iframe), back to editor.
- Honest reach note: seeded demo flows open on any device; workflows published only in this
  browser do not (and a republished demo shows the original version elsewhere).

### External payment link
- Shown right after sending (default, as before) or only after the business approves.
- Customer-side preview in the editor, hostname shown, "fixed page, not a per-customer
  payment request" explanation. Status reads "shown · not verified"; opening the link never
  marks anything as paid.

### Deployment readiness
- Static entries for marketing pages and public demo flows (200 instead of the 404 fallback).
- `VITE_SITE_URL` for og:image / og:url (future custom domain); canonical + robots per route.
- Content-Security-Policy (self only) and referrer policy in the built HTML.
- `/privacy`: privacy and demo terms, company details marked as pending verification.

## Fixes
- Demo reset dialog and demo page named the wrong number of demo workspaces.

## Compatibility
- Schema v6 → v7 adds `actions` (empty for real workspaces). Runs, answers, versions and
  designs are untouched. Published versions stay byte-identical.
- `RunEvent.actionId` and the three `action_*` event types are additive.
- `completion.externalTiming` is optional; absent keeps the original behaviour.
- New dependencies: `qrcode-generator@2.0.4` (MIT, zero deps). Dev only: `jsqr@1.4.0`.

## Not in this release (needs a backend)
See `docs/ARCHITECTURE_BACKEND.md`.
