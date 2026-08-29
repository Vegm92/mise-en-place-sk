# ADR-033 — The mark is a descending m; the name starts with it

**Status:** Active
**Feature:** experience
**Date:** 2026-08-29

## Context

The mark had been three vertical bars of decreasing height since the brand
pair was settled ([ADR-028](./ADR-028-ink-is-the-accent.md),
[ADR-032](./ADR-032-the-ink-gains-a-hue.md)). It carried the product's core
promise — spend on albaranes, products and suppliers stepping down over time —
but only abstractly, and it said nothing about the name.

A canvas exploration of eighteen candidates (two rounds, the second remixing
the two favourites) landed on one that says both things at once: a lowercase
**m** drawn as a single round-capped stroke whose second shoulder sits lower
than the first. The letter is the initial of the name; the descending
shoulders are the spend curve. In the wordmark treatment the mark does not
sit *next to* the name — it **begins** it: the m, scaled to the ascender
height of Mona Sans 600 and sitting on its baseline, is the initial of
"Mise en place".

The wordmark metrics were not eyeballed. Rendering the real Mona Sans 600 in
a browser: the l/M ascender is ~0.74em, and at that height the compact
monogram's ink box (17.8×15.6 in its 24-unit space) has almost exactly the
proportions of the font's own capital M — a wider, letter-proportioned
variant was tried and rejected as bloated.

## Decision

- **Artwork**: SVG path
  `M4.4 18.5 V9.5 Q4.4 5.5 8.2 5.5 Q12 5.5 12 9.5 V18.5 M12 13 Q12 9.5 15.8 9.5 Q19.6 9.5 19.6 13 V18.5`
  in a 24-unit box, stroke 2.6, round caps and joins, centred (ink x 3.1–20.9,
  y 4.2–19.8). Everything issue #571 pinned stays pinned: one in-app copy
  (`Logo.svelte`, `stroke="currentColor"` + `--mep-acc`), one sanctioned email
  copy with byte-identical path data, favicon and PWA icons on the manifest's
  ink/parchment pair.
- **Wordmark mode**: `<Logo wordmark />` renders the m as the initial of
  "ise en place" — svg sized so ink height = 0.878·size·0.74em-equivalent,
  `vertical-align: -0.175·size` puts the ink bottom on the text baseline,
  `margin-left: -0.079·size` closes the gap to the font's own letter fit. The
  whole logotype takes `--mep-acc`, so it flips with the theme as one word.
  Brand lockups across the app use wordmark mode; the bare mark remains for
  tight spots (collapsed sidebar, mobile admin header).
- **Icons**: `scripts/generate-pwa-icons.mjs` rasterises the same path
  (disc-stamped stroke, 4× supersampled) — still Node built-ins only.
- **Email**: keeps the mark-plus-name table lockup rather than wordmark mode;
  email clients cannot be trusted with the negative-margin/baseline alignment,
  and ADR-028's email exception already accepts a fixed literal there.

## Consequences

- The name is now written "**M**ise en place" by the logotype itself;
  standalone brand text next to the mark disappears from the app's lockups.
- At 16px favicon size the stroked m is softer than the bars were — accepted;
  the supersampled rasteriser keeps it legible, and 32px+ is crisp.
- Stripe-facing branding (Checkout, customer portal, receipts) is configured
  in the Stripe Dashboard, not in code — `static/brand/wordmark.png` and the
  512px icon exist for that upload; see
  `docs/05_operations/stripe_branding.md`.
- `tests/logo-usage-consistency.test.ts`'s fingerprint and geometry
  extraction moved from `<rect>` bars to the path data; its invariants are
  unchanged.
