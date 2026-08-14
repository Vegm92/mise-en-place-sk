# API Change Procedure

The SvelteKit server IS the backend (no separate API service). Routes are thin
adapters over `src/lib/server/*` modules. This document covers adding or
changing server routes and endpoints.

## Route conventions

- Pages: `+page.svelte` + `+page.server.ts` (load + form actions) under the
  `(app)` group (authenticated) or public top-level routes.
- APIs for client use: `+server.ts` under `src/routes/api/*` or
  `src/routes/(app)/api/*` (JSON in/out, HTTP status codes).
- Admin: `(admin)` group, gated by `isAdminUser()`.
- Thin adapters: validation + `locals` plumbing in the route; business logic in
  the feature module. No business logic sprawl in route files.

## Adding/editing an endpoint — checklist

1. **Auth & scope**: resolve `locals.user` / `locals.restaurantId`; return
   401 (unauthenticated API), 403 (no tenant / not owner), 402 (no
   entitlement). Check the feature spec's Security rules.
2. **Validation**: hand-rolled guards — type cast, trim, length caps,
   whitelist. Never trust the client.
3. **Rate limit**: decide the key scope (user / restaurant / IP) and call
   `checkRateLimit(key, rpm)`. Document the scope choice (open item #440).
4. **Idempotency**: any endpoint that creates things (or is retried by a
   client/webhook) needs a claim: `claimIdempotencyKey(scope, key)` for
   anything replayable, `claimRequest` for form submits, `onConflictDoNothing`
   for natural keys. A new integration takes a new scope — never a new table
   (#389).
5. **Errors**: JSON `{ error }` with a correct status; form actions use
   `fail(status, data)`. Keep SvelteKit's 5xx convention for unexpected errors.
6. **i18n**: user-visible messages come from `src/lib/i18n.ts` keys, never
   inline strings (`lint:i18n`).
7. **Security headers / CSP**: new routes inherit `hooks.server.ts` defaults;
   only deviate with an ADR'd reason (e.g. PDF `<iframe>` routes).

## Backward compatibility

- Prefer adding params/routes over changing response shapes. When breaking, bump
  the route (e.g. `/api/v2/...`) or the client + server together in one PR —
  the app is deployed as a single unit, so break both sides atomically.
- Route params are kebab-case; document required vs optional in the route
  `+server.ts` JSDoc-free fashion (see CODE_NOTES).

## Testing

- Unit-test the feature module; integration-test the route where DB is
  involved (local Postgres).
- Regenerate routes coverage in the `tests/` suites listed in the feature spec.
- Run `pnpm check` + lint gates + `pnpm test` before merge.

## Documentation event

- Changing a route/endpoint updates the affected feature spec (`docs/03_features/`)
  and `docs/01_architecture/routing_and_navigation.md`. If the change is a
  contract change, note it in CODE_NOTES.
