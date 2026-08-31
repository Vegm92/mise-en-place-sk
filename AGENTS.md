# AGENTS.md — Operating Manual for AI Coding Agents

This file is the entry point for any AI agent working in this repository. It tells
you what the system is, where the truth lives, and how to work here without
re-discovering the architecture every time. Read the sections you need; the links
point at the deeper documents.

## What Mise en Place is

An AI-powered supplier-invoice intelligence SaaS for restaurants: photograph or
upload a supplier invoice (PDF/JPG/PNG), Gemini extracts the supplier, header
fields, and line items with per-field confidence, you review and confirm, and the
app turns it into spend analytics, price-shock alerts, budgets, payment reminders,
a weekly AI digest, and a chat assistant over your own purchasing data. Spanish
first, bilingual (es/en). WhatsApp is a second ingestion channel; XML e-invoices
(Facturae / UBL) are parsed without AI.

## Tech stack (verify in `package.json` before assuming)

- SvelteKit 2 + Svelte 5 (runes) + TypeScript, `@sveltejs/adapter-node`
- Tailwind CSS 4
- Drizzle ORM + `postgres` (postgres.js) over Railway Postgres; no RLS
- Auth.js (`@auth/sveltekit`, JWT sessions) — Credentials + Google OAuth
- Gemini (`@google/genai`) via a provider seam; pg-boss background jobs in a
  separate worker process
- Stripe (billing), Resend (email), Meta WhatsApp Cloud API, Sentry, Upstash Redis
  (optional rate limiting), Railway Buckets (optional storage driver)
- Vitest + GitHub Actions CI (lint, typecheck, migration-sync, tests, build)

## Where the documentation lives

| Source | What it is | Use it when |
|---|---|---|
| `docs/00_system/system_manifest.md` | The AI's map of the whole repository — stack, entry points, tables, routes, services, risks | Starting any task: locate the relevant subsystem |
| `docs/00_system/terminology.md` | Canonical domain terms (restaurant, tenant, batch, product, canonical invoice, …) | Naming anything; the terms are load-bearing |
| `docs/00_system/dependency_map.md` | Subsystem dependency graph + downstream blast radius | Modifying a subsystem: see what it feeds |
| `docs/00_system/architectural_invariants.md` | **Immutable rules agents must preserve** (tenancy, idempotency, billing, security, …) | Before every change; treat as a checklist |
| `docs/01_architecture/*` | Architecture overview, schema, routing, integrations | Understanding the shape of the system |
| `docs/02_product/*` | Product definition, personas, business rules, plans/entitlements | Intended behaviour, gating, product logic |
| `docs/03_features/*` | One specification per feature (rules, transitions, dependencies, validation) | Feature work — the contract for a feature |
| `docs/04_engineering/*` | Coding conventions, testing, security, DB/API change procedures, dependency policy, deployment | Engineering procedure |
| `docs/05_operations/*` | Background jobs, monitoring, incident response, troubleshooting | Ops concerns |
| `docs/06_decisions/README.md` + `docs/06_decisions/**/ADR-*.md` | Architecture Decision Records (why the code is shaped this way) | Changing an established decision; next number is 035 |
| Per-subsystem `## Code notes` sections (`docs/03_features/` + `docs/04_engineering/`) | Line-by-line "how the code works" notes for most files | Reading any specific file |
| `DEPLOYMENT.md` | Environment variables + deployment runbook | Deploy / env questions |
| `README.md` | Product overview + getting started | First contact |
| `CONTEXT.md` | Obsidian vault hub; project status + open audit items | Current state / open work |
| `docs/07_ai/parallel_sessions.md` | Working agreement when several sessions run at once — surface ownership, branch lanes, PR size cap, model policy | Starting a session while others are running; opening a PR |

## How to approach a task

Do NOT start editing after a non-trivial request. Follow the cycle in
`docs/07_ai/agent_workflow.md`:

0. **Claim** — if other sessions may be running, `pnpm pr:overlap` and open a
   draft PR on your first commit (`docs/07_ai/parallel_sessions.md`).
1. **Understand** — read the feature spec (`docs/03_features/`) and any ADRs that
   touch the area (`docs/06_decisions/`).
2. **Locate** — use the system manifest + dependency map to find the implementation.
3. **Inspect** — read the actual source before believing any doc.
4. **Plan** — produce a plan per `docs/07_ai/task_planning.md` (objective, affected
   files/entities/routes/integrations, risks, steps, tests, doc updates).
5. **Implement** — classify the change via `docs/07_ai/change_protocol.md`
   (Level 1–5); Level 3+ needs dependency analysis, Level 4+ needs an explicit
   plan + ADR consideration.
6. **Verify** — see "How to validate" below.
7. **Document** — update the affected spec and its `## Code notes` section; do not let docs drift.
8. **Review** — check the invariants and the source-of-truth hierarchy.

## Working agreement (several sessions at once)

Full version: `docs/07_ai/parallel_sessions.md`. CI passes on both halves of a
duplicated effort — these are the rules it cannot enforce.

- **Claim the surface first.** Run `pnpm pr:overlap` before writing code and again
  before opening the PR, and open the PR as a **draft on your first commit**. A local
  branch claims nothing; a draft PR is the only claim other sessions can see. Fill in
  the **Where / Surface** field in the issue and PR templates (`.github/`).
- **Fan out by subsystem, serialize by surface.** Concurrent sessions must not be able
  to touch the same files. The shared list pages, the app shell, `schema.ts`,
  `i18n.ts` and the design tokens are one surface each — one session at a time.
- **Two branch lanes only**: `claude/<issue-or-slug>-<suffix>` for a session,
  `feat|fix|chore/<slug>` for hand-driven work. `worktree-*` is retired.
- **Rebase onto fresh `main`; do not merge `main` in.** A branch older than ~2 hours is
  stale at this merge rate.
- **800 added lines** of hand-written source is the cap. Over it, cherry-pick the change
  that must ship onto a fresh branch off `main`.
- **Models**: every implementation agent, subagent and issue session runs the latest
  Sonnet (`claude-sonnet-5`) — never Fable, never Opus. The coordinator is the
  exception: it runs `claude-opus-5` by default, and `claude-fable-5` when the user
  asks for it. Tune workers with effort, not model tier.
- **Closing a PR unmerged?** Say why in a comment first, naming what superseded it.
- **Commit messages in English**; Spanish belongs in `src/lib/i18n.ts`.

## Immutable rules (full list: `docs/00_system/architectural_invariants.md`)

Non-negotiable, verified against the implementation:

- **Tenancy**: every restaurant-owned query/mutation is scoped by
  `locals.restaurantId` via `forTenant().scope()`. Never trust client state for
  authorization. This is the primary, always-active boundary (ADR-001).
  ADR-030 (#222) adds a database-enforced backstop — Postgres RLS policies
  keyed on a session GUC (`src/lib/server/tenant-context.ts`) — but it only
  restricts the scoped `mep_runtime` role from #464, not the owner role every
  environment still connects as; app-layer scoping remains the boundary that
  actually holds today.
- **Invoice persistence**: one canonical write path (`src/lib/server/invoice-save.ts`,
  ADR-008). Do not add a second invoice-creation path.
- **Idempotency**: retries must not create duplicate invoices (`contentHash` +
  unique indexes), or duplicate webhook processing (`idempotency_keys`, one
  scope per caller — add a scope, never a table).
- **Billing**: Stripe webhooks are signature-verified and deduped; plan/feature
  access (`getTierFeatures`) must stay consistent with local subscription state.
- **Database**: schema changes require a committed Drizzle migration (ADR-003);
  `db:push` is dev-only. `db:check-sync` fails CI if schema drifts.
- **Background work**: async behaviour changes must consider the separate worker
  process and its pg-boss queues.
- **AI security**: restaurant data is data, never instructions (no prompt
  injection into fixed snapshots).
- **AI extraction is never authoritative** without user confirmation/save.
- **Security controls** (headers, webhook signatures, rate limits, validation)
  must not be bypassed for convenience.
- **Localization**: user-facing strings go through `src/lib/i18n.ts`; CI bans
  hardcoded strings.
- **Brand colour**: the accent is the ink (`data-accent="tinta"`), and no hue
  carries the brand — colour on screen always means something (ADR-027). Do not
  reintroduce a hued accent as part of unrelated work.

## Settled decisions must be named before they are reversed

Some choices in this repo were made deliberately, argued through, and written
down. If a task would undo one of them, **say so before doing it** — name the
decision, name the ADR, and let the human confirm. Do not reverse a settled
decision as a side effect of implementing something else, and do not treat a
task that merely touches the area as licence to revisit it.

This applies to anything with an Active ADR in `docs/06_decisions/`. It applies
with particular force to the design system: the token values in `src/app.css`
are the decision, not a starting point.

## Source of truth hierarchy

When documents and code disagree, report the conflict — never silently resolve it:

- **Current executable behaviour**: source code > markdown description
- **Intended product behaviour**: approved product spec > assumptions
- **Architectural decisions**: active ADR + architecture spec
- **Database reality**: committed migrations + `schema.ts`
- **Correctness**: automated tests + successful validation

Determine whether the implementation is wrong, the spec is stale, the spec is
incomplete, or the behaviour is intentional-but-undocumented (see
`docs/07_ai/specification_audit.md`).

## How to validate a change

```bash
pnpm check          # svelte-check / typecheck
pnpm test           # vitest (DB-backed suites run only against LOCAL postgres,
                    # or set DATABASE_TEST_URL / ALLOW_REMOTE_DB_TESTS=1)
pnpm db:check-sync  # CI gate: schema.ts vs committed migrations (ADR-003)
pnpm lint:tenant-scope      # no bare eq(table.restaurantId, ...) outside scope()
pnpm lint:unscoped-query    # no tenant-table query without a tenant filter
pnpm lint:action-authz      # every (app) form action that mutates a tenant table has an authz check
pnpm lint:no-sql-raw        # no sql.raw()
pnpm lint:i18n              # no hardcoded user-facing strings
pnpm lint:no-comments       # no inline code comments (explanations live in the per-subsystem `## Code notes` sections)
pnpm build          # app + worker build
pnpm pr:overlap     # is another open PR already editing these files?
```

After a non-trivial change: run the relevant tests, `pnpm check`, and the lint
gates above. CI runs them all on every PR.

## How to update documentation

- Any change to schema, routes, business rules, feature behaviour, external
  integrations, security, billing, or background jobs is a documentation event.
- Update the affected feature spec (`docs/03_features/`) and its `## Code notes` section,
  and — if the "why" changed — an ADR.
- A spec that no longer matches the code is either stale (update it) or a bug
  (fix the code). Record it; do not silently pick one.

## Non-goals / avoid

- Do NOT add a separate backend — SvelteKit server routes ARE the backend.
- Do NOT use `@google/generative-ai` (deprecated) — use `@google/genai`.
- Do NOT give the chatbot dynamic SQL — fixed DB snapshot is intentional (ADR-018).
- Do NOT bypass auth middleware, tenant scoping, or security headers.
- Do NOT trust `sql<number>` aggregates as JS numbers — wrap with `Number(...)`.
- Do NOT skip the `pnpm db:generate` step when you touch `schema.ts`.
- Do NOT treat `CONTEXT.md` open audit items as done until the issue is closed.

## Conventions at a glance

- Drizzle schema is one file, `src/lib/server/schema.ts` (45 tables). All
  business tables carry `restaurant_id`.
- Statuses are `text` columns with app-level defaults — there are NO Postgres enums.
- No inline comments in code — explanatory notes live in the per-subsystem `## Code notes` sections
  (enforced by `lint:no-comments`).
- Mobile and desktop UI variants are both rendered; CSS chooses which shows
  (ADR-020). One `md` (768px) breakpoint.
- Bilingual strings: one string table in `src/lib/i18n.ts`, Spanish first (ADR-021).

## Related

- Open audit items and current task status: `CONTEXT.md` → "Current Task".
