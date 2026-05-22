# Mise en Place — Design Implementation TODO

From design audit against Claude Design file (amber accent, Mona Sans).

## Priority 1 — Quick wins (tokens + accent)
- [x] **Font: Mona Sans** — swap `DM Sans` → `Mona Sans` in app.css + @import in app.html
- [x] **Accent: amber** — change `data-accent="teal"` → `data-accent="amber"` in +layout.svelte
- [x] **`--mep-pad` density token** — add to app.css density section

## Priority 2 — New shared components
- [x] **`Sparkline.svelte`** — SVG inline mini trend chart (port from design's `MEPSparkline`)
  - Props: `data: number[]`, `color?: string`, `width?: number`, `height?: number`
- [x] **`Delta.svelte`** — delta indicator with arrow + semantic color (port from design's `MEPDelta`)
  - Props: `value: number`, `suffix?: string`, `invert?: boolean`

## Priority 3 — Upgrade existing components
- [x] **`KpiCard.svelte`** — add `spark?: number[]`, `delta?: number`, `deltaCtx?: string`, `invert?: boolean` props
  - Show Sparkline in top-right when `spark` provided
  - Show Delta + deltaCtx below the value when `delta` provided
- [x] **`TrendChart.svelte`** — rewrite as stacked SVG bar chart by category
  - Remove Chart.js dependency
  - Stack bars by spend category with category colors
  - Time range pill selector (7d / 30d / 90d) in card header
  - Legend below chart
  - Use `var(--mep-acc)` / `var(--mep-divider)` for axis / gridlines

## Priority 4 — New page
- [x] **Invoice Detail page** — `/invoice/[id]/+page.svelte` + `+page.server.ts`
  - Left panel (45%): doc viewer with dotted bg, filename header, zoom controls, faux PDF render
  - Right panel (55%): read-only fields (supplier, invoice #, dates, total, status badge)
  - Line items table (`.tbl`) below fields
  - Activity timeline (uploaded → extracted → confirmed + timestamps)
  - Actions: Edit button → navigates to existing `/invoice/[id]/edit`, Download PDF, Delete (with confirm)
  - Breadcrumb: Facturas / [invoice_number]

## Notes
- Design URL: https://api.anthropic.com/v1/design/h/-FLJuEeNndGSaXZZbtypSw?open_file=Mise+en+Place.html
- User chose amber accent in design session
- All other token values already match the design exactly
- `--mep-pad` used in density-aware padding (comfortable=16px, default=14px, compact=12px)
