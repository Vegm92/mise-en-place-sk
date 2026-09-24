# Agent coordination

Several agents (Jules / Bolt / Sentinel, Claude Code sessions, Dependabot) open
PRs against this repo in parallel. When two of them pick the same problem, one
finished PR gets thrown away. Examples: #1169 duplicated #1164, #1166 duplicated
#1163, and #1162/#1167 duplicated #1159/#1160.

## Before you change anything

1. **List open PRs** and read their titles and changed files:
   - `pnpm pr:overlap` when `GITHUB_TOKEN`/`GH_TOKEN` or `gh` is available
     (run it again once your change exists; it compares files).
   - Otherwise use the GitHub API / MCP tools, or, with git alone:
     `git fetch origin` then, per branch,
     `git diff --name-only origin/main...origin/<branch>`.
     Branches of merged or closed PRs are not always deleted: skip ones with
     no diff, and treat the rest as possibly open.
2. **Check what just landed on main**: `git log --oneline -30 origin/main`.
3. **If an open PR or a recent merge already covers your task (same bug, same
   finding, same files), stop.** Don't open a variant of it. If you have
   something to add, build on that PR's branch or leave a comment on it.
4. If another open PR edits the same files for a different reason, keep your
   change as small as possible and say so under **Surface** in the PR template.

## Enforcement

CI runs `pr-overlap` on every PR. The check goes red when another open PR edits
the same files. Land or close one of the two, then re-run the check on the other.

