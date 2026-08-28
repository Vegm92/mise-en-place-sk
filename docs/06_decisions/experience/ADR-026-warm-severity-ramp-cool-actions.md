# ADR-026 — Severity is a warm traffic-light ramp; blue is reserved for actions

**Status:** Active, amended by [ADR-027](./ADR-027-amber-accent-removed-and-enforced.md),
by [ADR-028](./ADR-028-ink-is-the-accent.md) — the severity ramp stands; the
accent is no longer `slate` but the ink itself — by
[#720](https://github.com/Vegm92/mise-en-place-sk/issues/720), which adds the
on-tint column below, and by
[#749](https://github.com/Vegm92/mise-en-place-sk/issues/749), which fixes the
two on-tint gaps #720 left open
**Feature:** experience
**Date:** 2026-08-26

> **Amendment (2026-08-28, #720).** The table below measures each token as a
> flat *fill* against `--mep-surface`. Every one of these tokens is also used
> as *text on its own `-soft` tint* (active nav rows, badges, the `.rev-rail-btn`
> pattern) — a different, unmeasured pair, because compositing a translucent
> tint over the surface changes what the text sits on. Working that pair out
> for `slate` in dark surfaced a real failure: `--mep-acc-soft` there was
> `rgba(111,143,196,0.16)`, and `#6f8fc4` text on that tint over the current
> `--mep-surface` (`#1b1b1d`) composites to 4.18:1 — below the 4.5:1 AA floor,
> despite the flat-fill number (5.10:1 as originally measured, 5.24:1 against
> the current surface) reading as safely clear. Fixed by lowering that one
> alpha to `0.10`, which clears AA at 4.58:1 and keeps the tint about as
> visible as the live `tinta` accent's own light-mode tint (1.14:1 vs 1.15:1
> visibility against their respective surfaces) — see
> `tests/contrast-tokens.test.ts`.
>
> The same on-tint pass over `--mep-neg` and `--mep-caution` (below) turned up
> two more pairs under 4.5:1 in the current tokens — `--mep-neg` text on its
> own tint in dark (4.16:1) and `--mep-caution` text on its own tint in light
> (4.35:1). Neither was fixed here: #720 scoped this change to the accent/slate
> pair only, and `--mep-neg`/`--mep-caution` are the severity ramp, a
> different blast radius. Filed as #720 follow-up.
>
> Also note: `--mep-surface` in dark has drifted from `#1e1d23` (the value
> this ADR's original table was measured against) to `#1b1b1d`, folded in by
> ADR-028's neutral-palette pass without a corresponding update to this table.
> The **Light**/**Dark** fill columns below are therefore historical — accurate
> to 2026-08-26 — not a live re-measurement; the on-tint table restates current
> fill numbers alongside the new column so both are visible together.
>
> **Amendment (2026-08-28, #749).** Fixed both pairs #720 left open, same
> method: `--mep-neg-soft`'s dark alpha `rgba(225,107,107,0.18)` →
> `rgba(225,107,107,0.12)`, clearing on-tint AA at 4.57:1 (was 4.16:1);
> `--mep-caution-soft`'s light alpha `rgba(127,107,0,0.14)` →
> `rgba(127,107,0,0.11)`, clearing on-tint AA at 4.53:1 (was 4.35:1). Every
> other severity/accent on-tint pair enumerated by `tests/contrast-tokens.test.ts`
> — `--mep-neg` light, `--mep-warn` both themes, `--mep-caution` dark, `slate`
> `--mep-acc` both themes — stayed unchanged and stays clear of the 4.5:1
> floor. Both new tints stay more visible than the #720 slate-dark precedent
> (1.17:1 and 1.16:1 respectively vs 1.14:1, tint-composited-over-surface
> contrast). The full usage sweep (badges, alert rows, work cards, KPI cards,
> banners, the payables rail) found every on-tint pairing routes through these
> two CSS custom properties — no component hard-codes the tint or the text
> colour — so the token-level fix covers the ramp's full blast radius with no
> component changes required.

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

Ratios are against `--mep-surface` (`#ffffff` light, `#1e1d23` dark as it stood
on this date), ~~because these values are used as text on their own `-soft`
tint as well as as fills~~ — **corrected by #720:** these are flat-fill ratios
only. Text on the `-soft` tint is a different, translucent pair that was not
actually measured until #720; see the on-tint table below.

| Rung | Token | Light fill | Light on-tint | Dark fill | Dark on-tint |
|---|---|---|---|---|---|
| Alta | `--mep-neg` | 5.98:1 | 4.99:1 | 5.34:1 | 4.57:1 (was 4.16:1 — fixed by #749) |
| Media | `--mep-warn` | 5.38:1 | 4.55:1 | 7.13:1 | 5.19:1 |
| Baja | `--mep-caution` | 5.24:1 | 4.53:1 (was 4.35:1 — fixed by #749) | 10.18:1 | 6.78:1 |
| Acción | `--mep-acc` (`slate`) | 8.16:1 | 6.98:1 | 5.24:1 | 4.58:1 (was 4.18:1 — fixed by #720) |

Computed against the current `--mep-surface` (`#ffffff` light, `#1b1b1d` dark)
and the current `-soft` alpha of each token, by
[the compositing method #720 introduced](https://github.com/Vegm92/mise-en-place-sk/issues/720)
and `tests/contrast-tokens.test.ts` pins going forward: relative luminance per
WCAG 2.x, alpha-composited onto the surface before computing the ratio. Fill
numbers differ slightly from the original table above because `--mep-surface`
(dark) moved from `#1e1d23` to `#1b1b1d` under ADR-028; token hex values
themselves are unchanged except `--mep-caution`, which ADR-028 moved to
`#7f6b00` for its *own* on-tint contrast (that row already reflects the
current value). The `slate` accent's dark `-soft` alpha changed in #720,
`rgba(111,143,196,0.16)` → `rgba(111,143,196,0.10)`; `--mep-neg`'s dark
`-soft` alpha and `--mep-caution`'s light `-soft` alpha changed in #749 — see
that amendment above.

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
state, not kind), by the contrast ratios recorded in the table above, and by
`tests/contrast-tokens.test.ts` (on-tint ratios, added by #720, extended to
assert the full severity ramp by #749).

## Related

- [ADR-027](./ADR-027-ink-is-the-accent.md) — supersedes the `Acción` row above
  and moves `--mep-caution` to `#7f6b00` for contrast; the ramp itself stands
- [#720](https://github.com/Vegm92/mise-en-place-sk/issues/720) — found that
  `slate`'s dark `--mep-acc` fails AA as text on its own `-soft` tint despite
  clearing it as a flat fill; added the on-tint column above and fixed the
  `slate` dark alpha. `--mep-neg` (dark) and `--mep-caution` (light) failed the
  same on-tint check and were left open — see the amendment above
- [#749](https://github.com/Vegm92/mise-en-place-sk/issues/749) — fixed the two
  on-tint gaps #720 left open (`--mep-neg` dark, `--mep-caution` light) and
  upgraded `tests/contrast-tokens.test.ts` from documenting them to asserting
  AA on the whole severity ramp
- [ADR-020](./ADR-020-both-viewports-rendered-css-chooses.md) — mobile and
  desktop both render, so a token change lands on both at once
- [dashboard.md](../../03_features/dashboard.md) — the surface this was decided on
