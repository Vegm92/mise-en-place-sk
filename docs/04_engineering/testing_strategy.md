# Testing Strategy

What exists today (verified on `main`), what CI runs, and where coverage is
missing. A change is "verified" when the relevant tests + the gates below pass.

## Test layers

| Layer | Tool | What exists |
|---|---|---|
| Type checking | `pnpm check` (svelte-check) | strict TS across app + worker |
| Static lint gates | `scripts/*.mjs` | no-sql-raw, tenant-scope, unscoped-query, i18n, no-comments |
| Unit/integration | Vitest (`pnpm test`) | `tests/*.test.ts` — extraction, batch model, invoice save, alert engine, dedup, idempotency, billing, stripe webhook, whatsapp, products, qr, einvoice, tenant isolation, rate limiter, scheduler, status, budgets, working days, … (~70 files) |
| DB-backed suites | Vitest + local Postgres | create/delete real rows; skip on non-local hosts (`DATABASE_TEST_URL`, `ALLOW_REMOTE_DB_TESTS` escape hatch) |
| Migration sync | `pnpm db:check-sync` (`scripts/check-drizzle-sync.mjs`) | schema.ts vs committed migrations drift |
| Build | `pnpm build` | app + worker bundles |
| Coverage | v8 | ≥ 80% lines on 7 core modules (vite.config.ts) |
| E2E-ish | manual via `.claude/skills/verify/SKILL.md` | local Postgres + Auth.js credentials login flow |
| Browser sweep | `pnpm qa:sweep` (`scripts/qa-browser-sweep.mjs`) | headless Chromium pass over every route: load health, security headers, a11y, i18n key leakage, responsive, malformed route params — see [browser_qa_sweep.md](browser_qa_sweep.md) |

## What CI runs (`.github/workflows/ci.yml`)

Job `ci` (postgres:17 service, `REQUIRE_DB_TESTS=1`):

1. `lint:no-sql-raw` → 2. `lint:tenant-scope` → 3. `lint:unscoped-query`
   → 4. `lint:i18n` → 5. `lint:no-comments` → 6. `pnpm check`
   → 7. `db:check-sync` (ADR-003) → 8. `db:migrate` → 9. unit tests → 10. build.

## When to run what

| Change size | Run |
|---|---|
| Copy / styling / small UI | `pnpm check` |
| Logic change in a module | `pnpm check` + the module's tests (`pnpm test tests/<file>.test.ts`) |
| Schema / migration | `pnpm check`, `pnpm db:check-sync`, `pnpm db:generate`, full `pnpm test` |
| Route/API/entitlement change | all lint gates + `pnpm test` |
| Anything | `pnpm check` + all lint gates + `pnpm build` before merge |

DB-backed tests need a local Postgres; `.claude/skills/verify/SKILL.md` provides
a ready local stack.

## Test fixtures (synth)

`synth/js/` is a Node synthetic invoice/albarán generator (Nunjucks +
Puppeteer) that produces PDF + ground-truth JSON pairs for testing the
extraction pipeline. `nunjucks` and `puppeteer` are root `devDependencies`
(mirroring `synth/package.json`).

- `node synth/js/cli.mjs generate -n 10 -o synth/output` — write a batch of
  PDFs, per-document ground truth JSON, and a `_manifest.json`.
- `node synth/js/cli.mjs preview --seed 42` — print one document's ground truth
  JSON without rendering a PDF.

`pnpm db:seed-demo` (`scripts/seed-demo.mjs`) reuses the same engine: it imports
`buildEnv`/`buildContext`/`inlineCSS` from `synth/js/engine.mjs`, renders a real
PDF per seeded invoice with Puppeteer, and saves it via `saveDemoFile()`
(honors `STORAGE_DRIVER`) — so the 55 demo invoices carry a genuine
`source_file` rather than a placeholder string.

## Known gaps (see final audit)

- **Chat**: no dedicated test for `(app)/api/chat` (schema covered only).
- **Weekly digest**: no dedicated test beyond `tests/scheduler.test.ts`
  (job registration).
- **LLM metering**: no test asserts chat/digest write to `llm_usage_log` —
  they are not metered at all today; the fix + planned tests are in
  `docs/04_engineering/llm_usage_metering.md`.
- **Stripe checkout**: billing.test.ts covers tiers/quotas/access; the checkout
  route's happy path is not exercised end-to-end.
- **Admin/revenue math**: `revenue-math.ts` is tested; the revenue-metrics
  queries are not.
- **Frontend components**: no component tests (no Testing Library); relied on
  the verify skill.
- **Upload endpoint path-traversal** and `xlsx` export are covered
  (`upload-endpoint.test.ts`, `xlsx-export.test.ts`).

## How to add a test

1. Follow existing patterns in `tests/` — import from `$lib/server/...`, use
   `tests/helpers/test-db.ts` for DB-backed suites, mock Gemini via `GenerateFn`.
2. DB-backed: guard on local-host so the suite skips on non-local DBs.
3. Name it after the subject (`alert-engine.test.ts`); keep one concern per file.
4. Ensure it passes against a local Postgres (`DATABASE_TEST_URL`).

## Conventions

- Prefer testing public seams (functions, routes) over internals.
- Assert on behaviour (state transitions, returned shapes) not implementation
  details.
