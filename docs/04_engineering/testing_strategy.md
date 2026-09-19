---
tags: [mep, engineering]
related: "[[CONTEXT]]"
---

# Testing Strategy

What exists today (verified on `main`), what CI runs, and where coverage is
missing. A change is "verified" when the relevant tests + the gates below pass.

## Test layers

| Layer | Tool | What exists |
|---|---|---|
| Type checking | `pnpm check` (svelte-check) | strict TS across app + worker |
| Static lint gates | `scripts/*.mjs` | no-sql-raw, tenant-scope, unscoped-query, i18n, no-comments |
| Unit/integration | Vitest (`pnpm test`) | `tests/*.test.ts` — extraction, batch model, invoice save, alert engine, dedup, idempotency, billing, stripe webhook, whatsapp, products, qr, einvoice, tenant isolation, rate limiter, scheduler, status, budgets, working days, … (~120 files) |
| DB-backed suites | Vitest + local Postgres | create/delete real rows; skip on non-local hosts (`DATABASE_TEST_URL`, `ALLOW_REMOTE_DB_TESTS` escape hatch); the skipped files are named again at the end of the run |
| Invariant sweeps | Vitest over source | one vocabulary per concept — entitlement policy per route, invoice status, supported upload types (see below) |
| Migration sync | `pnpm db:check-sync` (`scripts/check-drizzle-sync.mjs`) | schema.ts vs committed migrations drift |
| Build | `pnpm build` | app + worker bundles |
| Coverage | v8 | ≥ 75% lines across `src/**/*.ts` (global), ≥ 80% on the 7 core modules (`vite.config.ts`) |
| E2E-ish | manual via `.claude/skills/verify/SKILL.md` | local Postgres + Auth.js credentials login flow |
| Browser sweep | `pnpm qa:sweep` (`scripts/qa-browser-sweep.mjs`) | headless Chromium pass over every route: load health, security headers, a11y, i18n key leakage, responsive, malformed route params — see [browser_qa_sweep.md](browser_qa_sweep.md) |

`vite.config.ts`'s `coverage.include` stays `src/**/*.ts` — `.svelte` files
are deliberately not in it, and no component-test runner has been added to
put them there. The fix for untested logic hiding in a `.svelte` file is not
a bigger coverage net; it's not writing that logic in a `.svelte` file at
all. Business logic belongs in a `src/lib/*.ts` module, where `pnpm test` and
this coverage threshold can already see it, and `pnpm lint:svelte-logic`
(`scripts/lint-invariants.mjs`'s `SVELTE_BUSINESS_LOGIC_BUDGET`, issue
#1078) is what keeps it there: a per-file ratchet, in the same shape as
`INLINE_TOKEN_STYLE_BUDGET`, over named functions in a `.svelte` `<script>`
block that compute and return a value rather than wire up an event or drive
the page. It cannot grow — a new one fails CI on arrival — only shrink as
existing offenders are extracted.

## What CI runs (`.github/workflows/ci.yml`)

Job `ci` (postgres:18 service, `REQUIRE_DB_TESTS=1`):

0. `pnpm audit --prod --audit-level high` (issue #1076) — fails on a
   high-severity advisory in the runtime dependency tree only; the full-tree
   `pnpm audit` is printed afterwards but never fails. On `pull_request` this
   blocking step itself only runs when the diff touches `package.json` or
   `pnpm-lock.yaml`; it always runs on a push to `main` (issue #1118, see
   [dependency_policy.md](dependency_policy.md))
1. `lint:no-sql-raw` → 2. `lint:tenant-scope` → 3. `lint:unscoped-query`
   → 4. `lint:i18n` → 5. `lint:no-comments` → 6. `lint:duplication`
   → 7. `pnpm check` → 8. `db:check-sync` (ADR-003) → 9. `db:migrate`
   → 10. unit tests → 11. build.

A separate workflow, `.github/workflows/audit.yml`, runs daily on a
`schedule` trigger (plus `workflow_dispatch` for an on-demand check) and does
nothing but the blocking audit step above — install included, nothing else
— so a runtime advisory published against something already on `main` still
fails within 24h even on a day nobody pushes (issue #1118). It's a separate
file rather than a job in `ci.yml` so the cron trigger never touches
`secret-scan`, `ci` or `eval-gate`, none of which have anything to check on
a schedule.

Step 10 runs the **full** `pnpm test` suite on every PR, not a `--changed`-filtered
subset: many suites (`tests/*.test.ts` grepping a `.svelte`/`.ts` source with
`readFileSync`) import nothing from the file they assert against, so a
source-only change is invisible to `vitest --changed` and such a regression
could merge through a green PR.

A separate `eval-gate` job (`pnpm eval:gate`) re-runs extraction against
`tests/golden/` when the extraction pipeline changes. `pnpm eval:gate`
refuses to treat a zero-case corpus as a pass: with nothing in
`tests/golden/index.json` it exits non-zero naming `tests/golden/index.json`
and `tests/golden/inbox/`, rather than reporting a silent, unearned green the
way it did before issue #1078.

`tests/golden/cases/*` is gitignored — real supplier documents (staged under
`tests/golden/inbox/`, itself gitignored) are local/dev-eyes-only and can
never be committed, `git add -f` included. One path is negated on purpose:
`tests/golden/cases/synthetic-*/` is trackable, for a hand-authored XML
e-invoice (Facturae 3.2.x or UBL 2.1) that holds no real customer data.
`extractWithProvider` (`src/lib/server/extract.ts`) scores `.xml` input
through the deterministic `einvoice-parser.ts` rather than a Gemini call, so
a synthetic case arms the gate for real without spending budget or holding
anyone's private data. `tests/golden/cases/synthetic-facturae-001/` is one,
with `tests/golden/baseline-report.json` recording its accepted baseline —
so a fresh checkout, CI included, already has a real, passing, zero-cost
gate rather than an empty one. Add more synthetic cases the same way; a real
invoice run stays a local-only `pnpm eval:gate` you run yourself, never
something CI can see.

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

## Cross-cutting invariant suites

Several suites assert over the *source* rather than over a hand-written list,
so a new route, status or file type joins the table on its own. They exist
because each of these concepts had drifted into two or three disagreeing copies
(issue #520):

| Suite | Invariant |
|---|---|
| `entitlement-routes.test.ts` | every server route is classified in `ROUTE_POLICY`; the gate is in the handle sequence; every upgrade slug has copy in both locales |
| `entitlement-verbs.test.ts` | the gate refuses each gated route identically on every verb it exports, for every tier — a paywall must not be read-only |
| `invoice-status-vocabulary.test.ts` | one `InvoiceStatus` union; every stored status has a badge class and an i18n key in es + en; the UI never offers a status the query layer cannot answer |
| `supported-file-types.test.ts` | the picker's `accept`, `ALLOWED_EXTENSIONS`, `MAGIC_BYTES` and `classifyFile` admit the same set |
| `skip-summary.test.ts` | the end-of-run summary names the files that did not run and why |
| `invoice-edit-enrichment.test.ts` | every enrichment column of `invoice_line_items` survives the edit action's delete-and-reinsert — the column set comes from the schema, not a list |
| `tenant-isolation-routes.test.ts` | every action `/batch/[id]` exports refuses a foreign batch **and** mutates nothing first; the action names come from the module |
| `extraction-worker.test.ts` | the retry classification: which error classes earn a redelivery, which dead-letter, and that a failed attempt always returns the monthly quota slot |

`src/lib/upload-formats.ts` and `src/lib/status.ts` are the single sources those
suites check against — extend the constant there, not the copy at the call site.

## Skipped-test visibility

`pnpm test` prints two notices. `tests/setup/global-setup.ts` warns *before* the
run when the database gate is closed; `tests/setup/skip-summary-reporter.ts`
repeats it *after*, naming every file that did not run, how many tests that was,
and which guarantees (tenant isolation, database CRUD, invoice persistence,
consent) are therefore unverified. A green "Test Files … passed" line above it
is not a full run.

CI is unaffected: it sets `REQUIRE_DB_TESTS=1`, where a closed gate is a hard
failure rather than a skip, so the summary should never appear there.

## Known gaps (see final audit)

- **Chat**: no dedicated test for `(app)/api/chat` (schema covered only).
- **Weekly digest**: no dedicated test beyond `tests/scheduler.test.ts`
  (job registration).
- **LLM metering**: chat and digest write to `llm_usage_log` (#426), but no
  test asserts it — see `docs/04_engineering/llm_usage_metering.md` for the
  planned coverage.
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
5. For anything that exists in more than one place (a route policy, a status, a
   file type), derive the test's table from the source instead of retyping it —
   a hardcoded list in a test drifts with the code it was meant to pin.

## Conventions

- Prefer testing public seams (functions, routes) over internals.
- Assert on behaviour (state transitions, returned shapes) not implementation
  details.
