# Integrations and State

How external systems connect, and how state flows through the app. External
service config lives in `DEPLOYMENT.md`; this page is the "which wire goes where"
map for agents.

## External integrations

| Integration | Inbound / outbound | Verification / security | Failure mode |
|---|---|---|---|
| **Gemini** (`@google/genai`) | Outbound (extraction, digest, chat, product LLM matching) | `GEMINI_API_KEY`; seam `llm-provider.ts`; retry 429/503; 60 s timeout | Extraction fails → item `failed` → dead-letter; digest keeps old week; chat maps 429/503 |
| **Stripe** | Inbound webhook `/api/stripe-webhook`; outbound checkout/portal | `stripe.webhooks.constructEvent` signature; `stripe_webhook_events` dedup; claim-deleted-on-error for 3-day retry | Unknown price → loud log + Sentry + fallback `starter`; degraded state via `safe()` |
| **Resend** | Outbound email (reset, verify, digest, billing/quota) | `RESEND_API_KEY`; unset → no-op log | Emails silently no-op in dev |
| **Meta WhatsApp** | Inbound webhook `/api/whatsapp/webhook` (GET verify, POST HMAC-SHA256 + `timingSafeEqual`); outbound messages/media | `WHATSAPP_APP_SECRET`; `whatsapp_processed_messages` dedup | Unset secret → warn + skip (non-prod); always returns 200 |
| **Sentry** | Outbound (SDK capture) + inbound (REST read-back for `/admin/errors`) | `SENTRY_DSN` (SDK no-ops empty); `SENTRY_AUTH_TOKEN`+`SENTRY_ORG` for REST | Degrades to "not configured" |
| **Upstash Redis** | Outbound rate limiting | `UPSTASH_REDIS_REST_URL/_TOKEN`; unset → in-memory token bucket | Single-instance fallback (documented) |
| **Railway Buckets** | Outbound file storage | `STORAGE_DRIVER=railway`, `AWS_*`; unset → local disk | Worker pulls to temp for non-local drivers |

## State storage by mechanism

- **Database** — everything durable: invoices, batches, notifications, chat,
  subscriptions, WhatsApp bindings, usage, dead letters.
- **Cookies** — `active_restaurant` (httpOnly, sameSite lax, 1 y, re-validated);
  session cookie via Auth.js JWT.
- **localStorage** — `mep-locale` (es/en).
- **IndexedDB** — none for writes at PWA level; the offline-upload queue lives in
  DB-backed sessions, not IndexedDB (verify before assuming; ADR-017 concerns the
  *client* upload queue which is queued in-browser, then replayed).
- **settings table** — feature/tuning state per restaurant: onboarding,
  `weekly_digest_*`, thresholds (`price_alert_threshold`,
  `budget_warning_threshold`), quota overrides (`plan_quota`), `plan_name`.

## Cross-cutting state machines

### Batch item lifecycle (guarded transitions)
```
pending ──markQueued──▶ queued ──markExtracting──▶ extracting
                           │                          │
        markQueued (failed)│            markDone      │   markFailed
                           ▼                          ▼
pending ◀──failed──────────┴──────────▶ done ──markConfirmed──▶ confirmed
any ──markDiscarded──▶ discarded
```
Every transition is `UPDATE ... WHERE status IN (...)` so a web/worker race is a
no-op, not a lost write (`batch-core.ts`).

### Invoice status
```
pending ──acceptInvoice──▶ accepted ──markInvoicePaid──▶ paid
pending ──rejectInvoice──▶ rejected
pending/accepted ──markInvoicePaid──▶ paid
paid ──markInvoiceUnpaid──▶ pending
pending ──export──▶ exported   (CSV/xlsx export marks status)
```
`overdue` is derived/display (see `docs/03_features/invoice_management.md`).

### Subscription status (Stripe-driven)
`trialing` (30 d) → `active` → `past_due`/`paused`/`canceled`. Out-of-order
guard: only apply `subscription.updated/deleted/paused/resumed` when
`lastEventAt <= event.created` (billing.ts).

## Invariants carried by state

- Content hash + partial unique index = invoice dedup last line.
- `processed_requests` claim-once = form idempotency.
- `stripe_webhook_events` / `whatsapp_processed_messages` PKs = integration dedup.
- `mrr_snapshots` upsert keyed `(month, restaurant_id)` = no double-count MRR.

## See also

- Dependency graph: `../00_system/dependency_map.md`
- Env reference: `../../DEPLOYMENT.md`
- Background jobs: `../05_operations/background_jobs.md`
