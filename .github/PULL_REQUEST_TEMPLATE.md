## What

<!-- One or two sentences. What does this change do? -->

## Why

<!-- The bug, the issue number, or the decision this implements. Closes #___ -->

## Surface

<!-- Which files/areas this owns, so a parallel session can see the claim. -->

## Verification

<!-- What you actually ran and saw, not what CI will run. -->

- [ ] `pnpm check` and the `lint:*` gates pass locally
- [ ] `pnpm test` (say which suites are DB-skipped)
- [ ] `pnpm pr:overlap` clear — no other open PR edits these files
- [ ] under ~800 added lines of hand-written source
- [ ] affected spec + `## Code notes` updated (`AGENTS.md` → How to update documentation)
