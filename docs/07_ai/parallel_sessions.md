# Parallel Sessions

The working agreement for running several agent sessions at once. `agent_workflow.md`
governs how one session does one task; this governs what happens when five sessions
run at the same time on the same repository.

It exists because 2026-08-25 produced 24 merged PRs, 89 commits — and three
collisions that cost real work.

## Why this file exists

On 2026-08-25 the repository merged 24 PRs. Nine sessions ran concurrently
between 17:00 and 20:00. CI caught everything it was designed to catch: every
merged PR was green before it landed. What CI cannot see is that two sessions
were building the same thing.

| Thrown away | Landed instead | Gap |
|---|---|---|
| #685 `worktree-reports-feature` — complete, CI-green, +1,620 lines | #687, identical title | 64 min |
| #686 `worktree-fix-suppliers-page-ui` | #672, overlapping content | — |
| #688 `worktree-ui-filters-row-and-period` | #689, both "refactor filter UI" | 19 min |

The five sessions that ran cleanly that afternoon (#518, #519, #520, #540, #569)
were disjoint subsystems. The three that collided were all the same list pages.
That is the whole lesson: **fan out by subsystem, serialize by surface.**

## 1. Claim the surface before writing code

A branch on your own machine claims nothing. Two rules make a claim visible:

```bash
pnpm pr:overlap        # is another open PR already editing these files?
```

Run it **before** you start writing, and again before you open the PR. It compares
your changed files (committed *and* working tree) against every open PR's file list
and exits non-zero on a collision. `--warn-only` reports without failing.

Then **open the PR as a draft on your first commit**, not when the work is finished.
The draft PR is the claim: it is the only signal visible to a session running in a
different container, on a different machine, or on your phone. A session that works
for four hours before opening a PR is invisible for four hours.

`CONTEXT.md` is local and gitignored — it cannot coordinate anything. GitHub can.

## 2. One surface, one session

Two sessions may run concurrently only if they cannot touch the same files.

- **Fan out by subsystem** — billing, worker, scheduler, i18n, a feature spec's own
  routes. Disjoint by construction.
- **Serialize by surface** — the shared list pages
  (`src/routes/(app)/{suppliers,products,invoices}`), the app shell, `schema.ts`,
  `i18n.ts`, and the design tokens are one surface each. One session at a time.
  If a second session needs that surface, it waits or works on the first one's branch.

When `pnpm pr:overlap` reports a collision, do not "merge it later". Land or close
the other PR first, or move your change onto its branch.

## 3. Two branch lanes, not three

| Lane | Shape | Used by |
|---|---|---|
| Agent session | `claude/<issue-or-slug>-<suffix>` | a session driving one issue |
| Hand-driven | `feat/…`, `fix/…`, `chore/…` | work you steer directly |

`worktree-*` is **retired**. Two of the three PRs thrown away on 2026-08-25 were
`worktree-*` branches; the lane's only real function was to hide that a second
session already owned the surface. A git worktree is still fine — name its branch
in one of the two lanes above.

## 4. Re-cut, do not merge in

At this merge rate a branch older than about two hours is stale. Bring it forward by
rebasing onto fresh `main`, not by merging `main` into it.

```bash
git fetch origin main && git rebase origin/main
```

Repeated `Merge main into X` commits are how `fix: restore json import lost in merge`
happened: the bug was created by the reconciliation, not by the code. If the branch
is shared or already pushed for review, merge instead of rewriting history — but
prefer re-cutting a short-lived branch over nursing a long one.

## 5. Size cap: 800 added lines

A PR over ~800 added lines is not reviewable and, in practice, does not land.
Generated output, migrations, and doc dumps are exempt; hand-written source is not.

The standing example is #644: a one-function WhatsApp idempotency fix for a
**permanent invoice-loss bug** (issue #483), welded to 57 files and +7,469 lines from
the session it grew inside. It has been open, unmergeable, and unshipped since
2026-08-24 while cosmetic work merged around it.

When a session's branch outgrows the cap, cherry-pick the fix that must ship onto a
fresh branch off `main` and land that first.

## 6. Models

Capability is not the bottleneck here — coordination is. Spending a frontier model
per worker buys nothing that the gates in `AGENTS.md` do not already enforce.

- **Every implementation agent, subagent and issue session runs the latest Sonnet**
  (`claude-sonnet-5`). Never Fable, never Opus — including for the one that "looks
  hard". If a task genuinely cannot be done at Sonnet, that is a signal the task is
  under-specified or too large (see §5), not that it needs a bigger model.
- **The coordinator** — the session that plans, splits the work, reviews the results
  and merges — also runs Sonnet **by default**. It runs `claude-opus-5` or
  `claude-fable-5` only when you say so explicitly, per session.
- **Effort** does the tuning instead of model tier: `high` for the coordinator and for
  planning, lower for mechanical workers.

Set it with `/model` in a session, or the `model:` field on a subagent definition.
Model IDs are exact strings — no date suffixes.

## 7. Closing a PR without merging

Say why, in a comment, before you close it. #685 and #686 disappeared silently with
finished work inside them. A closing comment naming the PR that superseded it is the
difference between a duplicate and a lost afternoon.

## 8. Commit messages

One language per repository: **English**, matching the majority of the history and
every PR title. Spanish belongs in user-facing strings (`src/lib/i18n.ts`, Spanish
first per ADR-021), not in commit subjects.

## Checklist

Before starting:

- [ ] `pnpm pr:overlap` is clear
- [ ] no other session owns this surface
- [ ] branch is in one of the two lanes

Before opening for review:

- [ ] draft PR has existed since the first commit
- [ ] rebased on current `origin/main`
- [ ] under 800 added lines of hand-written source
- [ ] `pnpm pr:overlap` still clear
- [ ] the gates in `AGENTS.md` pass locally
