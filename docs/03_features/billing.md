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

## Code notes

### `src/routes/(app)/billing/+page.server.ts`

**`property available`**

- False when `STRIPE_PRICE_ID_<TIER>` is unset (issue #286).

**`property checkout`**

- An unavailable tier is a deployment misconfiguration → form error, not a 500 (issue #286).
- Refuse a second checkout while a live subscription exists — a double Checkout would charge the same card twice; plan changes go through the Customer Portal (issue #239).
- Per-submit idempotency key (issue #250): a replay lands back on /billing, where a fresh page load mints a new key for a genuine retry. The same key is reused as the Stripe idempotency key so a proxy retry can't create a second session (#239), then released so the user can retry after a Stripe hiccup.
- `checkout_started` (issue #253) measures checkout drop-off against `plan_upgraded`, which only fires on webhook success.

### `src/routes/(app)/billing/+page.svelte`

**`const upgradeMessage`**

- Sent here by the upload gate once the trial lapses (issue #287).

**`const idempotencyKey`**

- One per page load so a double-submit can't create two Stripe checkout sessions (issue #250).

**`markup`**

- Status card + plan card (the latter only when `data.status !== 'active'`).

### `src/routes/api/stripe-webhook/+server.ts`

**`const POST`**

- Stripe delivers events here (URL configured in the Stripe dashboard).
- Signature failures are expected noise (forged/misconfigured senders) and un-retryable → 400. Anything else is a real handler failure → report and return 500 so Stripe retries and flags the endpoint (issue #253).

### `src/lib/server/billing.ts`

**`const secretKey`**

- Stripe billing integration; without `STRIPE_SECRET_KEY` the module is a no-op (dev-safe).

**`class WebhookSignatureError`**

- Thrown when the Stripe signature doesn't verify — expected, un-retryable (400). Other throws are real handler failures the route must surface as 500 so Stripe retries and Sentry sees them (issue #253).

**`interface TierConfig`**

- `stripePriceId` per tier; `maxLocations` = how many restaurants one subscription covers (issue #290).

**`const TIERS`**

- Prices are managed in Stripe; quotas + features define each tier. Starter €49/mo (~50–80 invoices), Pro €99/mo, Business €199/mo (custom for chains); trial has no price id.
- Quota convention (issue #295): `settings.plan_quota` = `'unlimited'` | positive n | missing → tier's configured quota. Legacy rows stored the magic `99999` instead of the sentinel (`LEGACY_UNLIMITED_QUOTA`); `null` means unlimited at every call site. `resolveMonthlyQuota`/`getMonthlyQuota` apply the convention; `applyTierSettings` mirrors `plan_name`/`plan_quota` into settings so the layout serves them without a subscriptions join.

**`function isTierAvailable`**

- True when the tier has a Stripe price id configured.

**`function tierFromPriceId`**

- Falls back to `starter` for unknown/legacy price ids — but never silently (issue #286): an unmatched price would quota a €199/mo Business customer at 100 invoices, so it logs at error level and reports to Sentry.

**`function billingRestaurantId`**

- The restaurant whose subscription pays for `restaurantId` (issue #290): a multi-location child carries `parent_id` and no subscription of its own and resolves to its parent; a standalone restaurant resolves to itself.

**`interface AccessState` / `function getAccessState`**

- Gates paid capacity — uploads, extraction, AI chat (issue #287); read access to existing data is never gated. `trialExpired` gets its own copy. A missing subscription row is treated as allowed (only rows created outside onboarding hit that path).

**`function getOrCreateCustomer`**

- Serialized against itself (issue #239): a per-restaurant advisory lock + the Stripe idempotency key stop concurrent checkouts from orphaning a customer.

**`function createCheckoutSession`**

- Stripe idempotency key (issue #239) stops a proxy-level retry minting a second Checkout session (and therefore a second subscription).

**`function cancelSubscription`**

- Idempotent and safe to retry: an already-cancelled/missing subscription (`resource_missing`) counts as success so account deletion (issue #246) never wedges; no-op without Stripe configured (dev).

**`function handleWebhookEvent`**

- Production rejects unverified webhooks (forged events could mutate subscription state); dev may skip for local testing.
- Event-id dedup through the shared ledger under the `stripe-webhook` scope (issue #240 → #389): Stripe retries deliveries for up to 3 days; the claim runs before the switch so every event type is covered.
- Out-of-order protection (issue #240): a delayed `updated(past_due)` after `updated(active)` must not revert a paying customer — applied only when `event.created` ≥ the last recorded event.
- Payment-lifecycle telemetry (issue #253): past_due/cancel events were previously invisible.
- On handler failure the dedup claim is released so Stripe's retry reprocesses the event instead of being suppressed as a duplicate (#240 + #253).
