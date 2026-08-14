# Feature Spec — Billing (tiers, trial, quotas, Stripe)

## Purpose

Monetize with subscription tiers. **Stripe owns money, Postgres owns
entitlement** (ADR-013): Stripe is the source of truth for payment state; the
local `subscriptions` row + `settings` mirror gate feature access and quotas.

## Actors

- Owner of a restaurant (checkout, portal).
- Stripe webhooks (state transitions).
- All member requests (entitlement/quota checks).

## Preconditions

- `STRIPE_SECRET_KEY` set for checkout; `STRIPE_WEBHOOK_SECRET` for webhooks.

## Inputs

- Checkout: selected tier.
- Webhook: signed Stripe events (`checkout.session.completed`,
  `customer.subscription.updated/deleted/paused/resumed/trial_will_end`).

## Outputs

- `subscriptions` row upserts; `settings.plan_name`/`plan_quota` mirror.
- Emails (confirmation); `trackEvent` lifecycle events; `/billing` UI state.

## Business rules

- **Tiers**: trial 20 / starter 100 / pro 300 / business unlimited invoices per
  month; feature flags per tier (see `docs/02_product/plans_and_entitlements.md`).
- **Trial**: 30 days; `isAccessAllowed` = `active` always, `trialing` only while
  `trialEndsAt > now`. No `subscriptions` row → treated as allowed-trialing.
- **Checkout** (`createCheckoutSession`): `mode:'subscription'`, one line item,
  `allow_promotion_codes`, `restaurantId` in **both** top-level `metadata` and
  `subscription_data.metadata` (PR #417 — webhook reads either).
- **Webhook** (`handleWebhookEvent`):
  - Verify signature (`constructEvent`); prod throws if secret unset.
  - Dedup: `claimIdempotencyKey(STRIPE_WEBHOOK_SCOPE, event.id)`; unclaimed →
    skip; on error → release the claim so Stripe's 3-day retry reprocesses.
  - `checkout.session.completed` → `tierFromPriceId` (unknown → loud log +
    Sentry + fallback `starter`), upsert subscription, `applyTierSettings`,
    confirmation email.
  - `subscription.updated/deleted/paused/resumed` → guarded `UPDATE` with
    out-of-order filter `or(isNull(lastEventAt), lte(lastEventAt, event.created))`;
    `applyTierSettings` when `active`; tracks lifecycle events.
- **Quota enforcement**: upload action + extraction worker call
  `getAccessState` + `resolveMonthlyQuota`; consumption via `monthly_usage`
  (`claimMonthlyExtraction`). Feature gates listed in
  `docs/02_product/plans_and_entitlements.md`.
- **Provisional prices**: canonical list price per tier is
  `PROVISIONAL_PRICE` in `billing-plans.ts` (starter 29 / pro 59 / business
  129 €), **overridable via env** `PLAN_PRICE_STARTER_EUR` /
  `PLAN_PRICE_PRO_EUR` / `PLAN_PRICE_BUSINESS_EUR` (documented in
  `.env.example`; `billing.ts:81` uses the override when set and ≥ 0, else the
  `PROVISIONAL_PRICE` fallback). The `/waitlist` pricing section hardcodes
  29/59/129 independently instead of reading this source (open item #439);
  the intended fix is for `/waitlist` to consume the same
  override → `PROVISIONAL_PRICE` value so an `.env` change updates both the
  app and the marketing page.

## State transitions

```
trialing ──(checkout.completed)──▶ active ──(updated past_due)──▶ past_due
                                        └──(deleted/paused)──▶ canceled/paused
```

## Data dependencies

`subscriptions`, `idempotency_keys` (`stripe-webhook` scope), `settings`, `monthly_usage`,
`mrr_snapshots` (revenue), `system_notifications` (events).

## API dependencies

`api/stripe-webhook`, `/billing` actions (checkout, portal, upgrade= redirects
from gated pages).

## UI dependencies

`billing/+page.svelte`, `BillingPlanCard.svelte`, `BillingFeatureMatrix.svelte`,
`BillingStatusCard.svelte`, quota card in app sidebar.

## Background dependencies

Trial-expiry notice cron; MRR snapshot cron (`15 2 * * *`).

## External dependencies

Stripe (checkout, portal, webhooks), Resend (email), Sentry.

## Validation

Signature verification; tier from price id; event dedup claim; out-of-order
guard; quota arithmetic.

## Error states

- Missing `STRIPE_WEBHOOK_SECRET` in prod → webhook throws (500).
- Unknown price id → fallback `starter` + loud log + Sentry.
- Tier with no price id → "plan not available" on `/billing` (no 500).
- Webhook handler error → dedup claim deleted → Stripe retries.

## Edge cases

- Same webhook delivered twice → second claim loses (skip).
- Out-of-order events (updated before completed) → `lastEventAt` guard.
- Restored/canceled subscriptions → `cancelAtPeriodEnd` handled.
- Multi-location parent quota resolution (`billingRestaurantId`). The full
  multi-location billing contract lives in `docs/03_features/multi_locations.md`
  (one subscription per group, one feature set, one quota pool, parent-resolved).

## Security rules

- Webhook signature mandatory in prod; dedup claim before side effects;
  entitlement from DB, never from client claims or price ids alone.

## Idempotency rules

- `idempotency_keys` (`stripe-webhook` scope) dedup + claim-release-on-error.
- Checkout dedup via `claimRequest`/`releaseRequest` (idempotency.ts).

## Observability

- `trackEvent` lifecycle events in `/admin/events`; MRR snapshots in
  `/admin/revenue`; Sentry on unknown prices and handler errors.

## Acceptance criteria

- A checkout for a tier creates the subscription + settings mirror; webhook
  replay is a no-op; unknown price falls back with a loud log.
- Access/quota gates respond correctly at the boundary (402/403/quota).
- Tests: `tests/billing.test.ts`, `tests/stripe-webhook.test.ts`
  (signature verification, all branches, dedup, out-of-order).
