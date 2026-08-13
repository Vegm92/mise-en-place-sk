# Coding Conventions

Actual repository conventions, observed from the implementation. These are
enforced by the lint scripts listed, which run in CI.

## Toolchain

- pnpm (`packageManager: pnpm@10.0.0`), frozen lockfile in CI.
- TypeScript strict via `svelte-check` (`pnpm check`).
- Svelte 5 **runes**: `$state`, `$derived`, `$effect`, `$props`. No legacy
  `$:` blocks, no `export let`.
- Vitest for tests; `vite.config.ts` holds the vitest config.

## Language / style

- No semicolons (ASI style), 4-space tabs, double quotes in TS, single quotes
  in the rare JS script files. (`Prettier`-ish; follow the file you are in.)
- Arrow functions preferred; `async/await` everywhere in server code.
- String formatting uses `String(...)` / template literals; `Number(...)` wraps
  `sql` aggregates (postgres.js returns strings for numerics).

## Structure rules

- Server-only code lives in `src/lib/server/`; shared client code in
  `src/lib/`; UI in `src/lib/components/{mep,mobile,desktop,waitlist,ui,admin}`.
- Database schema is split by area in
  `src/lib/server/schema/{core,extensions,auth}.ts`, re-exported by `schema.ts`.
  Business tables carry `restaurant_id`.
- Route groups: `(app)` authenticated shell, `(admin)` ops shell, top-level
  public pages. Server logic lives in `+page.server.ts`/`+server.ts`, not in
  components.
- Feature logic goes in a `src/lib/server/<feature>.ts` module; routes are thin
  adapters.

## Data access (non-negotiable)

- Every tenant query uses `forTenant(restaurantId).scope(...)` — never a bare
  `eq(table.restaurantId, ...)` (`lint:tenant-scope`).
- No query on a tenant table without a tenant filter (`lint:unscoped-query`).
- No `sql.raw()` (`lint:no-sql-raw`); use `sql\`...\`` templates with bound
  parameters.
- Transactions for multi-step writes; guarded `UPDATE ... WHERE status IN (...)`
  transitions for state machines.

## Statuses and enums

- Statuses are `text` columns with app-level defaults/constants — no Postgres
  enums. Single source for shared value sets: `src/lib/status.ts` (invoice),
  `src/lib/constants.ts` (categories), `billing.ts` (`PlanTier`).

## i18n

- User-facing strings go through `src/lib/i18n.ts` (es-first, es/en). Components
  use `$t(key)`, `$ti(key, vars)`, `$tiv(...)`, `$tp(...)`. Hardcoded strings
  fail CI (`lint:i18n`).

## Comments

- No inline comments in code (`lint:no-comments`). Explanation of *how* a file
  works lives in `docs/CODE_NOTES.md`; explanation of *why* lives in an ADR.

## CSS / theming

- Tailwind CSS 4 utilities + a small amount of component-scoped CSS.
- Split pages render `mobile/*` and `desktop/*` components; CSS (`md:` at
  768px) chooses which shows (ADR-020). Do not add a second breakpoint.
- Theme via CSS variables (dark/light), `svelte.config.js` CSP hash-mode.

## Forms and mutations

- Prefer SvelteKit form actions over bespoke endpoints when the caller is a
  page; use `+server.ts` when a client API is required (chat, trend, uploads…).
- Validate server-side (never trust the client); return `fail(status, data)`
  for recoverable errors and `redirect(303, ...)` for flows.

## Rate limiting

- Public/user/tenant-sensitive actions call `checkRateLimit(key, rpm, ttl?)`
  from `src/lib/server/rate-limiter.ts`; choose the key scope deliberately
  (user vs tenant vs IP) and document it (see open item #440).

## Error handling

- Let loaders degrade via `safe()` (`load-guard.ts`) for admin/revenue reads
  instead of crashing; capture non-fatal failures with Sentry where meaningful.
- Webhook handlers verify signatures before any side effect and dedup by
  PK-insert claim.

## Naming

- Files: kebab-case; types PascalCase; functions camelCase; constants
  SCREAMING_SNAKE; tables snake_case; route params in `[kebab]`.
- Domain terms must match `docs/00_system/terminology.md`.

## Testing conventions

- Tests: `tests/<subject>.test.ts`, Vitest + `tests/helpers/test-db.ts`.
- DB-backed suites require a local Postgres (`DATABASE_TEST_URL`); they skip
  against non-local hosts.
- Mock Gemini via `GenerateFn` (`src/lib/server/extract.ts`), never the SDK.

## Git / commits

- Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`, …) with an
  optional `(scope)` and an issue/PR reference. Follow the log history.
- CI gates must pass before merge (see `testing_strategy.md`).
