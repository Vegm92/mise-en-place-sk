---
tags: [mep, product]
related: "[[CONTEXT]]"
---

# Plans and Entitlements

How subscription tiers, quotas and feature access work. Canonical source of the
tier table: `src/lib/server/billing.ts` (`TIERS`, `PlanTier`, `TierConfig`).
Pricing copy: `src/lib/billing-plans.ts` (`PROVISIONAL_PRICE`, `TIER_COPY`).
Full billing feature spec: `docs/03_features/billing.md`. Decision record:
`docs/06_decisions/billing/ADR-013-tiers-trial-and-quota.md`.

## Tiers

| Tier | Monthly invoice quota | Locations | Recipe sheets | `weeklyDigest` | `stockTracking` | `supplierScores` | `multiLocation` | `aiAssistant` | `prioritySupport` | `inventoryTemplate` |
|---|---|---|---|---|---|---|---|---|---|---|
| `trial` | 20 | 1 | 3 | — | — | — | — | — | — | — |
| `starter` | 100 | 1 | 3 | — | — | — | — | — | — | — |
| `pro` | 300 | 1 | unlimited | ✓ | ✓ | ✓ | — | ✓ | — | ✓ |
| `business` | unlimited (`null`) | 5 | unlimited | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

- Trial: 30 days (`TRIAL_DAYS`), `subscriptions.status = 'trialing'`,
  `trialEndsAt = createdAt + 30d`; locked when the window passes unless the
  subscription is `active`.
- A restaurant with **no** `subscriptions` row is treated as allowed-trialing
  (no lockout); the row appears on first Stripe contact or `getOrCreateCustomer`.

## Price resolution

- List price per tier: `PROVISIONAL_PRICE` (starter 29, pro 59, business 129 €)
  unless the env override `PLAN_PRICE_<TIER>_EUR` is set
  (`planMonthlyPriceCents`). MRR/ARPA/ACV/LTV are computed off this.
  **One source of truth**: the override → `PROVISIONAL_PRICE` value is what
  `/billing` renders. `/waitlist` reads `PROVISIONAL_PRICE` directly (issue
  #439) rather than the resolved override — it is a public page with no
  access to server env vars, so an `.env` override updates `/billing` but not
  `/waitlist`; changing `PROVISIONAL_PRICE` itself still updates both.
- Stripe price ids: `STRIPE_PRICE_ID_STARTER/_PRO/_BUSINESS`; legacy
  `STRIPE_PRICE_ID` is a fallback for starter. A tier without a price id is
  "not available" on `/billing` (`isTierAvailable`).

## Quotas

- `resolveMonthlyQuota(restaurantId)`: honored values — `settings.plan_quota`
  (incl. sentinel `'unlimited'`), legacy magic `99999`, else
  `TIERS[tier].monthlyInvoiceQuota`.
- The metered unit is **a document sent to the extractor**, not an invoice
  saved, and `monthly_usage` (unique `(restaurant_id, month)`) is the single
  number behind every quota surface — the sidebar counter, the billing card,
  the upload pre-check, the 80% warning email and the worker's gate all read it
  through `getMonthlyUsage`. Sold and displayed as "documentos procesados".
  See [ADR-036](../06_decisions/billing/ADR-036-one-metered-unit.md).
- `claimMonthlyExtraction` increments atomically under a `used < limit` guard,
  and counts for unlimited tenants too (it just never refuses them).
  `releaseMonthlyExtraction` refunds a failed extraction, and a cancelled item
  that never reached the model; never one already extracted.
- `usage_events` is the append-only trail the counter is a sum of
  (`SUM(delta) = used`). Claim and release are idempotent via a per-item
  balance under an advisory lock, so a redelivered job charges once and a
  double cancel refunds once — while a retried item can still claim again.
- A composite document buys its whole packet at the structure stage, all or
  nothing (`reserveMonthlyExtractions`): if 17 documents do not fit, none are
  extracted and the item fails with `extract.err.quotaCompositeExceeded`.
- `tenant_llm_quotas` can cap `monthlyExtractions` and `monthlyCostLimitUsd`
  (checked against `SUM(estimated_cost_usd)` from `llm_usage_log`).
- Parent-aware: multi-location queries resolve quota from the parent restaurant
  (`billingRestaurantId`). Behavioural contract for the whole multi-location
  feature: `docs/03_features/multi_locations.md`.

## Feature gating (where each flag is enforced)

| Feature | Gate location |
|---|---|
| `aiAssistant` | `(app)/api/chat/+server.ts` → 402 |
| `weeklyDigest` | `/digest` load → redirect `/billing?upgrade=digest`; also filters digest cron |
| `stockTracking` | `(app)/api/stock-levels/+server.ts` → 403 |
| `maxRecipes` | Not a feature flag — a count. `/recipes` is `'open'`; the `create` action returns 402 with an upgrade link once non-archived sheets reach the tier's limit. Mirrors `maxLocations`. |
| `supplierScores` | `/analytics/prices` load → redirect `?upgrade=prices` |
| `multiLocation` | `/settings` location creation |
| `inventoryTemplate` | `(app)/products/inventory-template/+server.ts` → 403 in-handler, plus `ROUTE_POLICY` → redirect `/billing?upgrade=inventario` (issue #885) |

The upload action and extraction worker also check `getAccessState()` (trial
expiry / inactive subscription) and the monthly quota before allowing work.

## Billing state machine

`trialing` → (checkout complete) `active` → `past_due`/`paused`/`canceled` via
Stripe webhooks. `subscription.updated/deleted/paused/resumed` are guarded by
`lastEventAt <= event.created` to tolerate out-of-order delivery. `settings`
mirrors `plan_name`/`plan_quota` (`applyTierSettings`) so the UI quota card
reads one source. The mirrored `plan_name` is a language-neutral token, not
display copy — the plan name shown to a user comes from `TierConfig.nameKey`
through the i18n table.

## Admin revenue view

MRR = Σ `planMonthlyPriceCents(planTier)` over `status='active'`; at-risk =
`past_due`. `mrr_snapshots` captured nightly + backfillable as `estimated`.
See `docs/03_features/analytics.md` and `src/lib/server/revenue-metrics.ts`.
