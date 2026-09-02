---
tags: [mep, operations]
related: "[[CONTEXT]]"
---

# Orchestrator backlog archive — mise-en-place-sk

Narrative session notes moved out of `ORCHESTRATOR_BACKLOG.md` per
`docs/07_ai/dispatch_context_budget.md`, so the live file a coordinator
re-reads every cycle stays short. The per-issue status table in
`ORCHESTRATOR_BACKLOG.md` is the durable record; this file is history only —
nothing here is re-read by a coordinator session.

The narrative rows written before this policy existed (2026-08-25 through
2026-09-02) still live in `ORCHESTRATOR_BACKLOG.md` itself; they were not
back-migrated to avoid rewriting a file another session may resume mid-run.
Move them here the next time a coordinator session starts fresh on that file.
