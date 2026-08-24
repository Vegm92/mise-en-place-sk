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

## Comments and directives in source

Source files under `src/` carry **no explanatory comments**; anything worth
saying about *why* code is the way it is lives in the per-subsystem `Code notes`
sections (keyed by file and symbol) or in an ADR. The only comments permitted in
source are machine-read directives:

`@ts-expect-error` · `@ts-ignore` · `eslint-*` · `svelte-ignore` ·
`prettier-ignore` · `@vite-ignore` · `c8/v8/istanbul ignore` · `@vitest-*` ·
`/// <reference>` · `tenant-scope-ok:`

These change how a tool behaves, so removing them would change behaviour — they
are not documentation (`lint:no-comments`).

`tenant-scope-ok:` is the project's own directive, read by
`scripts/lint-invariants.mjs`: it is the sanctioned way to wave a deliberately
cross-tenant query past the tenant gate, and the reason must be stated on the
directive itself (ADR-001 / issue #380). Because that reason routinely needs a
sentence, a `tenant-scope-ok:` comment may run onto the lines directly beneath
it — `scripts/check-no-comments.mjs` treats the whole contiguous run as one
directive.

Both linters read the directive names from `scripts/lint-directives.mjs`, so the
gate that requires them and the check that permits them cannot drift apart.

## Appendix — directives kept in source

These comments were deliberately left in the code because a tool reads them.

| File | Line | Directive |
| --- | --- | --- |
| `src/lib/components/TrendChart.svelte` | 14 | `// svelte-ignore state_referenced_locally — intentional: seed once from prop defaults` |
| `src/lib/components/TrendChart.svelte` | 16 | `// svelte-ignore state_referenced_locally — intentional: seed once from prop defaults` |
| `src/lib/components/TrendChart.svelte` | 22 | `// svelte-ignore state_referenced_locally — intentional: seed once from props` |
| `src/lib/components/TrendChart.svelte` | 24 | `// svelte-ignore state_referenced_locally — intentional: seed once from props` |
| `src/lib/components/TrendChart.svelte` | 26 | `// svelte-ignore state_referenced_locally — intentional: seed once from props` |
| `src/lib/components/mep/NotificationBell.svelte` | 21 | `// svelte-ignore state_referenced_locally — intentional: seed once from prop` |
| `src/lib/server/rate-limiter.ts` | 12 | `// eslint-disable-next-line @typescript-eslint/no-explicit-any` |
| `src/lib/server/rate-limiter.ts` | 14 | `// eslint-disable-next-line @typescript-eslint/no-explicit-any` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 85 | `// svelte-ignore state_referenced_locally — reading the initial value is the point` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 93 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 95 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 97 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 99 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 101 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/chat/+page.svelte` | 17 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/chat/+page.svelte` | 19 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |

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

## Code notes

### `src/lib/constants.ts`

**_module level_**

- Category colours deliberately do not live here. They are in `$lib/colors`, backed by the `--mep-cat-*` custom properties in `app.css`, so they follow the active theme. They were moved out of this module because it is imported by load functions, and a colour map here is what let styling leak server-side.

**`const UNCATEGORIZED_CATEGORY`**

- Canonical category taxonomy — single source of truth for the whole app. Suppliers (`suppliers.category`) and budgets (`category_budgets.category`) MUST store one of these exact strings; a guard test (tests/category-taxonomy.test.ts) enforces this — do not diverge.
- Bucket for suppliers nobody has categorised (issue #301). Stored, not fabricated per query: `getOrCreateSupplierId` writes it on creation, the budget check and analytics coalesce legacy NULLs into it, and the UI renders it as "Sin categoría" / "Uncategorised" rather than as a literal category.

**`const MIN_CATEGORY_CONFIDENCE`**

- Confidence floor for a machine-proposed category (issue #315), `0.6`. Matches the "below 0.60 = poor quality, missing, or illegible" band the extraction prompt already defines: under it a coin-flip category is worse than an honest "Other".

**`function categoryKey`**

- Case- and accent-insensitive lookup key, so 'lacteos' finds 'Lácteos'.

**`function resolveSupplierCategory`**

- The only door into `suppliers.category` for a machine-proposed value (issue #315). Extraction asks Gemini for one exact string from VALID_CATEGORIES, but a model will also return a translation, an invented category, or an unaccented lower-cased variant; this maps a recognisable spelling back onto its canonical string and turns everything else — including a low-confidence guess — into the uncategorised bucket, so a bad guess degrades into "Other" instead of poisoning the taxonomy budgets group on. Always returns a member of VALID_CATEGORIES; never null, never a new string. Absent/non-numeric confidence (older prompt cache, dropped field) falls back to trusting the taxonomy match.

**`function categorySlug`**

- i18n-key suffix for a canonical category (issue #338): accent-stripped, lower-cased, non-alphanumerics collapsed to hyphens, so 'Café y Bebidas Calientes' → 'cafe-y-bebidas-calientes'. Storage still uses the canonical Spanish string; this only builds the `category.*` lookup key used at display time by `tcat`.

### `src/lib/i18n.ts`

**`property es`**

- Spanish string table — one string table, es-first (ADR-021). Grouped by screen: boundary/nav/actions/shell, dashboard, invoice list, table headers, status labels, chat, suppliers, budgets, reminders, spend/prices analytics, settings (multi-location #290, WhatsApp #319/#320, profile #293), upload/confirm/extract/edit/export, login, forgot-password (#284), detail, pending review, wizard, mobile/desktop variants, coach tour, products, admin, alerts. Pluralized/interpolated forms (issue #146). Upload action errors are returned as keys by the server (issue #294).

**`property en`**

- English table mirroring `es`; same grouping. Everything user-facing goes through this module; hardcoded strings fail CI (`lint:i18n`).

**`const ti`**

- Interpolating translator: resolves a key and substitutes named placeholders written as `{name}` in the translation table. Reactive — use `$ti(...)` in components so it follows locale changes.

**`const tcat`**

- Display-time translator for canonical category values (issue #338). VALID_CATEGORIES is a Spanish-language taxonomy that doubles as stored data and as the grouping key for budgets and analytics, so it must never be translated on the way in; this resolves `category.<slug>` at render time instead — the only place the taxonomy is allowed to change language. Unknown values (a custom budget category, or a taxonomy entry added before its translations) fall back to the canonical string, never to a raw i18n key.

**`const tiv`**

- `ti` plus category awareness: interpolates as usual, but routes a var named `category` through `tcat` first. Notification and alert payloads (`messageVars`) carry the canonical category so the stored row stays language-neutral; rendering sites (NotificationBell, AlertRow) use `$tiv` instead of `$ti` so this cannot be forgotten per message type.

**`const tp`**

- Pluralizing translator: picks the right plural form for `count` and interpolates the count as `{n}`. The optional `.zero` form lets a language phrase the empty case naturally ("No invoices" / "Sin facturas"); when absent, count 0 falls back to the `.other` form.

### `src/lib/status.ts`

**`function confColor`**

- Confidence score → CSS colour variable.
