# ADR-030 — Database-Enforced Tenant Isolation: `mep_runtime` + ENABLE ROW LEVEL SECURITY

**Status:** Active
**Feature:** Tenancy
**Date:** 2026-08-28
**Issue:** [#222](https://github.com/Vegm92/mise-en-place-sk/issues/222)

## Context

ADR-001 made `forTenant(restaurantId).scope()` the tenant boundary and named the reason: the app
connects to Postgres as the table-owning role, and **table owners bypass RLS**, so a real database
backstop needs a non-owner role first. ADR-005 then dropped the dead `auth.uid()` policies from the
Supabase era rather than port them, and named the reopened path explicitly: a non-owner role, `FORCE
ROW LEVEL SECURITY`, and policies keyed on a session variable. #464 built the first half — a scoped
`mep_runtime` role (`scripts/create-runtime-role.sql`) with SELECT/INSERT/UPDATE/DELETE on `public`
and no DDL rights — but production has **not yet cut `DATABASE_URL` over to it**; today it still
connects as the owner in every environment. This ADR is the second half: the policies themselves, and
the per-request mechanism that sets the session variable they check.

The two questions ADR-005 left open were ENABLE vs. FORCE, and how a pooled connection carries a
per-request tenant value without one tenant's setting leaking onto another tenant's query.

## Decision

### 1. Policies, not another lint

Every table in `src/lib/server/tenant-data-map.ts` (the #390 authoritative tenant-table list) gets
`ALTER TABLE … ENABLE ROW LEVEL SECURITY` plus one `USING`/`WITH CHECK` policy
(`drizzle/0055_rls_tenant_isolation.sql`), written fresh against `current_setting('app.restaurant_id',
true)` — never ported from the retired `auth.uid()` versions, per ADR-005's own instruction:

```sql
USING (
	restaurant_id::text = current_setting('app.restaurant_id', true)
	OR current_setting('app.admin', true) = 'true'
)
```

`restaurants` is the one root table in the map: its own `id` plays the role every other table's
`restaurant_id` plays elsewhere, and — because Postgres evaluates the *same* USING/WITH CHECK pair for
every command under a policy with no `FOR` clause — its WITH CHECK mirrors USING rather than being
left `true`. An unconditional `WITH CHECK (true)` looks like it would make "create a new tenant" free
of any GUC, but it does not: `INSERT … RETURNING` (what every Drizzle `.insert().returning()` call
does) still needs the freshly-inserted row to pass the *USING* clause to be handed back, so a bare
insert with no context would succeed and then fail confusingly on the read-back. Every real
restaurant-creation path in this codebase (onboarding, add-location, the admin seed) already runs
under `app.admin`, so making WITH CHECK match USING costs nothing and removes that trap.

Tables **not** in the map (`user_restaurants`, `users`, `waitlist`, `upload_sessions`, `app_flags`,
pg-boss's own `pgboss` schema, …) get no policy at all — RLS was never enabled on them, so they are
exactly as reachable as before. This is deliberate: bolting a permissive fallback onto tenant tables
for the sake of one non-tenant read would be the "setting-absent lets it through" failure mode this
ADR exists to avoid.

### 2. ENABLE, not FORCE

`FORCE ROW LEVEL SECURITY` additionally binds the table-owning role, so the policies would apply even
to `DATABASE_MIGRATION_URL`, every local dev database, CI, and — critically — **production's current
`DATABASE_URL`**, which is still the owner role until the #464 cutover ships. FORCE would have turned
this migration into an outage the moment it ran: every query in production returning zero rows,
because nothing sets `app.restaurant_id` on the owner connection and nothing needs to, since the owner
was never the audience.

ENABLE is the only choice compatible with the **safe rollout invariant**: behaviour under the owner
role must be byte-identical before and after this migration; enforcement activates only for
connections using the scoped role, which is currently zero production connections. What FORCE would
additionally buy, once #464's cutover lands and the owner role is retired from `DATABASE_URL` for
good: a second backstop against a *future* role that gets granted table ownership by mistake, or a
migration script run with the wrong role. What it costs today: it could not be turned on without
coordinating with the #464 cutover in the same breath, and there is no such coordination point yet —
Victor's pending step is unscheduled. Revisit FORCE once the owner role is fully out of the production
connection string; tracked as follow-up, not blocking.

### 3. Context mechanism: a reserved connection per request/job, not `SET LOCAL` at every call site

The app's query layer is `import { db } from '$lib/server/db'` used directly from hundreds of call
sites across routes, `$lib/server`, and the worker — none of them open an explicit transaction. Wrapping
every one of those in a transaction to get `SET LOCAL` (option a in the issue) would touch the entire
codebase and hold a database connection open across slow non-DB work (Gemini calls, Stripe calls,
outbound email) for the rest of the request — worse for the pool than what this ADR chose, not
better.

Instead, `src/lib/server/tenant-context.ts` uses `AsyncLocalStorage` plus `postgres.js`'s
`sql.reserve()`: a request (or one worker job) reserves one physical connection for its duration,
issues `SELECT set_config('app.restaurant_id', $1, false)` on it (a session-level GUC — parameterized
through `set_config()`, not string-interpolated `SET`, so there is no injection surface), builds a
`drizzle()` instance bound to that one reserved connection, and stores it in `AsyncLocalStorage`. The
`db` export in `db.ts` is a `Proxy` that resolves to the active context's instance when one exists,
falling back to the ordinary pooled client otherwise — so every existing call site needs no change,
and code that never runs inside a wrapped context (most unit tests, calling a server function
directly) is completely unaffected, satisfying the byte-identical-under-owner requirement by
construction rather than by auditing every test.

**Pool contamination — the specific risk named in the issue — is closed on both ends**: the GUC is set
fresh on every reservation regardless of what a prior tenant may have left behind, and it is
unconditionally cleared (`set_config('app.restaurant_id', '', false)` and the `app.admin` GUC
alongside it) in a `finally` block before the connection is released back to the pool, even if the
wrapped work threw. `tests/rls-runtime-role.test.ts`'s "tenant-context mechanism" suite proves the
clear-before-release step directly, not just the policy's behaviour.

`sql.reserve()`'s returned connection does not carry postgres.js's internal `.options` the way the
pool's own client does (a `drizzle-orm/postgres-js` implementation detail: it patches
`client.options.parsers`/`.serializers` for a handful of types on construction), so
`tenant-context.ts` copies the pool's `options` reference onto the reserved connection before handing
it to `drizzle()`. This is a reference copy of the *same* options object every physical connection in
the pool already uses, not a new configuration — harmless, and necessary for `drizzle()` to construct
at all against a reserved connection.

### 4. Admin/system paths: `app.admin`, set only at named call sites

A tenant table queried with `app.restaurant_id` absent and `app.admin` absent returns zero rows. That
is correct for the overwhelming majority of code — it is the intended backstop against a forgotten
`forTenant()` — but a real, enumerated set of code paths are *legitimately* cross-tenant and would
otherwise break the moment the runtime role goes live:

| Path | Why it needs `app.admin` |
|---|---|
| `hooks.server.ts` — any request under `/admin/**` (already gated to admins by the existing `isAdminUser` check) or the two signature-verified webhook routes (`/api/stripe-webhook`, `/api/whatsapp/webhook`) | Admin pages aggregate across every tenant by design; a webhook resolves its own tenant from a trusted payload before any session-based tenant context exists |
| `src/lib/server/locations.ts` — `memberLocations()`, `isLocationLocked()` | Resolving *which* restaurant(s) a user belongs to, and ranking a location among its siblings, are inherently pre-tenant / cross-row-of-the-same-family operations |
| `src/lib/server/tenant-fanout.ts` — `tenantPage()` (the ADR-025 dispatcher's scan) | The dispatcher must see every tenant to page through them |
| `src/lib/server/alerts.ts` — the `JOBS` array's cron handlers (digest/reminder/trial dispatch, MRR snapshot, dead-letter purge, analytics refresh, idempotency sweep, orphan-subscription reconciliation) | Every one of these is a scheduled, cross-tenant system job, not work on behalf of one ambient tenant |
| `src/lib/server/billing.ts` — `countGroupLocations()`, `ownedActiveSubscriptions()`, `notifyDuplicateSubscriptionCanceled()` | Multi-location billing families and "every restaurant this user owns" necessarily span more than one tenant row |
| `src/lib/server/integrations/whatsapp/message-handler.ts` — `resolveRestaurantId()`, the pairing-code restaurant-name lookup | Resolving a tenant from a phone number is the WhatsApp equivalent of session-based login; there is no tenant context to scope by yet |
| `src/lib/server/auth-seed.ts` — `seedAdminUser()` | Runs at process startup, outside any request |
| `src/lib/server/dead-letter.ts` — `recordDeadLetter()` (always; unconditionally) | An audit trail, not tenant data — `restaurant_id` is nullable here and the write must never fail because RLS could not resolve a tenant for a failed job |
| Onboarding's and add-location's `db.transaction()` blocks (`src/routes/onboarding/+page.server.ts`, `src/routes/(app)/settings/+page.server.ts`) | Creating a brand-new tenant's rows (a `subscriptions` row for a restaurant that doesn't exist in the request's ambient context yet; a sibling-location count across a billing family) — these use `SET LOCAL app.admin = 'true'` as the transaction's first statement rather than `runAsSystem()`, since the transaction already owns a connection and `SET LOCAL` auto-reverts at commit/rollback with no separate reservation needed |
| `src/routes/s/[token]/+page.server.ts` and `.../og.png/+server.ts` — the `resolveShareToken()`/`buildPublicDigestPayload()` calls (#329) | Same trust shape as the signature-verified webhooks above: the caller is anonymous by design (a public share link), and the token *is* the authorization boundary rather than a session — there is no `locals.restaurantId` to fall back to. Wrapped inside the route load, next to the token check, rather than as a `hooks.server.ts` path-prefix entry, since `/s/[token]` is a dynamic path a `Set.has(path)` check can't match anyway, and it keeps the audited site next to the thing that authorizes it. Missed in the first pass — caught by orchestrator review, not by the initial audit — see `tests/rls-runtime-role.test.ts`'s "digest share (#329)" suite, which pins that the wrap is load-bearing (without it, an anonymous visitor's own valid share link would 404 under the runtime role) |
| `src/routes/api/health/+server.ts` — `computeHealthDetail()`'s `batch_items` queue-depth probe | Reachable two ways with no tenant context: an admin session (already covered by the `/admin/**` blanket wrap for *pages*, but `/api/health` itself is not under `/admin/`) or an anonymous caller carrying a valid `HEALTH_CHECK_TOKEN` header (external uptime monitoring) — the query already carried a pre-existing `tenant-scope-ok` comment acknowledging it was deliberately cross-tenant, which was true before this ADR and remained true after; it needed the runtime mechanism, not just the lint exemption |

Every other cross-tenant-looking read that was **not** added to this list was checked and found to
already run inside the correctly-scoped ambient tenant context (e.g. `billing/+page.server.ts`'s own
`restaurants` lookup by `locals.restaurantId`) — `app.admin` was added only where a concrete, traced
call site demonstrably needed it, not defensively.

`runAsSystem()` never becomes the *default* for an unrecognized path — a request with no resolved
tenant and no admin/webhook match runs with no context at all, and a tenant-table query there
correctly returns nothing.

### 5. pg-boss / worker

`dead-letter.ts`'s `runWithDeadLetter()` — the wrapper already used by every `boss.work()` handler that
carries a `restaurantId` in its job data (extraction, normalize, categorize, WhatsApp notify, account
cleanup) — now wraps the handler call in `runWithTenantContext(ref.restaurantId, run)`, so all of them
picked up correct per-job tenant context from one change. `tenant-fanout.ts`'s `settleTenantJob()`
(the ADR-025 per-tenant handler for weekly digest, overdue reminders, trial notices) does the same
around `handler.run(job.data)`. pg-boss's own `pgboss` schema is untouched by this migration — #464
already gave `mep_runtime` ownership of it, and ownership bypasses RLS the same way it does for the
migration role on `public`.

### 6. Swept every no-session route for the same failure mode

`hooks.server.ts`'s `isPublicPath()` is the full list of routes reachable without a session; each was
checked against `tenant-data-map.ts`'s table list. `/login`, `/signup`, `/forgot-password`,
`/reset-password`, `/verify-email`, `/auth/**` touch only `users`/`accounts`/`sessions`/
`verification_tokens` — none carry a policy. `/waitlist` and `/l/[variant]` touch `waitlist` and
`funnel_events` (via `trackAnonymousEvent`) — `funnel_events` has no `restaurantId` column and was
never in the map. `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml` touch no table. `/s/[token]`
and `/api/health` did carry the gap fixed in section 4's table above; nothing else in this list does.

## Consequences

- **Inert until #464's production cutover.** Every environment today (local dev, CI, production)
  connects as the owner role, which ENABLE (not FORCE) never restricts. This migration is safe to ship
  ahead of that cutover — DEPLOYMENT.md now says explicitly that the cutover activates both things at
  once, and how to verify and roll back.
- **One connection held for the request/job's duration, not per query.** Before this change, each
  `db` call grabbed and released a pool connection independently; a request holding a reserved
  connection for its whole `resolve(event)` (when it has a tenant, is on an admin path, or is a
  system-integration webhook) is a stricter, more conservative use of `DB_POOL_MAX` than before.
  Watch pool saturation after the #464 cutover and raise `DB_POOL_MAX` if needed — this is the
  documented cost of correctness under pooling (option b in the issue) over the alternative of
  wrapping every call site in an explicit transaction (option a), which was rejected for holding a
  connection across slow non-DB work.
- **`restaurants`' cross-tenant reads are enumerated, not general.** The table list above is the
  actual audit of every `.from(restaurants)`/`.from(userRestaurants)…innerJoin(restaurants…)` call
  site in the codebase at the time of writing; a new one added later needs the same audit, not a
  broader policy. `pnpm lint:unscoped-query` still catches an unscoped query against every *other*
  tenant table (`restaurants` has no `restaurantId` column so it was never in that lint's tenant-table
  set; `subscriptions`/`user_restaurants` are excluded explicitly via `NON_TENANT_TABLES` in
  `scripts/lint-invariants.mjs` — both predate this ADR); it cannot see a missing
  `app.admin`/`app.restaurant_id` at the RLS layer, and does not try to.
- **Held in place by `tests/rls-runtime-role.test.ts`** — the runtime-role backstop suite (unscoped
  query sees only the active tenant, a cross-tenant write is rejected, `app.admin` bypasses, the owner
  role is unaffected) and the tenant-context mechanism suite (GUC set/reset/no-leak-across-sequential-
  or-nested-uses). Gated the same way every other DB-backed suite is: skipped without a local/opted-in
  `DATABASE_TEST_URL`, a hard failure under `REQUIRE_DB_TESTS=1`. `pnpm test`'s existing 3139 tests are
  unchanged and pass unmodified against the owner role; several mocks of `$lib/server/db` needed
  `runAsSystem`/`runWithTenantContext` passthroughs added (`(fn) => fn()`) since the module they mock
  now exports them — a mechanical fix with no behavioural content, listed in the PR diff.
- **`FORCE ROW LEVEL SECURITY` is not adopted.** Revisit once #464's production cutover is complete and
  the owner role is no longer in any production connection string — at that point FORCE costs nothing
  additional (nothing depends on owner-role bypass anymore) and buys a second backstop against a future
  ownership mistake.

## Related

- [ADR-001](./ADR-001-app-level-tenant-scoping.md) — the app-layer boundary this backstops, not replaces
- [ADR-005](./ADR-005-rls-retired.md) — why the old policies were dropped, and the reopened path this ADR takes
- [ADR-025](../insights/ADR-025-scheduled-jobs-fan-out-per-tenant.md) — the per-tenant dispatcher this ADR wires tenant context into
- `docs/05_operations/ORCHESTRATOR_BACKLOG.md` and `DEPLOYMENT.md` — the #464 role-split runbook this ADR's rollout is coupled to
