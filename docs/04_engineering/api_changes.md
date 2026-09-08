---
tags: [mep, engineering]
related: "[[CONTEXT]]"
---

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
   401 (unauthenticated API), 409 (no active tenant — the same status the
   tenant gate in `hooks.server.ts` already returns for that condition), 403
   (not a member / not owner), 402 (no entitlement). Check the feature spec's
   Security rules.
2. **Validation**: a declared `valibot` schema, never hand-rolled guards. Call
   `parseJson(schema, request)` (`src/lib/server/public-form-action.ts`, beside
   `parseForm`) and return `invalidBody(parsed, status)`
   (`src/lib/server/api-response.ts`) on failure — the schema's own message
   becomes the `error` string, so put the user-facing wording there.
   `pnpm lint:json-body-schema` fails a new `await request.json()` in a
   `+server.ts` (issue #1006).
3. **Rate limit**: for an authenticated route, call `rateLimitScoped({ scope, name, max }, identity)`
   (`src/lib/server/rate-limit-scope.ts`) — `scope: 'tenant'` for paid/metered
   capacity or a shared tenant resource, `scope: 'user'` for a per-person
   safety limit or personal dashboard (ADR-029). For an unauthenticated route,
   use `publicFormAction`'s `limits` option or an IP key directly.
4. **Idempotency**: any endpoint that creates things (or is retried by a
   client/webhook) needs a claim: `claimIdempotencyKey(scope, key)` for
   anything replayable, `claimRequest` for form submits, `onConflictDoNothing`
   for natural keys. A new integration takes a new scope — never a new table
   (#389). A mutating JSON endpoint takes an optional `idempotency_key` (a
   UUID) on its schema — add `idempotencyKeyField` and wrap the write in
   `withIdempotency(key, restaurantId, run)`
   (`src/lib/server/api-idempotency.ts`). A replay returns
   `{ ok: true, replay: true }`; a refusal releases the key so a corrected
   retry is not swallowed (issue #1008).
5. **Errors**: one envelope. **Return** `apiError(status, message)`
   (`src/lib/server/api-response.ts`) — JSON `{ error }` with the status —
   rather than throwing SvelteKit's `error()`, whose `{ message }` shape a
   client then has to parse a second way (issue #1005). Form actions keep
   `fail(status, data)`; that is SvelteKit's contract, not a third choice.
   Keep SvelteKit's 5xx convention for unexpected errors. Statuses are
   settled by the hook that guards the same condition: no tenant is `409`
   (`hooks.server.ts`), no entitlement is `402`. `/api/upload/[id]/[file]` is
   the documented exception — it streams a file into an `<iframe>`, so its
   failures are rendered by the browser rather than parsed.
6. **List responses**: never return a set that grows without limit. Fetch
   `LIST_ROW_CAP + 1` (`src/lib/server/env.ts`) and return a `truncated`
   flag, or take a bound from the query itself (a date range, one recipe).
   The invoice export's `EXPORT_ROW_CAP + 1` is the reference shape
   (issue #1007).
7. **i18n**: user-visible messages come from `src/lib/i18n.ts` keys, never
   inline strings (`lint:i18n`).
8. **Security headers / CSP**: new routes inherit `hooks.server.ts` defaults;
   only deviate with an ADR'd reason (e.g. PDF `<iframe>` routes).

## Backward compatibility

- Prefer adding params/routes over changing response shapes. When breaking, bump
  the route (e.g. `/api/v2/...`) or the client + server together in one PR —
  the app is deployed as a single unit, so break both sides atomically.
- Route params are kebab-case; document required vs optional in the route
  `+server.ts` comment-free fashion (see the `## Code notes` section).

## Testing

- Unit-test the feature module; integration-test the route where DB is
  involved (local Postgres).
- Regenerate routes coverage in the `tests/` suites listed in the feature spec.
- Run `pnpm check` + lint gates + `pnpm test` before merge.

## Documentation event

- Changing a route/endpoint updates the affected feature spec (`docs/03_features/`)
  and `docs/01_architecture/routing_and_navigation.md`. If the change is a
  contract change, note it in the relevant `## Code notes` section.
