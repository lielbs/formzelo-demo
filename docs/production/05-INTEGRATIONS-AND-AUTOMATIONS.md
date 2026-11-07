# Integrations and Automations

## Principles

- Organization configuration selects adapters; workflow configuration may override it.
- Credentials and provider calls stay server-side.
- Domain transactions never wait for optional communications/CRM delivery.
- External delivery is at least once; idempotency prevents duplicate business effects.
- Provider-specific concepts are normalized at the boundary, while raw IDs remain available for support.
- No adapter is considered connected until credentials, webhook ownership, and a connection test succeed.

No real provider integration is implemented or activated by this plan.

## Adapter contracts

Use narrow capability interfaces rather than one universal provider object.

```ts
interface PaymentAdapter {
  createCheckout(input: CheckoutInput, ctx: AdapterContext): Promise<CheckoutSession>;
  verifyWebhook(rawBody: Uint8Array, headers: Headers, ctx: AdapterContext): Promise<PaymentWebhook>;
  queryPayment?(providerPaymentId: string, ctx: AdapterContext): Promise<PaymentState>;
  refund?(input: RefundInput, ctx: AdapterContext): Promise<RefundResult>;
}

interface MessageAdapter {
  send(input: MessageInput, ctx: AdapterContext): Promise<DeliveryReceipt>;
}

interface CrmAdapter {
  upsertContact(input: ContactInput, ctx: AdapterContext): Promise<ExternalReference>;
  upsertActivity(input: ActivityInput, ctx: AdapterContext): Promise<ExternalReference>;
}

interface CalendarAdapter {
  reserve(input: ReservationInput, ctx: AdapterContext): Promise<ExternalReservation>;
  cancel(input: CancellationInput, ctx: AdapterContext): Promise<void>;
}
```

`AdapterContext` includes organization, connection ID/version, correlation ID, deterministic idempotency key, deadline, logger with redaction, and a credential accessor. It never exposes credentials to shared application logs or return values.

## Provider selection

Resolution order:

1. workflow capability override;
2. organization default for that capability;
3. platform-safe fallback (usually `disabled`, never a real provider chosen silently).

Store connection ID, not a provider secret, in workflow settings. A published workflow freezes behavioral settings such as payment timing and selected capability; credential rotation stays on the connection so a republish is not required.

Initial payment adapters may target PayPlus and Cardcom after contract/API documentation and sandbox access are supplied. Additional Israeli providers implement the same interface. Provider capability differences—hosted checkout, invoices, tokenization, Bit, refunds—must be feature-detected, not assumed.

## Credential lifecycle

1. Organization admin submits credentials to a privileged endpoint over TLS.
2. Endpoint validates format, encrypts them with envelope encryption or stores them in the approved secret store, and returns only a masked descriptor.
3. Connection test runs with a bounded timeout and a non-financial read/test operation where the provider supports it.
4. Secret versions support rotation: add new version, test, atomically activate, retain old version briefly for rollback, then revoke/delete.
5. Reads/decryptions are restricted to assigned worker/connection execution and audit metadata; plaintext is never returned to the browser.
6. Compromise response rotates provider credential, encryption key version as required, webhook secret, and invalidates cached connection state.

Platform-wide encryption master keys belong in server environment secrets. Per-organization credentials belong in encrypted records or a secret manager, not one environment variable per customer.

## Payments

### Checkout

- Server recomputes amount from the frozen workflow version/submission.
- Create payment intent with deterministic idempotency key before calling provider.
- Provider-hosted checkout only; Formangle never receives card details.
- Bind success/cancel URLs to opaque intent state; browser redirects are not payment proof.

### Webhook

1. Read raw body before parsing.
2. Resolve connection without trusting arbitrary tenant input.
3. Verify signature/timestamp using the provider's documented algorithm.
4. Deduplicate provider event ID.
5. Match provider transaction, amount, currency, organization, and expected state.
6. Transactionally append payment event, transition intent/submission when valid, and write outbox event.
7. Return provider-required success promptly; process optional follow-ups asynchronously.

Unknown, mismatched, replayed, or invalid-signature events are recorded with redacted diagnostics and never mark a payment paid.

## Messaging

- Separate owner and customer templates; version them and render from an allowlisted variable set.
- Explicit channel consent/preferences and quiet hours per organization where required.
- Normalize phone numbers/email server-side.
- Store provider message ID, accepted/delivered/failed status, attempt, and reason category.
- Official WhatsApp Business integrations only; do not automate consumer WhatsApp sessions.
- Suppression lists and unsubscribe/transactional classification must be decided before marketing messages.

## CRM, calendar, webhooks, and custom APIs

- CRM writes use stable external-reference mapping and idempotent upsert where supported.
- Calendar reservation is a projection of the authoritative Formangle booking; reconcile divergence and never silently overwrite manual provider changes.
- Outbound webhooks sign timestamp plus raw body, include event ID/version, retry only retryable outcomes, and allow secret rotation.
- Inbound custom APIs use per-connection credentials, strict schemas, body limits, rate limits, replay protection, and tenant mapping.
- Custom endpoints are allowlisted HTTPS origins; block localhost, private/link-local IP ranges, redirects to disallowed destinations, credentials in URLs, and DNS rebinding where outbound HTTP is permitted.

## Automation model

### Trigger

Initial trigger catalog:

- `workflow.submitted`
- `request.approved`
- `request.rejected`
- `customer_action.responded`
- `payment.confirmed`
- `payment.failed`
- `booking.confirmed`
- `booking.cancelled`
- `follow_up.due`

Each event has an immutable ID, organization, aggregate ID/version, occurred time, schema version, and safe payload. Consumers must tolerate additive fields and reject unsupported versions explicitly.

### Conditions

Closed declarative grammar only:

- equality/inequality and membership;
- numeric/date comparison;
- presence/absence;
- workflow/status/action result;
- AND/OR with depth and node limits.

No `eval`, arbitrary SQL, template code, or customer-provided regular expressions. Evaluate against an allowlisted event/submission projection.

### Actions

- send email/SMS/official WhatsApp;
- create hosted checkout or request payment;
- CRM contact/activity upsert;
- calendar create/update/cancel;
- signed outbound webhook;
- create internal task/status update;
- schedule follow-up.

Sensitive actions declare required role/plan, max attempts, timeout class, and side-effect idempotency behavior.

## Queue and execution lifecycle

```text
domain transaction
  -> outbox event
  -> queue publication
  -> rule match and job creation
  -> leased execution
  -> action attempts
  -> success | retry_wait | dead_letter | cancelled
```

- Claim jobs with visibility timeout/lease so crashed workers can retry.
- Default retry suggestion: immediate first attempt, then jittered exponential delays such as 1m, 5m, 30m, 2h, 12h, capped by provider/event value. Provider guidance overrides.
- HTTP 429/5xx/network timeouts are usually retryable; schema/auth/invalid-recipient errors are usually terminal until configuration changes.
- Honor `Retry-After` within a maximum bound.
- Each action effect uses `organization + job + action` idempotency key and stores provider request/result ID.
- Dead-letter records retain safe diagnostics and permit an audited manual retry after configuration repair.
- Bound rule depth, actions/event, recursive event generation, concurrent jobs/organization, payload size, runtime, attempts, and monthly usage/cost.

Supabase Queues/PGMQ and Cron are reasonable managed primitives for V1 ([Queues](https://supabase.com/docs/guides/queues), [Cron](https://supabase.com/docs/guides/cron)). Keep the job model portable so a dedicated worker/queue can replace them if provider latency or volume outgrows database workers.

## Observability

Metrics by organization/provider/action without high-cardinality raw customer fields:

- queue depth and oldest age;
- attempts, success/failure/retry/dead-letter counts;
- delivery latency percentiles;
- provider 429/5xx/auth failures;
- webhook invalid signatures and replay counts;
- circuit-breaker state;
- estimated billable messages/payment calls and entitlement usage.

Trace with event ID, job ID, connection ID, provider request ID, and correlation ID. Redact bodies, tokens, contacts, credentials, and payment details.

## Connection administration

RockStack admin console should support:

- create/edit safe provider config;
- submit/rotate credentials without readback;
- test connection and view masked result;
- enable/disable and choose defaults/overrides;
- inspect health, recent deliveries, and dead letters;
- manual replay with confirmation and audit;
- revoke connection and identify affected workflows/rules.

## Acceptance criteria

- No credential appears in client network responses, bundles, database public schemas, exports, or logs.
- Every provider call has timeout, rate limit, idempotency, redaction, result normalization, and audit context.
- Submission acceptance succeeds even when optional providers are down.
- Duplicate events/webhooks do not duplicate payment, message, CRM, or calendar effects.
- Dead letters are visible and safely retryable.
- No fictional adapter reports connected or live without real sandbox verification and explicit authorization.
