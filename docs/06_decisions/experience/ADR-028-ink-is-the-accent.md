# ADR-028 — The accent is the ink; no hue carries the brand

**Status:** Active, amended by [ADR-031](./ADR-031-the-ink-gains-a-hue.md)
**Feature:** experience
**Date:** 2026-08-26

## Context

[ADR-026](./ADR-026-warm-severity-ramp-cool-actions.md), decided the same day,
settled the severity ramp and moved the accent from `amber` to `slate`. It
solved the collision it set out to solve — a warm ramp against a cool action —
but it left the accent question half-answered, and slate was chosen as the
safer of two hues rather than as a position.

Reviewing five directions side by side on the real Resumen screen surfaced the
underlying constraint: **`--mep-acc` is used both as a fill (primary button
background, with `--mep-acc-fg` on top) and as text (active nav, links, the
actual-spend stroke).** A single token doing both jobs cannot be bright. Any
saturated accent has to darken until it clears 4.5:1 as text on white, at which
point it is no longer the bright thing it was chosen for. That is why the
saffron direction failed its own premise in light mode.

The deeper problem is that a hued accent competes for meaning. The app's screens
are dense with colour that *already* means something: a three-rung severity
ramp, a seventeen-colour category ramp, a categorical chart series. Adding a
brand hue on top asks the reader to hold one more colour vocabulary — the one
that means "press me" rather than "look at me".

Alternatives considered:

- **Keep `slate`.** No work, and it is genuinely inoffensive. But it sits three
  degrees of hue from `--mep-info`, so the app's one action colour and its one
  informational colour are near-twins — a collision ADR-026 disclosed and did
  not fix.
- **A warm accent (terracotta, saffron).** More brand character, and warmth
  suits a kitchen product. Rejected because it lands inside the severity ramp's
  own band: on a work card the primary button and the alert edge become the
  same family, which is precisely the ambiguity ADR-026 was written to remove.
- **A green accent.** Distinctive and on-theme for a produce buyer, but it
  collides with `--mep-pos`; it only works if "positive" moves to teal, which
  buys a second problem to solve the first.
- **A plum accent.** The only *hue* with no semantic collision at all, and the
  runner-up. Rejected because it is the least legible tone on the cheap,
  backlit screens that these apps actually run on in a kitchen.

## Decision

**The accent is the ink.** `--mep-acc` is near-black on paper and near-white on
ink; the primary button is a black rectangle in light mode and a white one in
dark. Every route root sets `data-accent="tinta"`.

| Token | Light | Dark | On `--mep-surface` |
|---|---|---|---|
| `--mep-acc` | `#17171a` | `#edecea` | 17.89:1 / 14.57:1 |
| `--mep-acc-fg` | `#ffffff` | `#17171a` | 17.89:1 / 15.15:1 on the fill |
| `--mep-acc-hover` | `#2f2f34` | `#dcdbd9` | — |
| `--mep-acc-soft` | `rgba(23,23,26,.07)` | `rgba(237,236,234,.12)` | — |
| `--mep-acc-ring` | `rgba(23,23,26,.22)` | `rgba(237,236,234,.25)` | — |

The neutrals move with it, from a warm grey to an achromatic paper, so that
nothing in the chrome carries a temperature either:

| Token | Light (was → is) | Dark (was → is) |
|---|---|---|
| `--mep-bg` | `#f5f4f0` → `#f1f0ee` | `#16151a` → `#131314` |
| `--mep-surface-2` | `#fafaf7` → `#f8f7f5` | `#25242b` → `#222224` |
| `--mep-fg` | `#1a1f26` → `#17171a` | `#ece9e2` → `#edecea` |
| `--mep-fg-2` | `#4a5562` → `#46464a` | `#a8a39a` → `#a5a5aa` |
| `--mep-fg-3` | `#5f6b78` → `#5b5b60` | `#918b82` → `#8d8d93` |
| `--mep-fg-4` | `#64707d` → `#6b6b70` | `#787168` → `#78787e` |

Borders and dividers retone from `rgba(15,20,30,·)` to `rgba(20,20,24,·)` and
gain a little weight (`.10/.18/.06` → `.13/.22/.07`), because an achromatic
ground gives less separation than a warm one did.

ADR-026's severity ramp is unchanged and remains the rule. One value moves for
contrast, not for hue: `--mep-caution` goes `#8a7300` → `#7f6b00`, because the
old value measured 4.43:1 on `--mep-surface-2` and these tokens are used as
text on their own tint. It is now 5.24:1 on `--mep-surface` and 4.90:1 on
`--mep-surface-2`.

The `slate`, `amber` and `teal` accent blocks stay in `app.css` as alternatives.

## Consequences

**Colour is now load-bearing.** With no brand hue anywhere, anything coloured on
a screen means something. That is the whole point, and it is also the cost: the
system has lost its escape hatch. There is no longer a "just make it the brand
colour" option for an element that needs emphasis without meaning — it has to
earn its emphasis from weight, size or position instead.

**The app has no colour personality.** It carries its character in Mona Sans,
the density and the spacing, and nothing else. A stakeholder who expects a
brand colour will not find one. This is the most likely thing to be argued back,
and reversing it means reversing this ADR, not tweaking a token.

**The dark primary button is heavy.** A near-white rectangle on a `#131314`
ground is the brightest object on the screen by a wide margin — much more
dominant than `slate`'s `#6f8fc4` was. On screens with several primary actions
this reads as loud. Mitigation is to have fewer primary buttons per screen,
which is the right pressure anyway.

**`--mep-info` is no longer near the accent.** ADR-026's warning that "nothing
else should adopt `--mep-info` for state while the accent is blue" is retired:
the accent is not blue any more, so the three notification types in
`notification-display.ts` that return `--mep-info` no longer risk reading as
actions. That specific "not handled" item from ADR-026 is now closed.

**`TrendChart` used the accent as a categorical series colour.** `CAT_COLORS[0]`
was `var(--mep-acc)`; under tinta that draws an ink line indistinguishable from
the axis. It moves to `var(--mep-series-1)`, which is the categorical ramp the
rest of the app already uses.

**The change reaches past `app.css`.** The PWA `theme-color` (`app.html`,
`static/theme-init.js`, `src/lib/theme.ts`) and `manifest.webmanifest` follow
the new ground. The transactional email templates in `src/lib/server/email.ts`
were still on the *amber* accent retired by ADR-026 and the old warm ground;
they move to tinta in the same commit.

**Not handled: the PWA icon art.** `scripts/generate-pwa-icons.mjs` draws the
mark in `#1C3B2A` forest green on `#F0E6D3` parchment — a palette that matched
neither the amber nor the slate era and does not match this one. That is logo
artwork rather than a token, so it is deliberately left alone; regenerating it
is a separate decision about the mark itself.

**Contrast.** Every semantic colour clears 4.5:1 on both `--mep-surface` and
`--mep-surface-2` in both themes. `--mep-fg-4` remains the one AA-large-only
tier in dark (3.92:1, up from 3.47:1 before); it is used for de-emphasised meta
text only.

## Update — PWA icon art regenerated, mark unified (issue #571)

The "Not handled" item above is resolved. `scripts/generate-pwa-icons.mjs` no
longer draws the unrelated `#1C3B2A`/`#F0E6D3` "M" letterform: it now draws
the same three-bar mark used in-app (`src/lib/components/mep/Logo.svelte`,
introduced this issue to unify the ten inline copies that existed) and in
transactional email (`email.ts`'s `LOGO_SVG`), in the ink/parchment pair —
`#17171A` on `#F1F0EE`, matching `manifest.webmanifest`'s `theme_color` /
`background_color` exactly. `static/favicon.svg` moves off a stray
pre-ADR-026 amber (`#B8741A`) it had carried untouched through both the
amber→slate and slate→tinta moves, onto the same pair and the same bar
geometry, scaled. `tests/logo-usage-consistency.test.ts` pins the icon
script's colour constants to the manifest going forward, and pins the
`Logo.svelte` / `email.ts` bar geometry to each other, so this does not drift
a third time.

## Update — the ink gains a temperature (ADR-031)

The rule below survives; the values in the two tables above do not.
[ADR-031](./ADR-031-the-ink-gains-a-hue.md) keeps `--mep-acc` as the ink doing
double duty as fill and as text, and keeps colour reserved for meaning, but
moves the ink off achromatic: `#1b2a44` light, `#8fa8cf` dark, with the neutral
ramp retoned from an achromatic paper to a cool one. Read this ADR for *why the
accent is the ink*; read ADR-031 for *what the ink currently is*. The
ink/parchment brand pair recorded in the icon update below likewise moves to
`#1B2A44` on `#ECEDF1`.

## Related

- [ADR-031](./ADR-031-the-ink-gains-a-hue.md) — amends this: same rule, warmer
  (well, cooler) ink; the current token values live there
- [ADR-026](./ADR-026-warm-severity-ramp-cool-actions.md) — amended: the
  severity ramp stands, its "Acción" row is superseded here
- [ADR-027](./ADR-027-amber-accent-removed-and-enforced.md) — the amber block
  and its enforcement test; `tests/design-tokens-accent-discipline.test.ts`
  now checks `tinta` where it checked `slate`
- [ADR-020](./ADR-020-both-viewports-rendered-css-chooses.md) — both viewports
  render, so this lands on mobile and desktop at once
