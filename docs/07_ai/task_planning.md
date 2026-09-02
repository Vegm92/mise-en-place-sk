---
tags: [mep, ai]
related: "[[CONTEXT]]"
---

# Task Planning

A small, consistent plan format. The point is not paperwork — it is making the
blast radius explicit before Level 3+ work (see `change_protocol.md`).

## Format

```
## Objective
One or two sentences: what behaviour changes.

## Affected
- Files / modules / entities (table names)
- Routes + API endpoints
- External integrations (Gemini, Stripe, WhatsApp, Resend, Sentry, storage)
- Background jobs / cron

## Risks
- What could break downstream (check dependency_map.md)
- Idempotency / retry hazards
- Entitlement/tenancy surfaces touched

## Steps
Numbered, small, testable steps in order.

## Tests & verification
- Which existing tests must stay green
- New tests to add (name + what they assert)
- Which gates to run (pnpm check / test / db:check-sync / lint:* / build)

## Doc updates
- Feature spec(s), its `## Code notes` section, dependency map, ADR needed?
```

## Guidance

- **Scope first.** Name the tables, routes and modules you will touch before
  writing code. If you cannot name them, you have not finished locating the
  change (see `agent_workflow.md` steps 1–3).
- **Dependency-aware.** For anything that feeds other subsystems (alerts feed
  notifications; save feeds budgets/alerts; batch state feeds the worker), note
  the consumers and re-verify them after the change.
- **Test-led.** Write the verification line at the same time as the objective.
  Tests are part of the change, not an afterthought.
- **Keep it short.** Two to eight steps; one page max. Longer plans are a sign
  the change should be split.
- **Document as you go.** The "Doc updates" line keeps step 7 of the workflow
  from being skipped when the diff lands.

## Example (illustrative)

```
## Objective
Add a re-run button for failed batch items on the batch detail page.

## Affected
- tests/batch-actions.test.ts, src/routes/(app)/batch/[id]/+page.server.ts,
  src/lib/server/batch-core.ts, src/lib/i18n.ts (button label)
- Route: POST /batch/[id]/retry-item

## Risks
- Must not re-enqueue a 'confirmed' item (state machine guard)
- Duplicate extraction → content-hash gate still protects invoice creation

## Steps
1. Add guarded transition failed → queued in batch-core
2. Add route action calling it; 409 on invalid state
3. Add button (i18n key) + optimistic update
4. Test: retry from failed works; from confirmed is rejected

## Tests & verification
- tests/batch-actions.test.ts, existing batch-model tests, pnpm check,
  lint gates

## Doc updates
- docs/03_features/invoice_ingestion.md (state transition), its `## Code notes` section
```
