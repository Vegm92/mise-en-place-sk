# ADR-031 — The ink gains a hue

**Status:** Active
**Feature:** experience
**Date:** 2026-08-29
**Amends:** [ADR-028](./ADR-028-ink-is-the-accent.md)

## Context

[ADR-028](./ADR-028-ink-is-the-accent.md) made `--mep-acc` achromatic — near-black
on paper, near-white on ink — and retoned the neutrals to match, so that nothing
in the chrome carried a temperature. The reasoning holds up and is not in
dispute here: `--mep-acc` is used both as a *fill* (primary button, with
`--mep-acc-fg` on top) and as *text* (active nav, links, the actual-spend
stroke), so any accent has to clear 4.5:1 as text on `--mep-surface`, which is
what killed the saffron direction; and a saturated brand hue competes for
meaning against a screen already dense with colour that means something.

What ADR-028 did not weigh is the cost of spending *nothing*. Reviewed against
the app in daily use, the result reads as absence rather than restraint: a
screen of grey chrome where the only colour is an alert. The product has no
mark of its own — the logo is the accent, so it was black too — and the one
place a brand ought to assert itself, the public landing page, asserted
nothing.

The question this ADR answers is therefore narrower than ADR-028's: **can the
ink carry a temperature without becoming a hue that competes for meaning?**

Five directions were drawn on the real Resumen and Albaranes screens, in both
viewports and both themes, and reviewed side by side:

- **Verdemar** (`#0f5f5c`) — already declared in `app.css` as
  `data-accent="teal"` and never adopted. Rejected: ~40° of hue from
  `--mep-pos`, so on the invoice list an active filter chip and a "Revisado"
  badge read as the same family.
- **Ciruela** (`#6b2f5e`) — the only hue with no semantic collision at all, and
  the runner-up. Rejected for the reason ADR-028 already gave: it is the least
  legible tone on the cheap backlit screens these apps run on in a kitchen.
- **Índigo** (`#3a3a8c`) — rejected as the nearest neighbour to `--mep-info`
  (`#2a5fb5`), reintroducing exactly the collision ADR-028 held against slate.
- **Terracota** (`#9c4a2f`) — the best fit for a restaurant, and the worst fit
  for this system. It lands inside the severity band that
  `tests/design-tokens-accent-discipline.test.ts` refuses outright, and in dark
  the lifted accent (`#df8f6d`) and `--mep-warn` (`#e8934a`) are very nearly
  the same colour.
- **Tinta azul** — chosen.

## Decision

**The accent stays the ink; the ink gains a temperature.** `--mep-acc` moves
from achromatic to a blue-black in light and a steel blue in dark. The
attribute value stays `data-accent="tinta"` — it is still the ink — so no
call site changes.

| Token | Light (was → is) | Dark (was → is) |
|---|---|---|
| `--mep-acc` | `#17171a` → `#1b2a44` | `#edecea` → `#8fa8cf` |
| `--mep-acc-fg` | `#ffffff` (unchanged) | `#17171a` → `#101a2b` |
| `--mep-acc-soft` | `rgba(23,23,26,.07)` → `rgba(27,42,68,.09)` | `rgba(237,236,234,.12)` → `rgba(143,168,207,.13)` |
| `--mep-acc-hover` | `#2f2f34` → `#2b3f61` | `#dcdbd9` → `#a3b8da` |
| `--mep-acc-ring` | `rgba(23,23,26,.22)` → `rgba(27,42,68,.24)` | `rgba(237,236,234,.25)` → `rgba(143,168,207,.28)` |

The neutrals move with it, from ADR-028's achromatic paper to a cool one, so
the ground and the ink share a temperature instead of disagreeing:

| Token | Light (was → is) | Dark (was → is) |
|---|---|---|
| `--mep-bg` | `#f1f0ee` → `#ecedf1` | `#131314` → `#121319` |
| `--mep-surface` | `#ffffff` (unchanged) | `#1b1b1d` → `#1a1b21` |
| `--mep-surface-2` | `#f8f7f5` → `#f5f6fa` | `#222224` → `#212229` |
| `--mep-overlay` | `#ffffff` (unchanged) | `#2a2a2d` → `#292a32` |
| `--mep-fg` | `#17171a` → `#15181f` | `#edecea` → `#eceef2` |
| `--mep-fg-2` | `#46464a` → `#44464e` | `#a5a5aa` → `#a4a7b0` |
| `--mep-fg-3` | `#5b5b60` → `#595c65` | `#8d8d93` → `#8d9099` |
| `--mep-fg-4` | `#6b6b70` → `#696c75` | `#78787e` → `#787b84` |

Borders, dividers, hover, pressed, scrim and both shadows retone from
`rgba(20,20,24,·)` to `rgba(20,24,36,·)` in light, and gain a point of weight
(`.13/.22/.07` → `.14/.23/.08`) because a cooler ground separates slightly less
than the warm one it replaced.

**ADR-026's severity ramp is untouched — no value moves.** So is the
seventeen-colour category ramp, the chart series, every radius, the type scale
and the density scale. The accent is the only vocabulary that changed, and it
changed temperature, not job.

## Consequences

**Contrast.** The dual-duty constraint that killed saffron is satisfied with
room to spare. Measured against `--mep-surface`:

| Pair | Light | Dark |
|---|---|---|
| `--mep-acc` as fill / as text | 14,37:1 | 7,10:1 |
| `--mep-acc-fg` on the `--mep-acc` fill | 14,37:1 | 7,20:1 |
| `--mep-acc` as text on its own `-soft` tint | 12,13:1 | 5,66:1 |
| `-soft` tint against the bare surface (perceptibility) | 1,18:1 | 1,25:1 |

The light accent clears AAA. Every severity rung still clears the 4.5:1 on-tint
floor against the retoned dark surface — the shift moves each ratio by less
than 0.01, so `tests/contrast-tokens.test.ts`'s pinned values hold unchanged;
only its assertion of the dark surface's own literal was updated.
`--mep-fg-4` remains the one AA-large-only tier in dark (4,06:1, up from
3,92:1).

**One collision is accepted, not solved.** In dark, `--mep-acc` (`#8fa8cf`) and
`--mep-info` (`#5f8ee0`) are the same hue at different lightness. Nothing today
places them adjacent — `--mep-info` is used sparingly and never next to a link
or an active nav row — so this ships as a known limit rather than a defect. If
a screen ever does put them side by side, the cheap fixes are to lift the dark
accent to `#a8bcda` or move `--mep-info` toward cyan; neither touches the
severity ramp. This is the same class of disclosure ADR-026 made about slate
and did not act on, and it should be revisited the moment an informational
callout lands beside an action.

**The brand pair moves with the accent.** `manifest.webmanifest`'s
`theme_color` / `background_color` go `#17171A`/`#F1F0EE` → `#1B2A44`/`#ECEDF1`,
and `static/favicon.svg` plus every generated PWA icon and favicon follow, so
the installed-app chrome and the tab icon match the running app.
`scripts/generate-pwa-icons.mjs` kept the brand pair twice — once as the
`BG_HEX`/`FG_HEX` constants `tests/logo-usage-consistency.test.ts` reads, and
again as hand-written RGB channel literals the canvas actually painted. The
first recolour therefore passed the test while still drawing the old ink. The
channels are now derived from the hex constants, so the second copy is gone.

**The hand-copied palettes move too.** `src/lib/server/email.ts` (email clients
do not resolve custom properties) and `src/routes/s/[token]/og.png/+server.ts`
(a server-rendered share card has no viewer to theme for) carry sanctioned
copies of the light ramp; both are updated, and the accent-discipline test
already pins `email.ts` to the light tokens.

**Not handled.** The dark `--mep-acc` / `--mep-info` proximity above. And the
landing page still leans on the accent for its eyebrows, spot counter and
badges — that now reads as a brand rather than as chrome, which is the intent,
but no marketing-side review of the new pair has been done.

## Related

- [ADR-028](./ADR-028-ink-is-the-accent.md) — amended: the accent is still the
  ink and still does double duty as fill and text; only its temperature moves
- [ADR-026](./ADR-026-warm-severity-ramp-cool-actions.md) — the severity ramp,
  untouched here; the accent stays outside its band
- [ADR-027](./ADR-027-amber-accent-removed-and-enforced.md) — the enforcement
  test that keeps any accent, this one included, out of the severity hue band
