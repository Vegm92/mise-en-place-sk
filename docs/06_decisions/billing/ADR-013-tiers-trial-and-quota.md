# ADR-013 — Stripe Owns Money, Postgres Owns Entitlement

**Status:** Active
**Feature:** Billing
**Date:** 2026-08-09

## Context

Every extraction costs real money at Gemini, so entitlement has to be checked on
a hot path — inside the extraction worker, per invoice, per tenant. Stripe holds
the truth about whether a subscription is paid, but that truth is unusable at
that point: an API call to Stripe per extraction would add latency, a rate-limit
surface, and a hard dependency on Stripe being up for the app to process
invoices at all.

Webhooks are the standard answer, and they bring the standard problems: they
arrive more than once, they arrive out of order, and they arrive from anyone who
can find the endpoint URL.

## Decision

**Stripe is the source of truth for payment; the `subscriptions` table is the
source of truth for entitlement.** Webhooks move state from the first to the
second. Nothing on a request or worker path calls the Stripe API to decide
whether a tenant may do something.

### Four tiers, declared once

`TIERS` is a single const map — quota, Stripe price id, location cap, and six
feature booleans per tier:

| Tier | Monthly invoices | Locations | Digest | Stock | Scores | Multi-site | AI chat |
|---|---|---|---|---|---|---|---|
| `trial` | 20 | 1 | — | — | — | — | — |
| `starter` | 100 | 1 | — | — | — | — | — |
| `pro` | 300 | 1 | ✓ | ✓ | ✓ | — | ✓ |
| `business` | unlimited (`null`) | 5 | ✓ | ✓ | ✓ | ✓ | ✓ |

`null` means unlimited, everywhere — in `TIERS`, in `getMonthlyQuota`, and in
`claimMonthlyExtraction`, which skips the claim entirely on `null`. There is no
sentinel large number in the live path. (`resolveMonthlyQuota` still maps a
legacy stored `99999` to `null` for tenants provisioned before that convention.)

Price ids come from the environment, so tiers whose id is unset are simply not
purchasable (`isTierAvailable`). A price id that matches no tier logs loudly and
falls back to `starter` — the safe direction when the alternative is denying
service to someone who has paid.

### Three webhook defences, in order

1. **Signature.** `stripe.webhooks.constructEvent` verifies against
   `STRIPE_WEBHOOK_SECRET`. In production a missing secret **throws** rather than
   skipping verification; in development it warns and returns without processing.
   There is no configuration in which an unverified webhook mutates state in
   production.
2. **Replay.** Each `event.id` is claimed with `ON CONFLICT DO NOTHING` — in
   `stripe_webhook_events` when this ADR was written, in the shared
   `idempotency_keys` ledger under the `stripe-webhook` scope since #389. A duplicate delivery
   claims nothing and returns. If handling then throws, the claim is **deleted**
   before rethrowing — so Stripe's retry can be processed rather than being
   permanently suppressed by a failed first attempt.
3. **Ordering.** Every subscription update carries
   `WHERE last_event_at IS NULL OR last_event_at <= :eventCreatedAt`. Stripe does
   not guarantee delivery order; without this, a stale `customer.subscription.updated`
   arriving after a cancellation would resurrect the subscription. The database
   refuses to move state backwards in time.

### Entitlement is read at three checkpoints

- `getAccessState` — is the subscription usable at all? Active, or trialing with
  an unexpired `trial_ends_at`. It distinguishes *trial expired* from *inactive
  subscription* so the UI can offer the right next step.
- `getMonthlyQuota` → `claimMonthlyExtraction` — the atomic per-extraction claim
  described in [ADR-007](../extraction/ADR-007-llm-provider-seam.md).
- `getTierFeatures` — per-feature gates (chat checks `aiAssistant`; the digest job
  checks `weeklyDigest`).

**A tenant with no `subscriptions` row is allowed.** `getAccessState` returns
`{ allowed: true, status: 'trialing' }` for a missing row. New restaurants work
before they have ever touched Stripe, and a billing-table outage does not lock
existing users out of their own invoices. The 30-day trial clock starts when the
Stripe customer is created (`getOrCreateCustomer`), not at signup.

### Multi-location billing rolls up to the parent

`billingRestaurantId()` resolves a restaurant to its `parent_id` when it has one,
and every billing read goes through it. A `business` group's five locations share
one subscription, one quota pool, and one feature set. Locations are billing
children, not billing peers.

### Customer creation is locked, twice

`getOrCreateCustomer` takes a `pg_advisory_xact_lock` on the restaurant id *and*
passes Stripe an `idempotencyKey` of `cust:<restaurantId>`. The advisory lock
serialises concurrent requests within this app; the idempotency key protects
against duplicates Stripe would otherwise create if the lock were ever bypassed
(a second instance, a manual script). Two defences because a duplicate Stripe
customer is expensive to unpick by hand.

## Consequences

- **Entitlement can lag reality by one webhook.** A payment that succeeds while
  webhook delivery is delayed leaves the tenant briefly on their old tier. The
  alternative — synchronous Stripe reads on the hot path — was judged worse.
- **A failed extraction refunds its quota slot** (`releaseMonthlyExtraction`), so
  provider outages do not consume a tenant's month.
- **Per-tenant overrides live in `settings.plan_quota`** and take precedence over
  the tier default, with `'unlimited'` as an explicit value. Support can grant an
  exception without a schema change or a new tier.
- **Prices are configurable but have code defaults.** `planMonthlyPriceCents`
  prefers `PLAN_PRICE_<TIER>_EUR` and falls back to `PROVISIONAL_PRICE`, so the
  pricing page renders correctly in an environment with no billing configured.
- **Stripe absent is a supported configuration.** `stripe` is `null` when
  `STRIPE_SECRET_KEY` is unset, `handleWebhookEvent` returns early, and the app
  runs as an unbilled trial. Local development and self-hosting need no Stripe
  account.
- `subscriptions` is one of the two tables outside the `forTenant` tenant-table
  set ([ADR-001](../tenancy/ADR-001-app-level-tenant-scoping.md)) — it is keyed by
  the Stripe customer, and `billingRestaurantId` is the deliberate indirection
  that keeps that consistent under multi-location.

## Related

- [ADR-007](../extraction/ADR-007-llm-provider-seam.md) — how the quota claim is enforced
- [ADR-011](../insights/ADR-011-scheduled-jobs-in-the-worker.md) — trial-expiry notices
