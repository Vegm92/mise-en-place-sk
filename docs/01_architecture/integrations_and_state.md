# Integrations and State

How external systems connect, and how state flows through the app. External
service config lives in `DEPLOYMENT.md`; this page is the "which wire goes where"
map for agents.

## External integrations

| Integration | Inbound / outbound | Verification / security | Failure mode |
|---|---|---|---|
| **Gemini** (`@google/genai`) | Outbound (extraction, digest, chat, product LLM matching) | `GEMINI_API_KEY`; seam `llm-provider.ts`; retry 429/503; 60 s timeout | Extraction fails → item `failed` → dead-letter; digest keeps old week; chat maps 429/503 |
| **Stripe** | Inbound webhook `/api/stripe-webhook`; outbound checkout/portal | `stripe.webhooks.constructEvent` signature; `idempotency_keys` (`stripe-webhook` scope) dedup; claim-deleted-on-error for 3-day retry | Unknown price → loud log + Sentry + fallback `starter`; degraded state via `safe()` |
| **Resend** | Outbound email (reset, verify, digest, billing/quota) | `RESEND_API_KEY`; unset → no-op log | Emails silently no-op in dev |
| **Meta WhatsApp** | Inbound webhook `/api/whatsapp/webhook` (GET verify, POST HMAC-SHA256 + `timingSafeEqual`); outbound messages/media | `WHATSAPP_APP_SECRET`; `idempotency_keys` (`whatsapp` scope) dedup | Unset secret → warn + skip (non-prod); always returns 200 |
| **Sentry** | Outbound (SDK capture) + inbound (REST read-back for `/admin/errors`) | `SENTRY_DSN` (SDK no-ops empty); `SENTRY_AUTH_TOKEN`+`SENTRY_ORG` for REST | Degrades to "not configured" |
| **Upstash Redis** | Outbound rate limiting | `UPSTASH_REDIS_REST_URL/_TOKEN`; unset → in-memory token bucket | Single-instance fallback (documented) |
| **Railway Buckets** | Outbound file storage | `STORAGE_DRIVER=railway`, `AWS_*`; unset → local disk | Worker pulls to temp for non-local drivers |

## AI usage rationale

Where AI earns its keep and where it does not.

- **Invoice extraction (all types)** — keep AI. Text PDFs still benefit: format-agnostic structuring across arbitrary supplier layouts is genuinely hard without it; vision handles scanned PDFs/images.
- **Chatbot over DB data** — the right use of AI. Natural-language queries over structured invoice/supplier/stock data, grounded in a fixed DB snapshot (ADR-018 — no dynamic SQL).
- **No Cloudflare Workers** — SvelteKit SSR already has DB access and env vars; workers only make sense for static frontends without a server.

## SDK notes

- Use `@google/genai` (new SDK), not `@google/generative-ai` (deprecated).
- `GenerateFn` (`extract.ts`) is the test abstraction — inject a mock `(content) => Promise<string>` via `extractInvoice`'s `generateOverride` instead of an SDK object.
- The response text is `response.text` (a string), not `result.response.text()` (a function call).

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
- `idempotency_keys` claim-once = form idempotency (`form-submit` scope).
- The same table under the `stripe-webhook` / `whatsapp` scopes = integration dedup (#389).
- `mrr_snapshots` upsert keyed `(month, restaurant_id)` = no double-count MRR.

## See also

- Dependency graph: `../00_system/dependency_map.md`
- Env reference: `../../DEPLOYMENT.md`
- Background jobs: `../05_operations/background_jobs.md`

## Code notes

### `src/lib/server/llm-provider.ts`

**`interface LLMUsage`**

- Swappable LLM provider abstraction. Production code uses `createLLMProvider()`; tests inject a mock via extractInvoice's `generateOverride`.

**`const COST_PER_MILLION`**

- Pricing per million tokens (USD) — verify against https://ai.google.dev/gemini-api/docs/pricing.

### `src/lib/server/llm-quota.ts`

**`function currentMonth`**

- Per-tenant LLM cost quota enforcement and usage logging. Quota rows are optional — if no row exists for a tenant it is treated as unlimited. Checks are advisory (best-effort) and never block the extraction path on DB errors.

**`function planQuotaLimit`**

- Reads the tenant's plan invoice quota; null = unlimited. Shared convention lives in billing.getMonthlyQuota (issue #295).

**`function getMonthlyUsage`**

- Documents this tenant put through extraction in the current month, and the only way to ask the question: the sidebar counter, the billing card, the upload pre-check, the 80% warning email and the worker's own gate all read it. Counting saved invoices instead — which three of those four did until [ADR-036](../06_decisions/billing/ADR-036-one-metered-unit.md) — answers a different question: it misses everything extracted and then discarded, and it moves on confirm rather than on the call that costs money.

**`type Tx`, `function lockItem`**

- A transaction-scoped `pg_advisory_xact_lock` on the item id serialises everything that touches one item's balance. Two deliveries of the same job, or a cancel racing the worker, would otherwise both read a balance of 1 and both refund it. Transaction-scoped, so it is released on commit or rollback with no unlock path to forget.

**`function itemBalance`**

- 0 = the item owes nothing, 1 = it is holding a slot. This is what makes claim and release idempotent, rather than a unique `(batch_item_id, kind)` index — an item that failed, was refunded and is then retried (the batch retry action, the admin dead-letter requeue) has to be able to claim a second time, and the index would have handed it a free extraction instead.

**`function moveCounter`**

- Moves `monthly_usage.used`, refusing if `guard` does not hold. The row is seeded at zero first so the guard is evaluated on every path: folding it into an upsert's `setWhere` — the shape this had before ADR-036 — silently skips it for the month's first event, when there is no row to conflict with and a 17-document packet could land straight past the limit.

**`function claimMonthlyExtraction`**

- Claims one slot for one batch item against the tenant's plan quota (issue #244), writing the ledger row and moving the counter in one transaction. An item already holding a slot pays nothing — a redelivered job, or a child a composite reservation paid for up front. Refusal happens before any Gemini spend.
- Counts for unlimited tenants too; it just never refuses them. Returning early on `limit === null` (the shape before ADR-036) left business-tier restaurants with no `monthly_usage` row at all, so every surface that reads the counter showed them a permanent zero.
- drizzle implements `tx.rollback()` by throwing `TransactionRollbackError`; catching it is how the plan limit's refusal is distinguished from a genuine failure.

**`function reserveMonthlyExtractions`**

- Buys `count` slots in one atomic step, for a composite document whose size is known before any of it has been extracted. All or nothing on purpose: letting the children claim one by one is what made a 17-invoice packet extract the first few and then wall. Carries no item id — the children do not exist yet — so it lands as one bulk row.

**`function attributeReservation`**

- Re-keys a bulk reservation onto the children it paid for, so each child's own claim is a no-op and cancelling one refunds exactly one slot. The counter does not move here; the balancing negative row is what keeps `SUM(delta)` equal to the counter at every intermediate point, including when the children are then never extracted.

**`function releaseMonthlyExtraction`**

- Refunds the slot an item is holding, once: on a failed extraction, on a structure stage that decided the file was a container rather than a document, and on a user cancelling an item that never reached the model. Never for an item that was extracted — the money is spent at that point, which is the whole basis for metering on extraction rather than on save. Never drops below zero.

### `src/lib/server/quota-warning.ts`

**`const QUOTA_WARNING_THRESHOLD`**

- "Cuota próxima a agotarse" alert (issue #202): when a restaurant's monthly usage crosses `QUOTA_WARNING_THRESHOLD` of its plan quota, email the owner once per calendar month. Called fire-and-forget after invoice saves — must never throw into the save path.
- Reads `getMonthlyUsage` — documents processed, the meter the plan is actually sold on (ADR-036). It counted saved invoices until then, so it missed every extraction the user discarded and warned late, or never.

**`function maybeSendQuotaWarning`**

- Shared quota convention (issue #295) — null means unlimited, and an unlimited plan can never approach its cap. Claim the month flag BEFORE sending (guarded upsert, issue #249): two concurrent invoice saves at the threshold would otherwise both pass a read-then-send check and email the owner twice.
