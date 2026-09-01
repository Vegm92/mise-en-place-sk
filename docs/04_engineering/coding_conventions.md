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
- Database schema lives in one file, `src/lib/server/schema.ts`.
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
- Going through the table is not enough — the key has to be *in* it, or the UI
  renders the raw key. `lint:i18n` resolves every literal key passed to
  `$t`/`$ti`/`$tiv`/`$tp` against both locale tables and fails on a missing one
  (issue #661). Keys assembled at runtime (`$t(row.labelKey)`, ``$t(`a.${b}`)``)
  cannot be resolved statically and are skipped; cover those with a test that
  derives the key list from its source, as `tests/i18n.test.ts` does.

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

## Duplication on new code

SonarCloud's Quality Gate fails a PR whose new/changed lines are more than 3%
duplicated against anything else in the codebase (`New Code Duplication`).
It runs as Automatic Analysis (`.sonarcloud.properties`, not a CI step), so it
only reports back after a push — a round trip that took five pushes to close
out on PR #832, once for the actual gate finding and repeatedly for
mis-diagnosing which lines it meant.

`pnpm lint:duplication` (`scripts/check-duplication.mjs`) catches the common
case before that round trip: it shells out to `jscpd` (an independent clone
detector — not SonarSource's proprietary one) over `src/` and `tests/`, then
intersects the reported clones with the lines the current branch actually
added versus `--base` (default `origin/main`), the same "new code" definition
SonarCloud uses. It's wired into CI as its own step, ahead of the type check,
so a PR fails fast in the `ci` job instead of waiting on the separate
SonarCloud check to come back red.

It will not agree with SonarCloud's exact percentage — different detector,
and it does not parse `.svelte` files the way it does `.ts`/`.js`. Treat a
pass as "very likely fine", not a guarantee; a fail is real work to do, not a
tool quirk to route around. The two lessons PR #832 actually cost:

- **A brand-new test file duplicates whatever fixture boilerplate it
  re-derives**, even from a file it never imports. `tests/` already carries
  the same `fakeItem`/`vi.mock('.../db', …)` shape across a dozen files by
  convention; a new test that needs the same shape should extend an existing
  DB-backed test file (a new `describe` block, reusing its fixtures) rather
  than starting a new file that reproduces them.
- **Wrapping several different calls in the same small scaffold** (`try`/
  `catch`, a retry wrapper, a per-effect isolation helper — see
  [ADR-008](../06_decisions/invoicing/ADR-008-single-invoice-write-path.md))
  turns previously-varied lines into near-identical ones; the fix was a data
  table plus one loop, one call site instead of six near-duplicate ones —
  which reads better regardless of the gate.

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
- Public/unauthenticated form actions derive their typed input from a
  `valibot` schema (`publicFormAction`'s `schema` option, or its `parseForm`
  helper directly) rather than casting `form.get(...) as string` — that cast
  bypasses validation, since `FormData.get()` genuinely returns `string |
  File | null` (issue #844; `docs/04_engineering/security_rules.md`).
  `pnpm lint:form-get-cast` bans any occurrence of that cast in
  `+page.server.ts` (`scripts/lint-invariants.mjs`'s `FORM_GET_CAST_ALLOWLIST`
  is now empty — every route is converted).

## Rate limiting

- Authenticated actions call `rateLimitScoped({ scope: 'tenant' | 'user', name, max, windowSeconds? }, { userId?, restaurantId? })`
  from `src/lib/server/rate-limit-scope.ts` — `tenant` for paid/metered
  capacity and shared tenant resources, `user` for per-person safety limits
  and personal dashboards; see ADR-029 for the rule and the full site audit.
  Public/unauthenticated flows use `checkRateLimit(key, rpm, ttl?)`
  (`src/lib/server/rate-limiter.ts`) directly via `publicFormAction` or an
  IP key — `rateLimitScoped()` is for the authenticated case only.
  `tests/rate-limit-scope-enforcement.test.ts` fails the build on a new
  direct `checkRateLimit()` call site that isn't a documented exception.

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

**`function resolveCategory`**

- The only door into `suppliers.category` **and `products.category`** for a machine-proposed value (issue #315; renamed from `resolveSupplierCategory` in ADR-027 — it only validates against the taxonomy and was never supplier-specific). Extraction asks Gemini for one exact string from VALID_CATEGORIES, but a model will also return a translation, an invented category, or an unaccented lower-cased variant; this maps a recognisable spelling back onto its canonical string and turns everything else — including a low-confidence guess — into the uncategorised bucket, so a bad guess degrades into "Other" instead of poisoning the taxonomy budgets group on. Always returns a member of VALID_CATEGORIES; never null, never a new string. Absent/non-numeric confidence (older prompt cache, dropped field) falls back to trusting the taxonomy match.

**`function categorySlug`**

- i18n-key suffix for a canonical category (issue #338): accent-stripped, lower-cased, non-alphanumerics collapsed to hyphens, so 'Café y Bebidas Calientes' → 'cafe-y-bebidas-calientes'. Storage still uses the canonical Spanish string; this only builds the `category.*` lookup key used at display time by `tcat`.

### `src/lib/messages/es.ts`, `src/lib/messages/en.ts`

- The catalog's actual data (issue #841 — was one `es`/`en` object literal inside `i18n-messages.ts`, ~2650 lines, 4508 keys, that shipped to every client regardless of locale: 247.7 KB raw / 74.8 KB gzip in one shared chunk pulled in by all 81 components importing `$lib/i18n`, because indexing `translations[locale]` at runtime gave the bundler no static boundary to split on). Splitting the data into a file per locale gives Rollup that boundary: each file is now reached only through a dynamic `import()` in `i18n.ts`, so it code-splits into its own chunk.
- Each file is one `export default { 'key': 'value', ... } satisfies Record<string, string>` — plain data, same ~2458 keys per locale, generated by extracting the old file's two blocks verbatim (not hand-retyped). Grouped by screen, same order as before: boundary/nav/actions/shell, dashboard, invoice list, table headers, status labels, chat, suppliers, budgets, reminders, spend/prices analytics, settings, upload/confirm/extract/edit/export, login, detail, pending review, wizard, mobile/desktop variants, coach tour, products, admin, alerts.
- `en.ts` types its object as `satisfies Record<keyof typeof es, string>` — importing `es`'s key union as a type only (erased at build, no runtime coupling) so a key present in one locale and not the other is a compile error, not a silent gap caught only by `lint:i18n`'s key-resolution pass.

### `src/lib/i18n-messages.ts`

- Server-safe, both-locales-at-once compatibility surface: `translations = { es, en }` (statically imports both message files) plus `renderTemplate(loc, key, vars)`. Both locales in one object is fine here — this module is never imported by a component that only needs one locale's worth of bytes. It backs three kinds of caller, none of which can work off a lazily-loaded single-locale table: server code that writes a notification/alert message in an arbitrary recipient's locale (`alerts.ts`, `billing.ts`, `products.ts`, `invoice-save.ts`, `whatsapp/jobs.ts` — server bundle, not client bytes); `src/lib/i18n-context.ts`'s request-scoped translator for the public marketing surface (`LandingPage.svelte`, used only by `/waitlist` and `/l/[variant]`, ADR-033 — its own route chunk, not the app-wide shared one, and needs the request's resolved locale synchronously during SSR, which a `messages/<locale>.ts` dynamic import cannot give it); and `Locale`/`TranslationKey`/`WaitlistKey`, re-exported from here so nothing importing them needs to know the data moved.
- `renderTemplate` and `translations` are also re-exported from `$lib/i18n` for the one existing caller that imported them from there (`(app)/recipes/[id]/sheet/+page.server.ts`) — server-only, so the re-export costs nothing client-side.

### `src/lib/i18n.ts`

- Runtime data now comes from `messageLoaders: Record<Locale, () => Promise<{default: Record<string,string>}>>` (`() => import('./messages/es')` / `en`), not a statically-imported `translations` object — that dynamic `import()` is what gives Vite the chunk boundary. `messages` is a new writable holding the *active* locale's flat table; `t` is `derived([locale, messages], ...)`, replacing the old `derived(locale, ...)` that indexed into the merged object.
- `applyLocale(loc)`, wired via `locale.subscribe`, is a small cache (`messageCache`): first request for a locale awaits the dynamic import and populates the cache; every later switch to an already-cached locale calls `messages.set(cached)` synchronously — no re-fetch, no re-await, so runtime language switching inside a session that has already touched both locales is instant. Only the very first load of a locale within a session is async.
- `setMessages(loc, table)` is the synchronous seam `+layout.ts`/`+layout.svelte` use to hand the root layout's already-awaited `load()` result straight into the store before the component tree renders, so SSR/first-paint never sees an empty `messages = {}` and a raw-key flash.
- `loadAllMessages()` awaits both locales into the cache without switching the active one — used by test files that call `locale.set()` synchronously and assert immediately after (the store itself cannot make that synchronous for an *uncached* locale; a real dynamic `import()` always defers at least one microtask, by spec).
- SSR behaviour is unchanged from before the split (ADR-021: the module store is client-only, always renders Spanish server-side, `initLocale()` corrects it in `onMount`). `+layout.ts` therefore always awaits the **es** loader regardless of the request's resolved locale — matching what the `locale` store renders during SSR — rather than `data.locale`. Two consequences worth naming: (1) a returning Spanish-cookie session gets the full byte saving on every load (majority locale, ADR-021's own framing); (2) a first-load English-cookie session still pays for the es chunk (needed for SSR-consistent hydration) *and* the en chunk (fetched once `initLocale` corrects the store in `onMount`) — no net saving on that specific cold load, though nothing worse than before either. Feeding `messages` from `data.locale` instead would fetch the right chunk immediately, but would also desynchronise `$locale` from `$messages` during SSR (`$locale` stays `'es'` until `onMount`), and dozens of components format currency/dates off `$locale` directly (`fmtEur(n, $locale)`, `toLocaleDateString($locale, …)`) — SSR would then render English prose next to Spanish-formatted numbers. Fixing that fully means extending ADR-033's request-scoped locale to the authenticated app, which is a bigger, deliberate call belonging to a separate issue, not a side effect of this one.

**`const ti`**

- Interpolating translator: resolves a key and substitutes named placeholders written as `{name}` in the translation table. Reactive — use `$ti(...)` in components so it follows locale changes.

**`const tcat`**

- Display-time translator for canonical category values (issue #338). VALID_CATEGORIES is a Spanish-language taxonomy that doubles as stored data and as the grouping key for budgets and analytics, so it must never be translated on the way in; this resolves `category.<slug>` at render time instead — the only place the taxonomy is allowed to change language. Unknown values (a custom budget category, or a taxonomy entry added before its translations) fall back to the canonical string, never to a raw i18n key.

**`const tiv`**

- `ti` plus category awareness: interpolates as usual, but routes a var named `category` through `tcat` first. Notification and alert payloads (`messageVars`) carry the canonical category so the stored row stays language-neutral; rendering sites (NotificationBell, AlertRow) use `$tiv` instead of `$ti` so this cannot be forgotten per message type.

**`const tp`**

- Pluralizing translator: picks the right plural form for `count` and interpolates the count as `{n}`. The optional `.zero` form lets a language phrase the empty case naturally ("No invoices" / "Sin facturas"); when absent, count 0 falls back to the `.other` form.

### `src/lib/status.ts`

**`const STORED_INVOICE_STATUSES` / `const DERIVED_INVOICE_STATUSES`**

- The invoice status vocabulary, split by where a value comes from. `pending | accepted | rejected | paid` are what `invoices.status` holds; `overdue` is computed at read time and never written. `DISPLAY_INVOICE_STATUSES` is the union the UI can be asked to render, and `InvoiceStatus` (the stored union) is re-exported by `invoice-status.ts` rather than redeclared — three disagreeing copies of this union is what issue #520 found.

**`function badgeClass` / `function statusKey`**

- Total over `DISPLAY_INVOICE_STATUSES`; an unrecognised value gets a neutral badge and renders its raw text rather than being painted as confirmed. `tests/invoice-status-vocabulary.test.ts` asserts every member has a class in app.css and a key in both locales.

**`function confColor`**

- Confidence score → CSS colour variable.
