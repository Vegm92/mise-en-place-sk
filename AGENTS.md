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
- Tailwind CSS 4 + shadcn-svelte/bits-ui
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
| `docs/06_decisions/README.md` + `docs/06_decisions/**/ADR-*.md` | Architecture Decision Records (why the code is shaped this way) | Changing an established decision; next number is 026 |
| Per-subsystem `## Code notes` sections (`docs/03_features/` + `docs/04_engineering/`) | Line-by-line "how the code works" notes for most files | Reading any specific file |
| `DEPLOYMENT.md` | Environment variables + deployment runbook | Deploy / env questions |
| `README.md` | Product overview + getting started | First contact |
| `CONTEXT.md` | Obsidian vault hub; project status + open audit items | Current state / open work |

## How to approach a task

Do NOT start editing after a non-trivial request. Follow the cycle in
`docs/07_ai/agent_workflow.md`:

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

## Immutable rules (full list: `docs/00_system/architectural_invariants.md`)

Non-negotiable, verified against the implementation:

- **Tenancy**: every restaurant-owned query/mutation is scoped by
  `locals.restaurantId` via `forTenant().scope()`. Never trust client state for
  authorization. RLS is retired (ADR-005); app-layer scoping is the ONLY boundary.
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
pnpm lint:no-sql-raw        # no sql.raw()
pnpm lint:i18n              # no hardcoded user-facing strings
pnpm lint:no-comments       # no inline code comments (explanations live in the per-subsystem `## Code notes` sections)
pnpm build          # app + worker build
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

- Drizzle schema is one file, `src/lib/server/schema.ts` (40 tables). All
  business tables carry `restaurant_id`.
- Statuses are `text` columns with app-level defaults — there are NO Postgres enums.
- No inline comments in code — explanatory notes live in the per-subsystem `## Code notes` sections
  (enforced by `lint:no-comments`).
- Mobile and desktop UI variants are both rendered; CSS chooses which shows
  (ADR-020). One `md` (768px) breakpoint.
- Bilingual strings: one string table in `src/lib/i18n.ts`, Spanish first (ADR-021).

## Related

- Open audit items and current task status: `CONTEXT.md` → "Current Task".
