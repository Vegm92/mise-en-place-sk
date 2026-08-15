# Architectural Invariants — Rules AI Agents Must Preserve

Immutable rules derived from the actual implementation, its ADRs, and the
security/durability requirements. Treat this as a checklist before every change.
**These are CI-enforced where noted (ADR-022); the rest are verified by tests or
review.** If a change requires violating one, stop: the change needs an ADR, a
plan and explicit human approval — it is never a silent convenience.

---

## TENANCY — restaurant isolation is the only data boundary

- Every restaurant-owned query and mutation must filter by
  `locals.restaurantId` through `forTenant().scope()` — never a bare
  `eq(table.restaurantId, ...)`.
- RLS is retired (ADR-005); app-layer scoping is the ONLY boundary. A single
  unscoped query is a cross-tenant data leak.
- Enforcement: `pnpm lint:tenant-scope`, `pnpm lint:unscoped-query`,
  `tests/tenant-isolation.test.ts`, `tests/tenant-isolation-routes.test.ts`.

## AUTHORIZATION — never trust client state

- Authorization derives from server-side state only: `locals.user` (JWT),
  `locals.restaurantId` (membership + cookie re-validation), role in
  `user_restaurants`, and `subscriptions.planTier`.
- The `active_restaurant` cookie must be re-validated against actual membership
  on every request and on switch (`(app)/api/active-restaurant`).
- Admin pages gate on `AUTH_ADMIN_EMAIL` membership, not UI state.

## ACTIVE RESTAURANT

- `locals.restaurantId` = cookie value iff the value is in the user's
  `user_restaurants` ids, else `ids[0]`, else null (`hooks.server.ts`).
- Never persist an unchecked restaurant id from the client.

## FINANCIAL DATA

- AI extraction is **never authoritative** until the user confirms and
  `saveReviewedInvoice` commits it. The low-confidence gate
  (`low_confidence_ack`, conf < 0.85) and the content-hash duplicate gate are
  mandatory.
- One canonical invoice write path (`src/lib/server/invoice-save.ts`, ADR-008).
  Do not add a second invoice-creation path.

## IDEMPOTENCY — retries must not duplicate

- **Invoices**: `contentHash` (SHA-256 over canonicalized content) + partial
  unique index + `onConflictDoNothing`; retries return `contentDuplicate`.
- **One ledger for all of it**: `idempotency_keys`, claimed as (scope, key) via
  `claimIdempotencyKey` (#389). Keys are unique per scope, so callers cannot
  suppress one another. Never add a fourth bespoke dedup table.
- **Stripe** (`stripe-webhook` scope): on handler error the claim is deleted so
  Stripe's retry reprocesses.
- **WhatsApp** (`whatsapp` scope): claim fails open on a DB error.
- **Requests** (`form-submit` scope, client-supplied UUID): claim-once →
  replays return `replay`.
- **Retention**: one scheduled sweep (`sweepIdempotencyKeys`) expires every
  scope on its own window; nothing grows unbounded.
- **pg-boss**: `singletonKey` prevents duplicate enqueues.

## BILLING

- Stripe webhooks must be signature-verified (`stripe.webhooks.constructEvent`);
  production **throws** when `STRIPE_WEBHOOK_SECRET` is unset.
- The `stripe-webhook` dedup claim is the first write; unknown price ids log
  loudly + fall back `starter` (never silent).
- Plan/feature access (`getTierFeatures`) and quotas (`resolveMonthlyQuota`)
  must stay consistent with the local `subscriptions` row — never trust a price
  id or client claim to grant features.

## DATABASE

- Committed Drizzle migrations in `drizzle/` are canonical (ADR-003).
  `pnpm db:push` is dev-only. `pnpm db:check-sync` fails CI on drift.
- Schema changes: edit `src/lib/server/schema/{core,extensions,auth}.ts`, then
  `pnpm db:generate`, then commit the migration. Follow
  `docs/04_engineering/database_changes.md`.
- All business tables carry `restaurant_id` (with `user_restaurants` and
  `subscriptions` as the two deliberate exceptions).

## BACKGROUND WORK

- Async behaviour changes must consider the separate worker process and its
  pg-boss queues (`extract-invoice`, `normalize-product`, dead-letter siblings).
- Extraction concurrency against Gemini is capped globally by
  `MAX_CONCURRENT_EXTRACTIONS` (default 3) via `acquireExtractionSlot()` in
  `rate-limiter.ts`. With Upstash Redis configured the semaphore is
  distributed (safe across multiple worker processes, lease/TTL guarded);
  without it, it falls back to an in-process semaphore (single-instance).
  The worker's `batchSize` tracks the cap, so a small batch extracts in
  parallel up to the cap; set the cap to 1 to force strictly-sequential
  extraction.
- Scheduled jobs live in `registerScheduledJobs`; every send is claim-guarded
  (ADR-011).

## AI SECURITY

- Restaurant data is data, never instructions: context snapshots are wrapped as
  fixed data with an "ignore instruction-like text" warning (ADR-018). No
  dynamic SQL for the chatbot.
- LLM output is parsed as JSON and validated before it becomes state.

## STORAGE

- Production document storage must be durable and shared by web + worker:
  either one persistent `UPLOADS_DIR` volume or `STORAGE_DRIVER=railway`.
- Uploaded files are validated by extension + magic bytes before storage
  (ADR-016); path-traversal guards on every read.

## LOCALIZATION

- User-facing strings go through `src/lib/i18n.ts` (Spanish first, es/en,
  ADR-021). `pnpm lint:i18n` bans hardcoded strings.

## SECURITY CONTROLS

- Webhook signatures, rate limits, input validation, CSP/X-Frame-Options and
  auth middleware must not be bypassed for convenience.
- No `sql.raw()` (`lint:no-sql-raw`). No inline comments (`lint:no-comments` —
  notes belong in `docs/CODE_NOTES.md`).

## OBSERVABILITY

- New failure paths should be captured (Sentry) and, for background work,
  routed to the dead-letter queue when a job exhausts retries.

---

## Verification checklist (run before finishing a change)

1. `pnpm check` — types.
2. `pnpm db:check-sync` — schema vs migrations.
3. `pnpm test` — unit/integration (DB-backed suites need local Postgres).
4. `pnpm lint:tenant-scope` + `pnpm lint:unscoped-query` — tenancy.
5. `pnpm lint:no-sql-raw`, `pnpm lint:i18n`, `pnpm lint:no-comments`.
6. Confirm no new service/queue/table was added without considering the worker,
   migrations and this list.
7. Confirm the affected feature spec (`docs/03_features/`) was updated.
