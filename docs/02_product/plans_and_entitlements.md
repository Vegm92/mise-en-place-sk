---
tags: [mep, product]
related: "[[CONTEXT]]"
---

# Plans and Entitlements

How subscription tiers, quotas and feature access work. Canonical source of the
price, quota and location numbers: `src/lib/billing-plans.ts`
(`PROVISIONAL_PRICE`, `ANNUAL_PRICE`, `TIER_QUOTA`, `TIER_MAX_LOCATIONS`,
`FOUNDER_OFFER`, `TIER_COPY`). `src/lib/server/billing.ts` (`TIERS`,
`PlanTier`, `TierConfig`) reads them and adds the Stripe price ids and feature
flags. Full billing feature spec: `docs/03_features/billing.md`. Decision
records: `docs/02_product/pricing_decision_2026-10.md` (the price table) and
`docs/06_decisions/billing/ADR-013-tiers-trial-and-quota.md`.

## Tiers

| Tier | Monthly price (excl. IVA) | Annual price (excl. IVA) | Monthly document quota | Locations | Recipe sheets | `weeklyDigest` | `stockTracking` | `supplierScores` | `multiLocation` | `aiAssistant` | `prioritySupport` | `inventoryTemplate` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `trial` | 0 | — | 20 | 1 | 3 | — | — | — | — | — | — | — |
| `starter` | €69 | €690 | 100 | 1 | 3 | — | — | — | — | — | — | — |
| `pro` | €139 | €1,390 | 400 | 1 | unlimited | ✓ | ✓ | ✓ | — | ✓ | — | ✓ |
| `business` | €299 | €2,990 | unlimited (`null`) | 10 | unlimited | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

- Annual = 10 × monthly (`ANNUAL_MONTHS_BILLED`, "2 months free").
- One price per account, not per restaurant: a Business subscription covers the
  parent restaurant and up to 9 more locations (10 in total). Location creation
  is additionally gated by the global `multiLocation` beta flag
  (`docs/03_features/feature_flags.md`), which defaults to off.
- Founder offer (`FOUNDER_OFFER`): 60 % off, forever, 50 redemptions, redeem by
  2026-12-13. The discount itself lives in the Stripe coupon
  (`STRIPE_FOUNDER_COUPON_ID`); `FOUNDER_OFFER` / `FOUNDER_PRICE` only mirror it
  for display and must match it.
- Trial: 14 days (`TRIAL_DAYS`), 30 for founders approved from `/admin/access`
  (`FOUNDER_TRIAL_DAYS`); `subscriptions.status = 'trialing'`; locked when the
  window passes unless the subscription is `active`.
- A restaurant with **no** `subscriptions` row is treated as allowed-trialing
  (no lockout); the row appears on first Stripe contact or `getOrCreateCustomer`.

## Price resolution

- List price per tier: `PROVISIONAL_PRICE` (monthly) and `ANNUAL_PRICE`
  (yearly) in `src/lib/billing-plans.ts` — the only place prices live.
  `/billing`, `/waitlist` and every landing variant import them, and
  `/admin/revenue` prices MRR from them (`planMonthlyPriceCents(tier,
  interval)`; an annual subscription counts as `ANNUAL_PRICE / 12`). The old
  `PLAN_PRICE_<TIER>_EUR` env override was removed: it let admin MRR drift from
  the published page, and its deploy values were not visible from the repo.
- Stripe price ids: `STRIPE_PRICE_ID_STARTER/_PRO/_BUSINESS` (monthly,
  required) and `STRIPE_PRICE_ID_<TIER>_ANNUAL` (yearly, optional); legacy
  `STRIPE_PRICE_ID` is a fallback for starter monthly. A tier without a monthly
  price id is "not available" on `/billing` (`isTierAvailable`). The
  monthly/annual toggle shows only when all three annual ids are set
  (`isAnnualBillingAvailable`). Either id maps to the tier in the webhook
  (`tierFromPriceId`), and the interval is read back from the stored
  `subscriptions.stripe_price_id` (`intervalFromPriceId`) — no schema column.

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
