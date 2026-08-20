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
- **One subscription per user (ADR-024)**: a user account may hold **at most one
  live subscription** (`active`/`trialing`/`past_due`/`paused`). The tier's
  `maxLocations` sets how many restaurants that one subscription covers
  (starter 1, pro 1, business up to 5). A user who needs more capacity upgrades
  the single subscription, never buys a second. Enforced at checkout
  (`ownedActiveSubscriptions` guard → `billing.err.oneSubscription`) and
  reconciled in the webhook (`cancelDuplicateSubscriptionsForUser` cancels any
  duplicate live subscriptions in Stripe, keeping the newest).
- **Checkout** (`createCheckoutSession`): `mode:'subscription'`, one line item,
  `allow_promotion_codes`, `restaurantId` **and** `userId` in **both** top-level
  `metadata` and `subscription_data.metadata` (the webhook reads either). `success_url`
  points to `/billing/confirm?session_id={CHECKOUT_SESSION_ID}` so the buyer lands
  on a dedicated confirmation page; `cancel_url` returns to `/billing`.
- **Confirmation** (`billing/confirm`): the server load pulls the Checkout Session
  back from Stripe (`session_id`) to confirm `payment_status` and surface the plan
  name + receipt email. The webhook is async and can lag the redirect, so the page
  shows a "plan being activated" state and auto-redirects to `/billing` after a few
  seconds.
- **Webhook** (`handleWebhookEvent`):
  - Verify signature (`constructEvent`); prod throws if secret unset.
  - Dedup: `claimIdempotencyKey(STRIPE_WEBHOOK_SCOPE, event.id)`; unclaimed →
    skip; on error → release the claim so Stripe's 3-day retry reprocesses.
  - `checkout.session.completed` → `tierFromPriceId` (unknown → loud log +
    Sentry + fallback `starter`), upsert subscription, `applyTierSettings`,
    confirmation email. When the session carries `userId`, it then cancels any
    other live subscription the user owns in Stripe
    (`cancelDuplicateSubscriptionsForUser`) so one-user/one-plan holds under
    races or out-of-app purchases.
  - `subscription.updated/deleted/paused/resumed` → guarded `UPDATE` with
    out-of-order filter `or(isNull(lastEventAt), lte(lastEventAt, event.created))`;
    `applyTierSettings` when `active`, and resets to `trial` when the status turns
    `canceled`/`paused`/`incomplete` so the settings mirrors (and the sidebar
    quota/name) drop back to the trial tier; tracks lifecycle events.
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
- **Cancel / reinstate (Customer Portal is the single source of truth)**: plan
  cancellation and reinstatement are **not** performed in-app. The status card's
  "Manage subscription" button opens the Stripe Customer Portal (`?/portal` →
  `createPortalSession`), where the owner cancels (sets
  `cancel_at_period_end: true`, keeping the plan fully usable until the current
  period ends and skipping the next charge) or reinstates before the period
  ends. The `customer.subscription.updated` webhook mirrors the flag into
  `subscriptions.cancel_at_period_end`, which the status card renders as
  "cancels on {date}". The subscription is only fully removed when Stripe emits
  `customer.subscription.deleted`. Keeping Stripe as the unique truth place
  avoids two divergent cancel paths.
- **Plan change via the Stripe Customer Portal**: an owner with an active subscription changes plans through the Stripe Customer Portal (Stripe is the single source of truth for plan management); the plan card opens the portal via `?/portal` instead of mutating in-app. A tested programmatic path (`switchTier`) still swaps the price on the **same** Stripe subscription (`subscriptions.update` with the item id + new price) but is not wired to the UI. **Upgrades pro-rate automatically** (pay the difference
  to the anchored renewal date). **Downgrades apply immediately** — the webhook
  flips the tier and `applyTierSettings` drops features/quota right away; the
  price change is billed at the next period but access degrades on switch (open
  decision: a graceful period-end downgrade would need a cron to apply the tier
  later). Switching also clears any pending `cancel_at_period_end`. The
  `customer.subscription.updated` webhook syncs the new tier, so no new webhook
  logic is needed. For a trial/no-subscription the plan cards still go through
  `checkout`.
- **Reconcile on load (webhook backstop)**: the webhook is the only other sync
  path, so a missed delivery would drift local entitlement forever. `/billing`
  calls `syncSubscriptionFromStripe` before reading the local row: it pulls the
  live subscription from Stripe by `stripe_subscription_id` and mirrors
  status/tier/period/trial/cancel flag into the row + settings mirror (active →
  paid tier, terminal → trial), same rules as the
  `customer.subscription.updated` webhook. Best-effort by design — a Stripe
  failure logs + Sentry and the page renders from the cached row.

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

`billing/+page.svelte`, `billing/confirm/+page.svelte`, `BillingPlanCard.svelte`,
`BillingFeatureMatrix.svelte`, `BillingStatusCard.svelte`, quota card in app sidebar.

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
- Missing `restaurantId`/`subscriptionId` metadata in a webhook payload → the branch is
  skipped but logs an error + reports to Sentry (never a silent `break` — a skipped
  event with HTTP 200 is otherwise invisible).
- Tier with no price id → "plan not available" on `/billing` (no 500).
- Webhook handler error → dedup claim deleted → Stripe retries.

## Edge cases

- Same webhook delivered twice → second claim loses (skip).
- Out-of-order events (updated before completed) → `lastEventAt` guard.
- Restored/canceled subscriptions → `cancelAtPeriodEnd` handled.
- A user checking out on a second restaurant while one subscription is live → refused at checkout (`billing.err.oneSubscription`); a concurrent/out-of-app second subscription → webhook reconciliation cancels the duplicate in Stripe (ADR-024).
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

**`const load`**

- Calls `syncSubscriptionFromStripe(rid)` before reading the local row so the
  status card reflects the live Stripe state even when a webhook was missed. The
  reconcile swallows Stripe errors, so the page never fails to render because
  Stripe is unreachable.

**`property available`**

- False when `STRIPE_PRICE_ID_<TIER>` is unset (issue #286).

**`property checkout`**

- An unavailable tier is a deployment misconfiguration → form error, not a 500 (issue #286).
- One subscription per user (ADR-024): before opening Checkout, `ownedActiveSubscriptions(userId)` is consulted; a live subscription on another owned group refuses the checkout with `billing.err.oneSubscription`. A live subscription on the current group redirects to the Customer Portal (a double Checkout would charge the same card twice; plan changes go through the portal — issue #239).
- Per-submit idempotency key (issue #250): a replay lands back on /billing, where a fresh page load mints a new key for a genuine retry. The same key is reused as the Stripe idempotency key so a proxy retry can't create a second session (#239), then released so the user can retry after a Stripe hiccup.
- `checkout_started` (issue #253) measures checkout drop-off against `plan_upgraded`, which only fires on webhook success.

**`property portal`**

- Opens the Stripe Customer Portal for the current customer (`createPortalSession`) and 303s there. This is now the single place where the owner manages the subscription — plan changes, cancel, and reinstate all live in Stripe, which stays the source of truth; the webhook syncs local state back.

**`property switch`**

- The in-app plan-change action for an active subscription. Validates the target tier (real, non-trial, price configured), refuses a switch to the current tier, then calls `switchTier` and tracks `plan_switched`. A Stripe error is surfaced as a 500 form error (`billing.err.switchFailed`) rather than thrown. The plan card posts to `?/portal` when a subscription exists (plan changes happen in the Stripe Customer Portal, Stripe is the source of truth) and `?/checkout` otherwise; `?/switch`/`switchTier` remain as a tested programmatic path but are no longer reachable from the billing UI.

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
- Quota convention (issue #295): `settings.plan_quota` = `'unlimited'` | positive n | missing → tier's configured quota. Legacy rows stored the magic `99999` instead of the sentinel (`LEGACY_UNLIMITED_QUOTA`); `null` means unlimited at every call site. `resolveMonthlyQuota`/`getMonthlyQuota` apply the convention; `applyTierSettings` mirrors `plan_name`/`plan_quota` into settings so the layout serves them without a subscriptions join for the common case.

**`function getEntitlements`**

- Returns the effective tier for runtime gating (features, `maxLocations`, layout nav). The stored `planTier` column reflects the Stripe price and stays at the paid tier even after cancellation (the price is still Pro until the sub is deleted), so the returned tier degrades to `trial` on explicit terminal states — `canceled`/`paused`/`incomplete`, or a `trialing` row whose trial has lapsed — while keeping the paid tier during an active/trialing cancel-at-period-end window and for `past_due` (recoverable payment). This is what makes features, the nav, and the sidebar quota fall back to the trial tier once a plan is canceled.

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

- Stripe idempotency key (issue #239) stops a proxy-level retry minting a second Checkout session (and therefore a second subscription). Carries `restaurantId` and `userId` in top-level and `subscription_data` metadata so the webhook can locate the subscription and reconcile the one-subscription-per-user rule (ADR-024).

**`function ownedActiveSubscriptions`**

- One-subscription-per-user (ADR-024): lists the user's owned restaurant groups (`user_restaurants` role `owner`, resolved through `parent_id ?? id`) that currently hold a live subscription (`active`/`trialing`/`past_due`/`paused` with a `stripe_subscription_id`). Read by the checkout guard; a user can only ever see their own memberships.

**`function cancelDuplicateSubscriptionsForUser`**

- The Stripe-side half of the one-subscription-per-user rule: after a new checkout lands, cancels every other live subscription the user owns, keeping the newest. Runs off the checkout's `userId` metadata so a shared-owner setup never cancels a co-owner's unrelated subscription. `resource_missing` counts as success; other failures are logged + Sentry, never fatal to the checkout. The cancelled subscriptions' `customer.subscription.deleted` webhooks sync local state through the normal out-of-order-safe path.

**`function cancelSubscription`**

- Idempotent and safe to retry: an already-cancelled/missing subscription (`resource_missing`) counts as success so account deletion (issue #246) never wedges; no-op without Stripe configured (dev).

**`function switchTier`**

- In-app plan change for a live subscription: retrieves the sub to get the
  subscription-item id, then `subscriptions.update(id, { items: [{ id, price }],
  cancel_at_period_end: false })`. Upgrades pro-rate in Stripe; downgrades
  apply immediately. Mirrors the new tier/price into the local row and re-runs
  `applyTierSettings` so access changes without waiting for the webhook (which
  also syncs it). No-op without Stripe configured (dev).

**`function handleWebhookEvent`**

- Production rejects unverified webhooks (forged events could mutate subscription state); dev may skip for local testing.
- Event-id dedup through the shared ledger under the `stripe-webhook` scope (issue #240 → #389): Stripe retries deliveries for up to 3 days; the claim runs before the switch so every event type is covered.
- Out-of-order protection (issue #240): a delayed `updated(past_due)` after `updated(active)` must not revert a paying customer — applied only when `event.created` ≥ the last recorded event.
- Payment-lifecycle telemetry (issue #253): past_due/cancel events were previously invisible.
- On handler failure the dedup claim is released so Stripe's retry reprocesses the event instead of being suppressed as a duplicate (#240 + #253).
- A webhook branch that can't be applied because the payload is missing `restaurantId`/`subscriptionId` metadata logs at error level + Sentry instead of a silent `break` — a 200 OK with nothing applied is otherwise indistinguishable from success in logs.
- Each applied event logs an `[billing] <event> applied` info line (restaurant, tier, status, subscription id) so the webhook→tier pipeline is traceable end to end.

**`function syncSubscriptionFromStripe`**

- Reconcile-on-load backstop: the webhook is the only other sync, so a missed
  delivery would otherwise drift local entitlement forever. Resolves the billing
  parent, reads the row's `stripe_subscription_id`, `retrieve`s the live
  subscription, and mirrors `status`/`plan_tier`/`stripe_price_id`/
  `trial_ends_at`/`current_period_end`/`cancel_at_period_end` into the local row,
  applying the same `applyTierSettings` rule as the
  `customer.subscription.updated` webhook (active → paid tier, terminal →
  trial). If the stored subscription is terminal (`canceled`/etc.) or the
  customer has a live one the row never learned about, it falls back to listing
  the customer's subscriptions and adopts the live one — preferring a
  restaurantId-metadata match, else the most recently created — and repoints the
  row at it, so subscriptions created without metadata (e.g. via the portal)
  still sync. Sets `last_event_at` to now so any in-flight webhook created
  earlier is treated as stale by the out-of-order guard and can't revert the
  reconciled state. Best-effort by design: a Stripe error is logged + Sentry,
  never thrown, so `/billing` still renders from the cached row.

### `src/routes/(app)/billing/confirm/+page.server.ts`

**`const load`**

- Pulls the Checkout Session back from Stripe via `session_id` (the "request") and logs its response (`payment_status`, subscription, metadata, email, price ids) for diagnosis. Verifies `metadata.restaurantId` matches the current restaurant before surfacing plan/email details. Tolerates a missing session or Stripe being unconfigured — the page still renders a generic confirmation.

### `src/routes/(app)/billing/confirm/+page.svelte`

**`markup`**

- Success card with plan name + receipt email when known; the page stays put (no auto-redirect) because the webhook that flips the tier is asynchronous and can lag the redirect — the user navigates to `/billing` when ready.

### `src/lib/components/mep/BillingStatusCard.svelte`

**`markup`**

- Renders the status pill + next billing date from the load's `cancelAtPeriodEnd`. For a live subscription (gated on `hasSubscription`, i.e. a `stripe_subscription_id` exists, so it is visible even when the local status lags `active` in dev) it offers a single "Manage subscription" button that posts to `?/portal` and opens the Stripe Customer Portal. Cancel and reinstate are done there (Stripe is the source of truth); while `cancelAtPeriodEnd` is set it shows "cancels on {date}" plus a note that access lasts until then with no further charge.

### `src/routes/(app)/+layout.server.ts` / `src/routes/(app)/+layout.svelte` (sidebar quota card)

- The sidebar quota card reads `planName`, `quotaUsed`, `quotaLimit` from the layout load. `planName`/`quotaLimit` honour the `settings` mirrors while the subscription is usable (`access.allowed` or `past_due`) and fall back to the `trial` tier's name/quota once it is not (post-cancel), so a canceled plan drops back to the trial display even if the webhook reset hasn't landed yet. The load also reads `status`, `cancelAtPeriodEnd`, `currentPeriodEnd` from the subscription (resolved to the billing parent) so the sidebar can show "cancels on {date}" during a cancel-at-period-end window and "Cancelada/Canceled" once fully canceled, mirroring `BillingStatusCard`.
