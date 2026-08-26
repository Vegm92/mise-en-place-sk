# ADR-024 — One Subscription per User, Tier Sets Restaurant Capacity

**Status:** Active
**Feature:** Billing
**Date:** 2026-08-20

## Context

The billing model keyed one Stripe subscription to one restaurant group
(ADR-013: `billingRestaurantId` resolves a location to its parent, and only the
parent carries a `subscriptions` row). That stopped a *restaurant* from being
billed twice, but not a *person*: an owner with two independent restaurant
groups could check out on each and hold two live Stripe subscriptions — paying
for two plans while only using one at a time.

Stripe has no native "at most one active subscription per customer" cap, so the
constraint has to be enforced by app logic that coordinates with Stripe. Any
enforcement that only lives in one layer is insufficient: a purely app-side
check misses a concurrent checkout that passes the guard before either
subscription exists, and a purely webhook-side reconciliation lets the user
reach Stripe checkout in the first place.

The intended product model is: **one subscription per user account**, and the
tier's capacity decides how many restaurants it covers — Starter and Pro each
cover one restaurant, Business covers up to five. A user who needs more
capacity upgrades their single subscription, never buys a second one.

## Decision

Enforce the one-subscription-per-user rule in two cooperating layers so Stripe
remains the single source of truth for what is paid:

1. **Checkout guard (app layer, primary UX).** Before a Checkout session is
   created, `ownedActiveSubscriptions(userId)` resolves every restaurant the
   user owns (`user_restaurants.role = 'owner'`) to its billing root
   (`parent_id ?? id`) and looks for a live subscription (`active`, `trialing`,
   `past_due`, or `paused` with a `stripe_subscription_id`). If the user already
   has a live subscription on a *different* group, checkout is refused with
   `billing.err.oneSubscription` instead of opening a second Checkout. A live
   subscription on the *current* group keeps the existing behaviour of
   redirecting to the Customer Portal.

2. **Webhook reconciliation (Stripe layer, safety net).** The Checkout Session
   now carries `userId` in both top-level and `subscription_data` metadata. On
   `checkout.session.completed`, `cancelDuplicateSubscriptionsForUser(userId,
   restaurantId)` cancels in Stripe every other live subscription the user owns,
   keeping only the one just created. Their `customer.subscription.deleted`
   webhooks flow through the existing out-of-order-safe path to sync local
   state. This catches the race a guard alone cannot, and any subscription a
   user starts outside the app. `resource_missing` is treated as success;
   failures are logged and reported to Sentry, never fatal to the checkout.

Capacity per tier is unchanged and already declared once in `TIERS.maxLocations`
(`starter` 1, `pro` 1, `business` 5); the new rule is about the *count of
subscriptions*, not the per-group location count.

## Consequences

- A user can never be billed for more than one active subscription through the
  app. The normal path is blocked at checkout; the race path is reconciled in
  Stripe within seconds.
- The reconciliation keeps the **newest** subscription. If a user buys on a
  second restaurant while one is live, their existing subscription is cancelled
  and that restaurant loses its paid tier (it falls back to trial access). This
  is the intended one-plan-per-user behaviour, but it is destructive and worth
  surfacing in the checkout UX before the guard ships — the current guard
  already blocks this path, so reconciliation should rarely fire.
- Capacity across *multiple independent groups* the user owns is **not** yet
  pooled: a Business subscription still covers `maxLocations` locations within
  its own group. Treating all of a user's restaurants as one capacity pool is a
  follow-up and would change `billingRestaurantId`/location-creation semantics —
  deliberately out of scope here.
- `ownedActiveSubscriptions` reads the user's own memberships by `userId`, so it
  cannot leak another user's subscriptions; shared ownership does not cause
  cancellation of a co-owner's unrelated subscription, because reconciliation is
  keyed to the metadata `userId` of the person who checked out.

## Related

- [ADR-013](../billing/ADR-013-tiers-trial-and-quota.md) — Stripe owns money,
  Postgres owns entitlement; this ADR adds a per-user cardinality rule on top of
  the per-group subscription.
- [ADR-023](../billing/ADR-023-entitlement-gate-is-route-declared.md) — how
  tiers gate routes once the one subscription is in place.