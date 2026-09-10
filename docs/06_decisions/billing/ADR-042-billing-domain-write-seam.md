# ADR-042 — Billing/Entitlements Domain Owns `subscriptions`; Trial Provisioning Goes Through `billing.ts`

**Status:** Active
**Feature:** Billing
**Date:** 2026-09-11
**Issue:** [#1046](https://github.com/Vegm92/mise-en-place-sk/issues/1046)

## Context

`auth-seed.seedAdminUser` provisions the CLI-seeded admin restaurant and, at
the end of that flow, inserted a `subscriptions` row directly
(`db.insert(subscriptions).values({ restaurantId, status: 'trialing',
trialEndsAt })`) — duplicating the trial-provisioning logic that
`billing.reconcileOrphanSubscriptions` and `billing.getOrCreateCustomer`
already encode (`trialDaysFor(founder)` days from now). A non-billing module
writing `subscriptions` directly, with its own copy of the trial-length
rule, is the pattern #1040/#1046 is closing off.

## Decision

**Billing/entitlements domain owns:** `subscriptions`. (Entitlements
themselves are derived read-side from this table plus `restaurants`/
`settings`; no separate entitlements table exists to own.)

**Permitted cross-domain write:** starting a restaurant's trial subscription
is exposed as `startTrialSubscription(restaurantId, founder, exec)` in
`src/lib/server/billing.ts`. `auth-seed.ts` now calls this instead of
inserting into `subscriptions` directly, so the trial-length rule
(`trialDaysFor`) has one source shared with the reconciliation job.

## Consequences

- Any future non-billing flow that needs to provision a trial subscription
  (a second seed script, an admin import tool) has one function to call
  instead of a fourth place computing `trialDaysFor(...) * DAY_MS` by hand.
- Tenant/RLS behavior is unchanged: `tests/auth-seed.test.ts` still asserts
  the seeded restaurant gets exactly one `trialing` subscription row with a
  correctly bounded `trialEndsAt`, now produced via the seam.
- No generic repository layer was introduced — this is one named function
  for one named cross-domain write, not a facade over all billing writes.
  `reconcileOrphanSubscriptions`'s own upsert (it needs
  `onConflictDoUpdate`, which a plain trial-start does not) is left as is.

## Related

- [ADR-008](../invoicing/ADR-008-single-invoice-write-path.md) — the same pattern applied to invoices
- [ADR-041](../products/ADR-041-product-domain-write-seam.md) — the same pattern applied to products
- [ADR-013](./ADR-013-tiers-trial-and-quota.md) — where `trialDaysFor`/`TRIAL_DAYS` come from
