---
tags: [mep, ai, operations]
related: "[[CONTEXT]]"
---

# Dispatch Context Budget

The rule for what a coordinator session (`parallel_sessions.md` §6) puts into a
dispatched worker's prompt, and what it keeps in its own conversation between
dispatches. It exists because a coordinator session on 2026-09-02 ran ~15h,
784M cache-read tokens, 12.2M cache-write tokens, $272 — one session, not a
fleet. Cache reads are what a long-lived agent conversation pays every turn to
re-see everything already said; the fix is bounding what accumulates in that
conversation, not "using less cache" (the cache is why it wasn't ~10x that).

## What a dispatch prompt may contain

- The issue: id, title, acceptance criteria — quoted, not paraphrased from
  memory of an earlier cycle.
- The branch name to work on.
- A short **routes list**: the specific file paths the worker should start
  from, resolved by the coordinator against `docs/00_system/system_manifest.md`
  and `docs/00_system/dependency_map.md` — paths only, not those documents'
  text.

## What a dispatch prompt must never contain

- The full text of `AGENTS.md`, `system_manifest.md`, `dependency_map.md`, any
  feature spec, or any ADR. The worker is a fresh session — it reads these
  itself per `agent_workflow.md`. Pasting them into the prompt makes the
  coordinator pay to re-send them on every subsequent turn of its own
  conversation for the rest of the session; it does not save the worker
  anything, since the worker's first read is a cache write regardless.
- `ORCHESTRATOR_BACKLOG.md` in full, or another issue's resolution notes. One
  issue's dispatch does not need to know how the other eleven were fixed.
- A prior subagent's full transcript. If a retry needs the previous attempt's
  finding, quote the one relevant line, not the run.

## What comes back

A worker reports in a fixed, short shape — status, commit SHA, test counts,
files touched, one line of residual/notes. That is what gets written into the
backlog row. The coordinator does not pull the worker's transcript, diff, or
reasoning into its own context to summarize; the worker already summarized it.

## Backlog hygiene

`ORCHESTRATOR_BACKLOG.md` is read by the coordinator every cycle, so its
length is a standing tax on every subsequent turn. Keep the live file to the
status table plus the current session's own narrative notes. When a session
starts, move narrative rows from prior sessions into
`docs/05_operations/ORCHESTRATOR_BACKLOG_ARCHIVE.md` — the table's `Last
result / notes` column is the durable record per issue; the prose log is not.

## Session hygiene

A coordinator's own conversation, not the files it reads, is the biggest
driver of cache-read growth — every prior turn resends on every next one. Cut
a fresh coordinator session every ~2h or ~15 dispatches rather than running
one session for a full day; state lives in `ORCHESTRATOR_BACKLOG.md` and
GitHub, not in the conversation, so nothing is lost by recutting.
