# ADR-023 — Entitlement Is Declared Per Route, Enforced In One Hook

**Status:** Active
**Feature:** Billing
**Date:** 2026-08-17
**Issue:** [#488](https://github.com/Vegm92/mise-en-place-sk/issues/488)

## Context

[ADR-013](./ADR-013-tiers-trial-and-quota.md) settled *what* the truth is: the
`subscriptions` table owns entitlement and `TIERS` declares six feature booleans
per tier. It did not say *where* that truth gets checked, and the answer in
practice was "wherever the handler author remembered".

That failed. `GET /api/stock-levels` enforced `stockTracking`; the `POST` in the
same file did not, so trial and Starter tenants could create and update stock
levels indefinitely. Two more instances of the same shape existed:
`digest/+page.server.ts` gated its `load` on `weeklyDigest` and left its
`dismissDigest` action open, and `runStockForecast` ran in the invoice-save path
for every tenant, so unentitled tenants received stock alerts through
`systemNotifications` without ever seeing the list.

The leak was not the interesting part. Seven distinct refusal contracts had grown
up around these checks — thrown `error(403)`, thrown `error(401)`,
`redirect(303,'/billing?upgrade=…')`, `fail(403,{section,error})`, raw
`json({error},{status:402})`, two hand-built `new Response(JSON.stringify(…))` in
`hooks.server.ts`, and a silent `markFailed()` in the extraction worker. Three
separate code paths independently recomputed `TIERS[tier].features` per request
and none cached. A per-handler convention cannot be audited, so the drift was
guaranteed to recur.

**Alternatives rejected:**

- **A shared `requireFeature(rid, feature)` helper called from each handler.**
  This is what issue #488 originally proposed. It removes the duplicated body of
  the check but not the thing that broke: the author still has to remember to
  call it, in every handler, for every verb. A gate you can forget is the defect.
- **Enforcement in `+layout.server.ts`.** Cheap, since the `(app)` layout already
  loads `features`. Rejected because layout `load` is not guaranteed to run
  before every leaf — it does not run for `+server.ts` routes at all, which is
  where the actual leak was.
- **Casbin / OSO / OpenFGA / Cerbos.** These solve relationship-based
  authorization — "can user X see document Y" over a permission graph. Ours is a
  flat `(tenant, tier) → boolean` lookup. A policy engine would add a dependency,
  and for OpenFGA-style services a network hop, to answer a question a const map
  already answers.
- **Runtime fail-closed, where an unclassified route is denied.** The strongest
  guarantee and the standard security posture, but on a live app any route missed
  on day one becomes a 403 for paying customers. Rejected in favour of the same
  guarantee moved to compile time, where the cost of being wrong is a red build
  instead of an outage.

## Decision

**A route declares the entitlement it requires; one `handle` hook enforces it for
every request to that route.**

`handle` runs for every request SvelteKit serves — page loads, form actions and
`+server.ts` endpoints alike, with no separate hook per verb. Keying on
`event.route.id` therefore covers `GET`, `POST` and every action of a route from
a single entry. The sibling-verb drift that caused #488 stops being a bug that
was fixed and becomes a state the code cannot express.

`src/lib/server/entitlements.ts` holds the declaration and the pure decision,
following the shape already established by `access-gate.ts`:

```ts
export type RoutePolicy = 'open' | { feature?: FeatureKey; access?: true };

export const ROUTE_POLICY = {
  '/(app)/api/stock-levels':  { feature: 'stockTracking' },
  '/(app)/digest':            { feature: 'weeklyDigest', access: true },
  '/(app)/analytics/prices':  { feature: 'supplierScores' },
  '/(app)/api/chat':          { feature: 'aiAssistant', access: true },
  '/(app)/dashboard':         'open',
  // …every route id, explicitly
} satisfies Record<RouteId, RoutePolicy>;

export function resolveEntitlement(input): EntitlementDecision;
export function refusalFor(decision, isApiPath): EntitlementRefusal | null;
```

`'open'` is a written value, not an omission, so a route being ungated is a
statement someone made rather than a line nobody wrote.

### Fail closed at compile time

`satisfies Record<RouteId, RoutePolicy>` is checked against `RouteId` from
`$app/types`, the union SvelteKit generates from the actual route tree. Adding a
route without classifying it fails `pnpm check`:

```
Property '"/(app)/reminders"' is missing in type '{ … }'
  but required in type 'Record<"/" | "/(app)" | … , RoutePolicy>'
```

This is the [ADR-022](../conventions/ADR-022-invariants-enforced-in-ci.md)
posture — the rule is a gate, not a convention — with the gate provided by the
type system rather than a lint script.

### Two refusal shapes, not seven

`refusalFor` maps a decision onto the wire by path kind: `/api/*` answers `402`
with `{ error: 'plan_upgrade_required', feature }` or `{ error: 'trial_expired' }`;
everything else redirects `303` to `/billing?upgrade=<slug>`. The `402` shape is
not new — it is the contract `ChatFab.svelte` and `chat/+page.svelte` already
parse, promoted from a chat-only quirk to the app-wide API answer.

### One resolver

`getEntitlements(restaurantId)` replaces the three overlapping resolvers with a
single `subscriptions` read, resolved through `billingRestaurantId()`.
`getPlanTier`, `getTierFeatures` and `getAccessState` delegate to it.
`locals.entitlements()` is a lazy memoized getter so the hook, the `(app)` layout
and any handler share one lookup per request.

## Consequences

**What improves.** A gated route cannot have an ungated verb. A new route cannot
ship unclassified. Adding a gate is one line in one file. Settings load dropped
from four tier queries to one. Two latent multi-location bugs closed as a side
effect: the `(app)` layout and the `/billing` page each queried `subscriptions`
scoped to the active location rather than the billing parent, so a child location
rendered `planTier: 'trial'` with every feature off while the gates — which do
resolve the parent — allowed them.

**What is explicitly not handled: route-id gating is route-granular, not
action-granular.** Three sites keep imperative checks, and this is the real cost
of the decision:

| Site | Why it cannot move into the hook |
|---|---|
| `settings/+page.server.ts` `addLocation` | Needs `multiLocation` on one action of eight. A route-level gate would lock the whole settings page, and `fail(403,{section,error})` is what renders the error inline on the location field rather than replacing the page. |
| `(app)/+page.server.ts` `upload` | Gates access on the action only. The `load` deliberately renders for a trial-expired tenant so they see the upload page with an upgrade banner; gating the route would redirect them away from it. |
| `invoice-save.ts` `runStockForecast`, `alerts.ts` `runWeeklyDigestJob` | Not HTTP requests. The forecast now checks `features.stockTracking` inline; the cron already filters a tenant list that carries `planTier`, and an `rid`-based helper would add a query per tenant. |

A future route needing a per-action gate has to reach for the same imperative
escape hatch. If that set grows past these three, the policy value should gain a
per-action variant rather than each site inventing its own check again.

**Other costs.** The two gated API routes now perform the entitlement read before
their own `checkRateLimit` call, since the hook runs first — an authenticated
tenant can spend two indexed primary-key lookups per request ahead of the
limiter. `event.route.id` is trustworthy here only because the app has no
`.remote.ts` files; the SvelteKit docs warn that `route`/`params`/`url` inside
`handle` describe the *calling* page for client-invoked remote functions, so
adopting remote functions would require re-checking entitlement inside those
functions rather than relying on the hook alone.

**Behaviour change.** A tenant who is both unentitled and out of access now sees
the access reason rather than the feature reason. `api/chat` already ordered it
that way; `digest` did not.

**Gates holding this in place.** `pnpm check` enforces the exhaustive map.
`tests/entitlements.test.ts` covers the decision matrix over four tiers and six
features, and asserts every redirect target stays `'open'` so the gate cannot
deadlock against `/billing`. `tests/entitlement-routes.test.ts` walks
`src/routes` independently of the generated `RouteId` union, asserts the hook is
still registered in the `handle` sequence — policy tests all pass if the hook is
dropped — and asserts every gated page slug has copy in both locales.

## Related

- [ADR-013](./ADR-013-tiers-trial-and-quota.md) — establishes that Postgres owns
  entitlement and `TIERS` declares the features; this decides where the check runs
- [ADR-022](../conventions/ADR-022-invariants-enforced-in-ci.md) — the same
  "make it a gate, not a convention" posture, here via the type system
- [ADR-021](../experience/ADR-021-bilingual-single-string-table.md) — why the
  refusal carries an i18n key and both locales are asserted in a test
- [ADR-014](../identity/ADR-014-authjs-jwt-sessions-and-active-restaurant.md) —
  supplies `locals.restaurantId`, which the gate resolves to a billing restaurant
