# Feature Spec — Beta feature flags

## Purpose

Let the founder freeze a named set of built-but-not-MVP features site-wide
during the private beta, and reactivate any one of them from `/admin` without
a deploy. Introduced from the 2026-08-29 executive audit (PR #794): recipes,
stock, budgets and multi-location were flagged as scope that distracts from
validating the core review loop before the first external tester.

## Actors

- Platform admin (`isAdminUser` — `AUTH_ADMIN_EMAIL` allowlist): toggles flags
  from `/admin/feature-flags`.
- Every request to a gated route: read-only consumer of the current flag
  state.

## Preconditions

- None. Flags default to disabled (no `app_flags` row for a given key reads
  as `false`), matching the audit's freeze decision without a migration or
  a backfill.

## Inputs

- `/admin/feature-flags` `toggle` action: `key` (one of the four flag keys),
  `enabled` (`'true'` | `'false'`).

## Outputs

- `app_flags` rows, one per flag, keyed `beta_feature_<key>` (reusing the
  table and `getFlag`/`setFlag` helpers that already back `access_open`).

## Business rules

- **Four flags, one shape.** `BetaFeatureKey = 'recipes' | 'stock' | 'budgets'
  | 'multiLocation'` (`src/lib/server/feature-flags.ts`). Each is an
  independent on/off switch; there is no partial or per-restaurant override —
  a flag is global.
- **Default is disabled.** `getFlag()` returns `null` for a key with no row;
  `isBetaFeatureEnabled` treats anything other than the literal string
  `'true'` as disabled. Nothing needs seeding for the freeze to take effect.
- **Enforcement is additive, not a replacement for plan-tier gating.** `stock`
  and `multiLocation` already had a paid-tier gate (`TierConfig.features` /
  `ROUTE_POLICY`); the beta flag is ANDed on top of that gate at its existing
  call sites, so a Business-tier restaurant still needs both the plan *and*
  the beta flag. `recipes` and `budgets` had no gate before this — they get a
  route-level guard only, no plan-tier concept.
- **Route enforcement lives in `hooks.server.ts`.** `enforceFeatureFlag`
  matches `/recipes`, `/budgets` and `/api/stock-levels` by path prefix and
  runs inside `appHandle`, after `enforceAuth` and before
  `entitlementHandle` — so a disabled beta flag short-circuits before the
  plan-tier check ever runs. Pages redirect to `/dashboard`; `/api/*` returns
  `404 { error: 'feature_disabled' }`. This intentionally does **not** reuse
  `ROUTE_POLICY`/`entitlementHandle`'s `deny-feature` path, which redirects to
  `/billing?upgrade=...` — that UX is for a paid-plan upsell, not a temporary
  admin freeze with nothing to buy.
- **`multiLocation` has no dedicated route to guard** (creation happens via a
  settings form action), so it is ANDed directly into
  `(app)/settings/+page.server.ts`'s `multiLocation` value and the
  `addLocation` action's existing `features.multiLocation` check, rather than
  routed through `hooks.server.ts`.
- **Nav visibility mirrors route access.** `(app)/+layout.server.ts` loads
  `getBetaFeatureFlags()` once per request and returns `betaFeatures: {
  recipes, budgets }`; `+layout.svelte` omits the corresponding nav item
  entirely (not the existing lock-icon/upgrade-modal treatment used for
  paid-tier features) and excludes the `/budgets` tour step from
  `TOUR_PAGES` when disabled.

## Data dependencies

- `app_flags` (`schema.ts:500`) — no new table or migration.

## API dependencies

- `/admin/feature-flags` (`(admin)` route group, `isAdminUser`-gated by the
  group's `+layout.server.ts`).

## UI dependencies

- `/admin/feature-flags/+page.svelte` — one row per flag (name, description,
  on/off state, toggle button), styled like `/admin/access`.
- `(app)/+layout.svelte` nav (recipes/budgets items), tour gating.
- `(app)/settings/+page.svelte` (`showLocations`, add-location form) —
  unchanged; already derives from the `multiLocation` value this spec ANDs.

## Background dependencies

- None.

## External dependencies

- None.

## Validation

- `toggle` action rejects any `key` not in `BETA_FEATURE_FLAGS` with `422`.

## Error states

- Non-admin POST to `?/toggle` → `403 { error: 'forbidden' }`.
- Disabled route hit directly → `303` to `/dashboard` (pages) or `404` (API).

## Edge cases

- A restaurant with existing locations when `multiLocation` is off: the
  location switcher and existing locations are untouched — only
  **creating a new one** is blocked, so nothing already provisioned breaks.
- A user mid-onboarding-tour when `budgets` is disabled: the tour skips the
  `/budgets` step via the same `visibleTourPages` filter used for rendering
  the tour overlay, so it never lands on a page it will immediately redirect
  away from.

## Security rules

- Toggling requires `isAdminUser` — the same allowlist gate as the rest of
  `/admin`, checked in the `+layout.server.ts` guard and again inside the
  `toggle` action (defense in depth, matching `/admin/access`).
- `app_flags` reads are unscoped by design (global, not tenant data) —
  consistent with the existing `access_open` flag.

## Idempotency rules

- `setBetaFeatureEnabled` upserts (`onConflictDoUpdate` on `app_flags.key`);
  toggling the same state twice is a no-op write.

## Observability

- None dedicated; flag state is visible on `/admin/feature-flags` itself.

## Acceptance criteria

- With a flag disabled (the default), its route(s) are unreachable and its
  nav entry (if any) does not render, for every plan tier.
- Setting the flag to enabled from `/admin/feature-flags` makes the route and
  nav entry immediately available on the next request — no deploy, no
  restart.
- `multiLocation` enabled still requires the Business-tier plan check to pass
  (the two gates are ANDed, neither alone is sufficient).

## Related

- `docs/05_operations/ceo_audit_2026-08-29.md` — the audit that named these
  four features as MVP-beta scope to freeze.
- `docs/03_features/recipes.md`, `stock.md`, `budgets.md`,
  `multi_locations.md` — each carries a "Beta status" section pointing back
  here.

## Code notes

### `src/lib/server/feature-flags.ts`

`BetaFeatureKey`, `BETA_FEATURE_FLAGS` (the four definitions, each carrying
i18n key names for the admin UI), `isBetaFeatureEnabled`,
`getBetaFeatureFlags` (all four, one `Promise.all`), `setBetaFeatureEnabled`.
Thin wrapper over `getFlag`/`setFlag` from `app-flags.ts`; flag keys on disk
are prefixed `beta_feature_` to keep them visually grouped in the `app_flags`
table next to `access_open`.

### `src/hooks.server.ts`

`BETA_FEATURE_ROUTES` (prefix → flag map) and `enforceFeatureFlag`, called
from `appHandle` right after `enforceAuth`. Runs before `entitlementHandle`
in the `sequence(...)` at the bottom of the file, so a disabled beta flag
wins over whatever the plan tier would otherwise allow.

### `src/routes/(admin)/admin/feature-flags/+page.server.ts` + `+page.svelte`

Load returns the four definitions plus their current state (`safe(...)`
degrades to all-disabled on a DB hiccup, matching `/admin/access`'s
pattern); the `toggle` action flips one key, admin-gated twice.
