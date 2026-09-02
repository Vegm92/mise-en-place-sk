---
tags: [mep, ai]
related: "[[CONTEXT]]"
---

# Agent Workflow

The operating cycle every agent (human or AI) follows in this repository.
This is the "how to approach a task" that AGENTS.md summarizes. It is a cycle,
not a pipeline: documentation and tests close the loop back into understanding.

## 0. Claim

Before anything else, when other sessions may be running: check that no open PR
already edits the files you are about to touch, and make your own work visible.

```
pnpm pr:overlap
```

Open the PR as a **draft on your first commit** — a local branch claims nothing.
Surface ownership, branch lanes, the 800-line cap and the model policy live in
`docs/07_ai/parallel_sessions.md`.

## 1. Understand

Read the feature spec (`docs/03_features/<feature>.md`) for the area you touch,
plus any ADRs that cover it (`docs/06_decisions/README.md` index). If the task spans
subsystems, check `docs/00_system/dependency_map.md` for downstream blast
radius and `docs/00_system/architectural_invariants.md` as a checklist.

- New to the repo? Start with `docs/00_system/system_manifest.md`, then
  the per-subsystem `## Code notes` sections for file-level detail.
- Product intent? `docs/02_product/*`.

## 2. Locate

Use `docs/00_system/system_manifest.md` + the dependency map to find the
implementation: `src/lib/server/<feature>.ts` for logic, `src/routes/**` for
routes, `src/worker.ts` for async, `drizzle/` for schema history.

## 3. Inspect

Read the actual source before believing any doc. Markdown can drift; code
cannot be ignored. If a doc and the code disagree, you have found either a
stale doc (update it) or a bug (fix the code) — decide via
`docs/07_ai/specification_audit.md` and **record it, never silently pick one**.

## 4. Plan

Produce a short plan per `docs/07_ai/task_planning.md`: objective, affected
files/entities/routes/integrations, risks, steps, tests, doc updates. For
Level 3+ changes (see `docs/07_ai/change_protocol.md`) the plan must include
dependency analysis; Level 4+ needs an explicit plan + ADR consideration.

## 5. Implement

Classify the change via `docs/07_ai/change_protocol.md` (Level 1–5) and follow
its gates:

- Respect the invariants (`docs/00_system/architectural_invariants.md`).
- Stay on the single invoice write path (`invoice-save.ts`, ADR-008).
- Keep tenancy via `forTenant().scope()`; never bare
  `eq(table.restaurantId, ...)`.
- No inline comments (`lint:no-comments`); explanations belong in
  the per-subsystem `## Code notes` sections.
- User-facing strings via `src/lib/i18n.ts` (`lint:i18n`).
- No `sql.raw()` (`lint:no-sql-raw`).

## 6. Verify

Run the relevant gates (see `docs/04_engineering/testing_strategy.md`):

```
pnpm check
pnpm test                 # DB suites need local Postgres (DATABASE_TEST_URL)
pnpm db:check-sync        # if schema touched
pnpm lint:tenant-scope && pnpm lint:unscoped-query && pnpm lint:no-sql-raw && pnpm lint:i18n && pnpm lint:no-comments && pnpm lint:duplication
pnpm build
pnpm pr:overlap           # no other open PR touches these files
```

Local stack for auth/onboarding/invoice-save flows: `.claude/skills/verify/SKILL.md`.

## 7. Document

Any change to schema, routes, business rules, feature behaviour, external
integrations, security, billing, or background jobs is a documentation event:

- Update the affected feature spec (`docs/03_features/`).
- Update the affected `## Code notes` section for how-the-code-works changes.
- Update `docs/00_system/dependency_map.md` if the dependency graph moved.
- If the *why* changed → new ADR (next number 023) per `docs/06_decisions/README.md`.

## 8. Review

Check the invariants list again and the source-of-truth hierarchy
(`AGENTS.md`): executable behaviour (source) > intended behaviour (spec) >
architectural decisions (ADRs) > database reality (migrations) > correctness
(tests). When documents and code disagree, report the conflict — do not
silently resolve it.
