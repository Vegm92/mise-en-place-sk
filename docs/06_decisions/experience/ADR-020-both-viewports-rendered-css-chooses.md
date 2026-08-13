# ADR-020 — Separate Mobile and Desktop Components, Both Rendered, CSS Picks One

**Status:** Active
**Feature:** Experience (UI)
**Date:** 2026-08-09

## Context

The two viewports are not the same product used at different widths. On a phone,
at the delivery door, the app is a camera and a confirm button: bottom tab bar,
thumb-reachable actions, one thing on screen. On a desktop, in the back office at
the end of the month, it is a data tool: dense tables, multi-column dashboards,
side-by-side comparison.

A single responsive component that serves both ends up as a thicket of
conditional classes and `{#if}` blocks where neither layout is legible and
changing one risks the other.

## Decision

**Distinct components per viewport — `mobile/Mobile*.svelte` and
`desktop/Desktop*.svelte` — and the page renders both, letting Tailwind
breakpoints show exactly one.**

```svelte
<div class="md:hidden">   <MobileDashboard  … /> </div>
<div class="hidden md:block"><DesktopDashboard … /> </div>
```

The route (`+page.svelte`) owns the data and the derivations; the two variants own
only presentation. `+page.server.ts` loads once for both.

### Why CSS and not `matchMedia`

The alternative is deciding in JavaScript and rendering one. It was rejected
because the app is server-rendered and the server does not know the viewport. A
JS decision means either rendering the wrong variant first and swapping — a
visible flash on every navigation — or holding the render until the client
reports its width, which sacrifices SSR's whole benefit on the connection where
it matters most.

With CSS, the correct layout is in the first byte of HTML and correct before any
JavaScript executes.

### Not every page is split

Only pages whose two experiences genuinely diverge have variants — dashboard,
invoice list and detail, suppliers, analytics, alerts. Everything else is one
responsive component. `mep/*` holds the shared design-system primitives
(`KpiCard`, `StatusBadge`, `Sparkline`, `ConfidenceDot`, `NotificationBell`) that
both variants compose, so the two layouts share behaviour and styling even where
they do not share structure.

`desktop/` holds fewer components than `mobile/` for exactly this reason: several
desktop pages had no reason to diverge.

## Consequences

- **Both trees are in the DOM.** Roughly double the nodes on split pages, and both
  variants' `$effect`s and lifecycle run. It has not been a measured problem —
  these are data-display pages, not animation-heavy ones — but it is the cost
  being paid, and it is the first thing to examine if a split page feels heavy.
- **Hidden content is still accessible-tree content.** `display: none` removes it
  from assistive technology too, so screen readers see one variant — but any
  future use of visibility-only hiding would expose duplicate landmarks and
  headings. Keep the split on `hidden`/`md:hidden`.
- **A feature must be added twice** on split pages, and it is possible to fix a bug
  in one variant and not the other. The mitigation is that shared logic lives in
  the route or in `mep/`, so what is duplicated is layout, not behaviour.
- **`md` (768px) is the single breakpoint** that decides. Tablets in landscape get
  the desktop layout. One threshold, applied consistently, beats per-page
  judgement calls.
- **Testing means both.** A viewport-specific regression is invisible at the other
  width, and the split is deliberate enough that "it works on desktop" says
  nothing about the phone.

## Related

- [ADR-021](./ADR-021-bilingual-single-string-table.md) — the other cross-cutting UI decision
