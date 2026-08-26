# ADR-027 — The amber accent is deleted, not parked, and a test holds the line

**Status:** Active
**Feature:** experience
**Date:** 2026-08-26
**Amends:** [ADR-026](./ADR-026-warm-severity-ramp-cool-actions.md)

## Context

ADR-026 moved the default accent from `amber` to `slate` and left a hatch open:

> The `amber` theme block stays in `app.css` and can be restored by flipping
> `data-accent` back on the route roots.

A sweep of the tree found that the hatch was not the only amber left, and that
nothing was checking:

- **`src/lib/server/email.ts` still carried `#8a530f`.** Every transactional
  email — verification, password reset, reminders — was branded in the retired
  accent while the app rendered slate. The rest of that file's palette (`bg`,
  `surface`, the `fg` ramp) tracked the light tokens exactly; only the accent
  had been missed, and nothing would have said so.
- **`TrendChart.svelte` used the semantic ramp as a categorical palette**
  (`['var(--mep-acc)', 'var(--mep-pos)', 'var(--mep-info)', 'var(--mep-neg)',
  'var(--mep-warn)']`), so the fourth spend category rendered red and the fifth
  amber with nothing wrong in either. `--mep-series-*` via `seriesColor()`
  exists for exactly this. (The file is also imported by nothing — see
  Consequences.)
- **Two waitlist mocks hard-coded category hexes**, one set of them the *light*
  `--mep-cat-*` values, which therefore did not flip in dark mode.

ADR-026's own analysis is why the hatch is the problem rather than a
convenience: amber's `--mep-acc` was `#8a530f` light / `#d59854` dark against
`--mep-warn` at `#a85300` / `#e8934a` — the same hue (~35°) at nearly the same
lightness. Flipping `data-accent` back would restore the collision the ADR was
written to remove, in one line, with no test objecting.

Alternatives considered:

- **Keep the block, fix only the drift.** Cheapest and preserves the escape
  hatch, but a hatch that reintroduces a documented collision in one edit is a
  loaded gun, and the drift proves nobody is watching.
- **Keep the block, add a test that forbids *using* it.** Better, but it
  leaves dead CSS whose only purpose is to be forbidden.
- **Move amber into the severity ramp as a fourth rung.** Rejected: the ramp is
  three rungs by ADR-026 and `--mep-warn` already occupies that hue.

## Decision

The `amber` accent block is deleted from `app.css`. Warm hues belong to the
severity ramp only; an accent must sit outside that band.

`tests/design-tokens-accent-discipline.test.ts` enforces six things:

| Check | What it stops |
|---|---|
| Every `--mep-acc` in a `[data-accent]` block has hue outside 0–70° / >340° | A warm accent returning under any name |
| No `[data-accent="amber"]` block exists | The ADR-026 hatch reopening |
| No amber value (`#8a530f`, `#d59854`, `#7e4c0d`, `#e0a665`, and their rgb forms) anywhere in `src/` | The `email.ts` class of drift, in any file |
| Every `data-accent="…"` in `src/` names a block `app.css` declares | A typo silently resolving the accent to nothing |
| No `const *COLORS/PALETTE/SERIES/CAT*` array contains `--mep-warn/caution/neg/pos` | The `TrendChart` class of misuse |
| No component hard-codes a value from the accent or severity ramp | Copies that stop tracking the token |

`email.ts` is the one sanctioned copy of the ramp — email clients do not
resolve custom properties — so it is exempt from the last check and pinned by
a stricter one instead: its `COLOR_ACCENT`, `COLOR_BG`, `COLOR_SURFACE` and
`fg` constants are asserted equal to the light-theme token values.

Fixed in the same change: `email.ts` moves to `#34507a` / `rgba(52,80,122,.10)`;
`TrendChart` moves to `seriesColor()`; `DashboardMock` and `AppDashboardMock`
move to `--mep-cat-*`. `tests/guided-tour.test.ts` asserted that accent tokens
are scoped to `.mep[data-accent=…]` by matching the *amber* block — it now
matches `slate`, the accent the app actually sets, which is what that test
meant all along.

## Consequences

**ADR-026's restore path is gone.** Going back to amber now means re-adding the
block, re-reading this ADR, and deleting a test — which is the point. The
brand-warmth cost ADR-026 accepted is now paid permanently rather than
provisionally.

**`teal` stays.** It is unused by any route but sits at ~177°, nowhere near the
severity ramp, so it costs nothing and the hue test passes it. It is the
available escape hatch if slate ever needs replacing.

**Transactional emails change colour.** Their accent bar, links and button move
from amber to slate. This is visible to users in the next email they receive
and is the intended correction, not a regression.

**`TrendChart.svelte` is imported by nothing.** It was fixed rather than
deleted because a dead file that is wrong becomes a wrong file the moment
someone wires it up. It should be deleted or wired up; that call is not made
here.

**ADR-026's "Not handled" note still stands.** `notification-display.ts` returns
`--mep-info` for three notification types, and the two blues remain close. This
ADR does not touch it; the guard test does not cover it.

## Related

- [ADR-026](./ADR-026-warm-severity-ramp-cool-actions.md) — the ramp this
  enforces, and the source of the hatch this closes
- [app_shell.md](../../04_engineering/app_shell.md) — why accent tokens are
  scoped to `.mep[data-accent=…]` rather than `:root`
