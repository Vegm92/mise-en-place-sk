# Feature Spec — Multi-location (Business-tier restaurant groups)

## Purpose

Let a Business-tier customer run several restaurants ("locations") under one
group: the **parent** restaurant owns the single subscription, and each
**location** operates as a fully isolated data tenant that shares the parent's
billing. This spec is the behavioural contract for the whole multi-location
feature and its pipelines (extraction, billing, quota, switching). Decision
record: ADR-013 § "Multi-location billing rolls up to the parent".

Canonical terms (see `docs/00_system/terminology.md`): **Restaurant** (billing
tenant + data boundary), **Location** (a second restaurant linked via
`restaurants.parentId`), **Parent** (the restaurant that owns the
subscription), **Active restaurant** (the location/parent a signed-in user is
currently working in).

## Actors

- **Owner** (`user_restaurants.role = 'owner'`) of the parent — the only actor
  that may create locations, rename, pair WhatsApp numbers and manage the
  group's billing.
- **Members** (`role = 'member'`) — reserved for the future invite flow; no code
  path writes this role today (see Non-goals).
- **Active-restaurant context** — every request is scoped to the active
  restaurant (`locals.restaurantId`); switching is membership-validated.
- **Extraction worker + background jobs** — resolve entitlement against the
  parent, never the active location.
- **Stripe** — one customer and one subscription per group, keyed by parent id.

## Preconditions

- Parent restaurant has an active subscription at a tier with
  `features.multiLocation = true` (currently only `business`,
  `maxLocations = 5`; see `TIERS` in `src/lib/server/billing.ts`).
- The acting user is an `owner` member of the parent restaurant.
- The group has capacity: the user's memberships within the group
  (parent + its locations) are below the tier's `maxLocations`.

## Inputs

- Settings form `addLocation`: a location `name`.
- Location switcher (`(app)/+layout.svelte`) + `(app)/api/active-restaurant`:
  a target restaurant id.

## Outputs

- A `restaurants` row with `parent_id = <parent id>` (unique `slug`).
- A `user_restaurants` membership row (creator, `role = 'owner'`).
- `active_restaurant` cookie set to the new location; redirect to `/`.
- `trackEvent('location_created', ...)`.

## Business rules

### 1. The parent is the billing root

`billingRestaurantId(rid)` resolves any restaurant to its
`parent_id ?? id` (`billing.ts`). **Every entitlement read and write MUST
resolve the tenant through `billingRestaurantId` first.** A location is never a
billing peer; there is no per-location subscription, customer, or quota.

### 2. One subscription per group

Nested under the one-subscription-per-user rule (ADR-024): a user may hold at
most one live subscription, and that subscription's tier (`maxLocations`)
decides how many restaurants it covers — the group here is the unit the
subscription pays for, not a licence to buy a second one.

- The `subscriptions` row exists **only on the parent**. Locations have no
  subscription row.
- `getAccessState`, `getTierFeatures`, `getMonthlyQuota` already resolve via
  the parent (correct). The app shell and `/billing` must do the same (see
  gaps below).
- Stripe metadata (`checkout.session` and `subscription_data.metadata`), the
  Stripe customer, and `getOrCreateCustomer` always carry the **parent** id.
  A location must never trigger customer creation or checkout on its own.

### 3. One feature set

All feature gates (`aiAssistant` chat, `weeklyDigest`, `stockTracking`,
`supplierScores`, `multiLocation` creation) evaluate the **parent's** tier, in
the shell, in the gated pages, and in the worker. A Business group never
presents as trial or Starter from inside a location.

### 4. One quota pool

The group shares the parent's monthly quota. `claimMonthlyExtraction`,
`releaseMonthlyExtraction` and `checkExtractionQuota` (`llm-quota.ts`) record
consumption against the **parent** id in `monthly_usage`, `llm_usage_log` and
`tenant_llm_quotas`. Quota is consumed once per group, not once per location.

### 5. Full data isolation between locations

Locations are independent tenants. All business tables carry `restaurant_id`
and scope to the active `rid`: invoices, suppliers, products, aliases, unit
conversions, settings, notifications, stock, budgets, chat, WhatsApp contacts.
Nothing from a sibling location is readable or writable; **only billing is
shared.** The tenant-scoping lint gates and `tests/tenant-isolation*.test.ts`
apply to locations exactly as to standalone restaurants.

### 6. Creation gate (`addLocation`)

Allowed only when ALL of the following hold:

1. `TIERS[tier].features.multiLocation` is true (Business).
2. The acting user is `owner` of the parent (via `user_restaurants`).
3. The number of restaurants in this group (parent + its locations) the user is
   a member of is below `TIERS[tier].maxLocations`.

The new restaurant is created with `parent_id = billingRestaurantId(active)`
(even when the active restaurant is itself a location), the creator becomes its
owner, and the tier settings mirror is written for fallback only (see rule 8).
The `active_restaurant` cookie is set to the new location.

The owner check, the capacity check, and the insert all run inside one
`db.transaction`, guarded by `pg_advisory_xact_lock(hashtext('loc:' +
billingRestaurantId))` (same pattern as `getOrCreateCustomer`'s `cust:<id>`
lock) — two concurrent submits at the limit serialize on the lock instead of
both reading a pre-insert count and both passing (issue #499).

### 7. Access and lockout are group-wide

`getAccessState` resolves the parent's subscription. If the parent's
subscription is inactive or the trial expired, **every location in the group**
is locked — billing is shared, so access is shared.

### 8. Tier settings mirror is never authoritative

`applyTierSettings` mirrors `plan_name`/`plan_quota` to a `settings` row. On
webhook tier changes it writes to the **parent** only. A mirror written to a
location at creation is fallback display data; any read that needs the group's
tier must resolve to the parent so it cannot go stale after an upgrade.

### 9. Delete cascades to the group

`restaurants.parent_id` has `ON DELETE CASCADE` (migration 0023). Deleting the
parent deletes its locations and, through each `restaurants(id)` FK, all their
tenant data. The account-deletion flow (`api/user/delete`) treats a sole-owned
parent as sole-owning its whole group.

### 10. Active restaurant switching

- The switcher lists every restaurant the user is a member of
  (`user_restaurants` join `restaurants`).
- `POST /api/active-restaurant` verifies membership in the target; non-members
  get 403.
- The `active_restaurant` cookie is re-validated against the membership set on
  every request (`hooks.server.ts`); an invalid cookie falls back to the first
  membership, else null → `/onboarding`.

## State transitions

```
Standalone restaurant:        trial ──(checkout)──▶ active ──(webhook)──▶ past_due/canceled
Group (Business):             parent subscription holds ALL locations' access.

Location lifecycle:
  (not a location) ──addLocation──▶ location (parent_id set, owner membership)
  ──▶ operates as isolated tenant, entitled via parent
  ──(parent deleted)──▶ cascaded delete (ON DELETE CASCADE)
```

Locations have no billing state of their own; there is no
location-level trial/subscription transition.

## Data dependencies

`restaurants` (`parent_id`, `slug`), `user_restaurants`, `subscriptions`
(parent row only), `settings` (`plan_quota`/`plan_name` mirrors),
`monthly_usage`, `llm_usage_log`, `tenant_llm_quotas`.

## API dependencies

- `(app)/api/active-restaurant` — membership-gated switch.
- `(app)/settings` → `addLocation` — creation.
- `(app)/billing` → `checkout` / `portal` — group billing only (parent-resolved).
- `api/stripe-webhook` — subscription state for the parent.

## UI dependencies

- `(app)/+layout.svelte` — location switcher (shown when the user has >1
  membership), plan/quota card.
- `(app)/settings/+page.svelte` — locations section; the add-location form
  renders only when `data.multiLocation` (Business).
- `(app)/billing/+page.svelte` — group subscription state and plan cards.

## Background dependencies

- Extraction worker — access + quota resolved via parent.
- Weekly digest cron, alerts, MRR snapshots — run per restaurant; digest/email
  per location is expected (each location is a real tenant). MRR is computed
  from parent `subscriptions` rows only.
- Tenant fan-out dispatchers (`tenantPage`) — unaffected; they page over
  `restaurants`, so each location is dispatched its own job.

## External dependencies

Stripe (one customer/subscription per group), Resend, Sentry.

## Validation

- Tier gate → `fail(403, 'set.locations.err.notAvailable')`.
- Capacity gate → `fail(403, 'set.locations.err.limitReached')`.
- Owner gate → `fail(403, ...)`.
- Name required / max length → 422 (existing keys).
- Slug uniqueness — generated with a random suffix collision guard.
- Switch membership → 403 'Not a member of that restaurant'.

## Error states

- Non-Business tier → creation blocked; existing locations keep working.
- Tier downgraded below Business with existing locations → creation blocked,
  existing locations remain functional at the (now non-Business) parent tier.
- Parent subscription canceled/expired → all locations locked (`getAccessState`
  resolves parent).
- Duplicate form submit → composite PK `(user_id, restaurant_id)` + slug
  uniqueness prevent duplicate memberships/restaurants (issue #241, migration
  0015).

## Edge cases

- Owner adds a location **while inside another location**: new location's
  `parent_id` is the group's parent (`billingRestaurantId`), not the active
  location.
- Owner of two groups: capacity is counted per group (parent + its locations),
  never across groups.
- `active_restaurant` cookie pointing at a deleted restaurant → hooks fall back
  to the first remaining membership.
- maxLocations = 1 (non-Business) → the add-location form is hidden and the
  action returns 403.
- Standalone restaurants resolve `billingRestaurantId` to themselves — all
  rules above degrade to the single-tenant behaviour with no parent.

## Security rules

- Never persist or trust an unchecked restaurant id from the client — the only
  client-supplied restaurant id is the switch endpoint, and it is
  membership-validated before the cookie is written.
- Location creation is owner-only; feature gates come from the parent's tier,
  never from UI state or the active location.
- Tenant isolation between locations is enforced by the same `forTenant().scope()`
  + CI lint gates as standalone tenants (ADR-001/005).

## Idempotency rules

- Membership composite PK prevents duplicate memberships; `slug` random suffix
  prevents duplicate restaurants.
- Billing idempotency lives on the parent: `cust:<parentId>` Stripe idempotency
  key + `pg_advisory_xact_lock` in `getOrCreateCustomer`, and
  `stripe-webhook`-scoped dedup in `idempotency_keys` (ADR-013).
- Location creation is quota-safe under concurrency: `addLocation` takes
  `pg_advisory_xact_lock(hashtext('loc:<billingRestaurantId>'))` before
  counting the group and inserting, so two parallel submits at the limit
  cannot both pass (issue #499).

## Observability

- `trackEvent('location_created', ...)`; subscription lifecycle events on the
  parent.
- `/admin/health` tenant list includes locations; `/admin/revenue` MRR sums
  parent subscriptions.
- Sentry for entitlement/quota misuse inside a group.

## Acceptance criteria

- Business owner creates locations up to `maxLocations`; the next attempt
  returns `limitReached`. Non-Business → `notAvailable`. Non-owner → 403.
- Inside a location, the shell, digest gate, chat gate, stock gate, supplier
  scores and quota card all reflect the **Business** tier (parent), never trial.
- Inside a location, `/billing` shows the group's subscription and cannot
  create a second Stripe customer or subscription.
- Extractions across N locations consume one shared quota pool on the parent.
- Switching lists only member restaurants; invalid/foreign cookies fall back or
  redirect to onboarding.
- Deleting the parent cascades its locations and all their data.
- Business owner's `addLocation` at the limit stays at the limit under
  concurrency: two parallel submits at `maxLocations` insert exactly one
  location, never two (issue #499).
- Tests: `tests/multi-location.test.ts` (switch + addLocation) and
  `tests/settings-add-location.test.ts` (owner gate, group-scoped capacity,
  concurrent-submit safety) plus — when the gaps below are fixed — a
  layout-tier-in-location test, a billing-from-location no-duplicate-subscription
  test, and a shared-quota-pool test.

## Known implementation gaps (recorded 2026-08-13 — do not resolve silently)

The following code paths currently **deviate** from this spec; fixing the code
to match is pending:

1. `(app)/+layout.server.ts:78-80` reads `subscriptions.planTier` scoped to the
   active `rid` instead of the parent — inside a location the whole shell
   resolves to trial features. Fix: resolve via `billingRestaurantId`.
2. `(app)/billing/+page.server.ts` load + `checkout` + `portal` scope to the
   active `rid` — a location shows "trial" and checkout can create a duplicate
   Stripe customer/subscription for the location that the access checks never
   read. Fix: resolve via `billingRestaurantId` and block per-location checkout.
3. `llm-quota.ts` keys `claimMonthlyExtraction` / `releaseMonthlyExtraction` /
   `checkExtractionQuota` on the raw `restaurantId` — consumption is per
   location while the limit is read from the parent. Fix: resolve to the parent
   for one shared pool.
4. `applyTierSettings(newId, tier)` writes a location mirror that goes stale on
   upgrades; once reads resolve to the parent this mirror should be dropped so
   the parent is the single source.

**Resolved 2026-08-27 (issue #499):** the two gaps formerly numbered 4 and 5
here — `addLocation` missing the owner gate, and the capacity check counting
the user's total memberships instead of the group's — are fixed, along with a
third bug the same fix uncovered: the capacity check was check-then-act with
no lock (same class as #244), so two concurrent submits at the limit could
both pass and both insert. `addLocation` now calls `requireOwner`, counts via
`BILLING_PARENT` scoped to the billing group, and does the count + insert
inside a `pg_advisory_xact_lock`-guarded transaction. See rule 6 above, the
idempotency rule below, and `tests/settings-add-location.test.ts`.

## Beta status

Frozen for the MVP private beta (2026-08-29 executive audit, PR #794): adding
a new location is disabled regardless of plan tier unless the `multiLocation`
row in `app_flags` (`beta_feature_multiLocation`, default disabled) is set to
`'true'` — see `docs/03_features/feature_flags.md`. The global flag is ANDed
with the existing `features.multiLocation` tier check in
`(app)/settings/+page.server.ts` (both the page's `multiLocation` value and
the `addLocation` action), so a Business-tier restaurant still needs the
global flag on. Existing locations and the location switcher are unaffected —
only creating a new one is gated. Toggle from `/admin/feature-flags`.

## Non-goals

- **Member invites**: `role = 'member'` and inviting other users is reserved but
  not implemented; the terms page's invite promise (`terms/+page.svelte:90`) is
  currently unmet. Out of scope for this spec until the invite flow exists.
- Cross-group data sharing: locations never share operational data with each
  other or with the parent — only the parent's subscription.

## Related

- `docs/06_decisions/billing/ADR-013-tiers-trial-and-quota.md` — the roll-up
  decision this spec implements.
- `docs/02_product/plans_and_entitlements.md` — tier table and feature gates.
- `docs/03_features/billing.md` — subscription/webhook pipeline.
- `docs/06_decisions/identity/ADR-014-authjs-jwt-sessions-and-active-restaurant.md` —
  active-restaurant resolution.
- `docs/01_architecture/data_schemas_and_relations.md` — `restaurants.parentId`.
