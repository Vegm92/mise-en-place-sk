---
tags: [mep, operations, ai]
related: "[[CONTEXT]]"
---

# Dispatch manifests

One JSON file per **currently active** worker dispatch, checked by
`scripts/check-orchestrator-budget.mjs` (`pnpm orchestrator:check`, wired into
CI). Governed by `docs/07_ai/dispatch_context_budget.md`.

The coordinator writes `<issue-number>.json` here at the moment it dispatches
a worker, and deletes it the moment that worker's result is folded into
`ORCHESTRATOR_BACKLOG.md`. A file left here past the age cap means the worker
is either still running past a reasonable bound or was never cleaned up —
both are the coordinator's problem to resolve, not something to silently
carry forward.

Schema:

```json
{
	"issue": 881,
	"title": "short issue title",
	"branch": "claude/881-categories-consumers",
	"routes": ["src/lib/server/categories.ts", "src/routes/(app)/products/+page.server.ts"],
	"dispatched_at": "2026-09-02T15:00:00Z",
	"prompt_chars": 1800
}
```

- `routes`: the specific files the worker was pointed at — 1 to 8 of them.
  More than that is not a dispatch, it is the coordinator failing to split
  the work.
- `prompt_chars`: the length of the actual prompt text sent, so a prompt that
  smuggled in a full doc dump is caught by size alone.

This only catches what the coordinator commits. It cannot observe a running
session directly — there is no hook from GitHub Actions into Anthropic's
session runtime. It works because the coordinator's own commits are the
record of its state, the same way `ORCHESTRATOR_BACKLOG.md` already is.
