# ADR-026 — Severity is a warm traffic-light ramp; blue is reserved for actions

**Status:** Active, amended by [ADR-027](./ADR-027-amber-accent-removed-and-enforced.md)
and by [ADR-028](./ADR-028-ink-is-the-accent.md) — the severity ramp stands;
the accent is no longer `slate` but the ink itself
**Feature:** experience
**Date:** 2026-08-26

## Context

The colour system had drifted into two conflicting jobs for the same hues.
`--mep-info` (blue) carried "low severity" in `AlertRow`, while `--mep-acc`
(amber) carried "this is clickable" on every primary button. Any surface that
showed both — a list of work items each with its own action — put a blue
*state* next to an amber *action* and asked the reader to keep the two
vocabularies apart from context alone.

The dashboard rebuild made it worse before it made it better: it coloured work
items by *kind* (price, budget, payment, review, …), inventing a six-hue
taxonomy on top of a system whose rule, visible in `AlertRow`, is that colour
encodes severity and the icon encodes kind.

Alternatives considered:

- **Keep amber actions and blue low-severity, only fix the dashboard.** Cheapest,
  and it removes the six-hue taxonomy, but it leaves the underlying collision:
  the reader still has to learn that one blue means "no rush" and one amber
  means "press me".
- **Drop colour from severity entirely, carry it in badges.** Maximum restraint
  and no collision, but it costs the at-a-glance read that the dashboard exists
  for — a screen ranked by urgency where nothing looks urgent.
- **A cool severity ramp with warm actions** (the inverse). Symmetrically valid,
  but it fights the near-universal convention that red/amber means "attention"
  and it would have recoloured every alert surface in the app.

## Decision

Severity is a warm three-rung ramp; actions are cool. Nothing else changes hue.

| Rung | Token | Light | Dark | Meaning |
|---|---|---|---|---|
| Alta | `--mep-neg` | `#b03a3a` (5.98:1) | `#e16b6b` (5.19:1) | overdue, budget already blown, price rises |
| Media | `--mep-warn` | `#a85300` (5.38:1) | `#e8934a` (6.93:1) | forecast to overrun, but not yet |
| Baja | `--mep-caution` | `#8a7300` (4.63:1) | `#efc233` (9.91:1) | awaiting confirmation, payments not yet pressing |
| Acción | `--mep-acc` (`slate`) | `#34507a` (8.16:1) | `#6f8fc4` (5.10:1) | primary buttons, active nav, the actual-spend stroke |

Ratios are against `--mep-surface` (`#ffffff` light, `#1e1d23` dark), because
these values are used as text on their own `-soft` tint as well as as fills.

`--mep-caution` is a new pair. `--mep-warn` moves from olive (`#654a00`) to
orange. The default accent moves from `amber` to the pre-existing `slate`
theme: every route root now sets `data-accent="slate"`.

Components take their colour from severity, never from the kind of thing:
`WorkItem` carries a `severity: 'high' | 'med' | 'low'` field
(`src/lib/dashboard-turno.ts`) and `WorkCard` maps that, not `kind`, to a tone.
`AlertRow`'s `low` rung moves from `--mep-info` to `--mep-caution`.

## Consequences

**The light-mode yellow is not yellow.** A true yellow on white measures
1.68:1 — unreadable. `#8a7300` is the most yellow value that still clears
4.5:1, so in light mode the third rung reads as ochre and the traffic-light
metaphor is weaker than it is in dark, where `#efc233` is a real yellow. This
asymmetry is deliberate and is the main cost of the decision.

**`--mep-warn` turning orange is app-wide**, not scoped to the dashboard: it
carries `.badge-pending`, `AdminStatusBadge`, `AdminSystemBanner`,
`FieldInput`'s low-confidence state, `UploadPanel`, the waitlist mocks and
`semColor()`. All of them shift olive → orange in the same commit.

**Losing amber costs the brand's warmth.** The amber accent was the more
distinctive of the two, and slate is a safer, more generic blue. The trade is
deliberate: one unambiguous action colour beats a prettier ambiguous one. The
`amber` theme block stays in `app.css` and can be restored by flipping
`data-accent` back on the route roots. **Superseded by
[ADR-027](./ADR-027-amber-accent-removed-and-enforced.md):** the block is
deleted and a test forbids any warm accent, because the hatch reopened this
collision in one line and the drift it hid went unnoticed in `email.ts`.

**`--mep-info` survives but is no longer a severity.** It still colours
informational notification dots (`notification-display.ts`) and a `TrendChart`
series. `.badge-exported` moved to neutral so no badge reads as an action.
Nothing else should adopt `--mep-info` for state while the accent is blue —
the two blues are close enough to confuse.

**Not handled:** `notification-display.ts` still returns `--mep-info` for three
notification types. Those dots sit on the bell menu, far from any button, so
the collision is tolerable — but it is a collision, and the next surface that
puts one next to a primary button should move it to neutral.

Held in place by `tests/dashboard-turno.test.ts` (severity is derived from
state, not kind) and by the contrast ratios recorded in the table above.

## Related

- [ADR-027](./ADR-027-ink-is-the-accent.md) — supersedes the `Acción` row above
  and moves `--mep-caution` to `#7f6b00` for contrast; the ramp itself stands
- [ADR-020](./ADR-020-both-viewports-rendered-css-chooses.md) — mobile and
  desktop both render, so a token change lands on both at once
- [dashboard.md](../../03_features/dashboard.md) — the surface this was decided on
