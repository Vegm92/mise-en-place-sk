---
tags: [mep, ai]
related: "[[CONTEXT]]"
---

# Specification Audit

How to decide what a doc/code mismatch means. When a document and the code
disagree, one of four things is true — determine which *before* changing
anything, then act and record it.

## The four cases

| Case | Meaning | Action |
|---|---|---|
| **Implementation is wrong** | Code does not do what an approved spec says it should | Fix the code; keep the test that now passes |
| **Spec is stale** | Code changed behaviour deliberately; doc never updated | Update the doc (feature spec + its `## Code notes` section) to match reality; note the change date |
| **Spec is incomplete** | Code does something the spec never covered | Extend the spec with the observed behaviour if it is intentional; otherwise file it as a bug |
| **Intentional-but-undocumented** | A deliberate divergence a reviewer would not guess | Add a note in the relevant `## Code notes` section + an ADR amendment if the *why* is non-obvious |

## Decision procedure

1. Read the code path (source > doc per the source-of-truth hierarchy).
2. Read the approved spec for the feature (`docs/03_features/`) and any ADR.
3. Ask: does the current behaviour look deliberate? (Comments are banned, but
   the `## Code notes` sections, tests, and commit history reveal intent.)
4. Ask: is there a test asserting the current behaviour? Tests are correctness
   truth — a passing test asserting behaviour X strongly suggests X is intended
   and the doc is stale.
5. Record the outcome in CONTEXT.md ("Current Task"/audit items) and in the
   feature spec's edge/validation section if behaviour is being pinned down.

## When to escalate

- Tenancy, security, billing/entitlement, idempotency, or migration-sync
  contradictions → never resolve silently. Report to the owner; these are
  invariants (see `architectural_invariants.md`).
- Spec vs code disagreement with no test and no ADR → treat as a bug unless the
  commit history shows intent.

## Output

Every audit should end with one of the four verdicts above, plus:

- What changed (code / doc / test / nothing-yet)
- File(s) touched and why
- Whether an ADR amendment is warranted
- A pointer for the next agent (link to the spec or its `## Code notes` section)

## Anti-patterns

- "Doc says X, so code must be wrong" — without checking tests/commit intent.
- "Code does X, so update the doc" — when the code is actually violating an
  approved product spec.
- Silently picking one and moving on — the mismatch itself is information that
  the team owns.
