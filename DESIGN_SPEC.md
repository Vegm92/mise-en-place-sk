# Mise en Place — Design Specification

**Audience:** Claude Design and design tools. This document is declarative: it defines principles, hierarchy, patterns, and intent. Design tooling should interpret and apply these within its own aesthetic judgment.

---

## Philosophy

The app handles financial data for restaurant owners — people who stand on their feet 12 hours a day and check their phone between service rushes. Every screen must answer the question *"what do I need to act on right now?"* in under 3 seconds.

**Core principles:**
- **Data density over whitespace.** This is not a marketing page. Information should fill the screen meaningfully. Generous whitespace is waste when a restaurateur needs to see last week's spend and today's alerts at a glance.
- **Trust through precision.** Rounded numbers, vague labels, and decorative elements erode confidence in financial data. Every number should be exact, labeled, and sourced.
- **Friction-free primary action.** The single most common action — uploading an invoice — must never require more than 2 taps/clicks from any screen.
- **Progressive disclosure.** Show the essential, hide the optional. Details expand on demand.
- **Mobile-aware, desktop-first.** The primary work surface is a laptop or desktop. Mobile is for quick checks and photo uploads. The layout must not be a degraded desktop experience on mobile — it should be a genuinely different, optimized surface.

---

## Visual Language

### Color

Use a neutral base of cool slate (not warm grey, not blue-grey — slate). The palette should feel precise and trustworthy, like a well-designed accounting tool.

- **Background:** A very slightly off-white surface, not pure white. Cards and panels should lift slightly from the background with a minimal depth difference — not heavy shadows, just enough to define layers.
- **Dark mode:** Full dark mode support. Dark backgrounds should be a deep, warm-neutral dark (not pure black), with panels being slightly lighter than the base. Dark mode is not an afterthought — it is equally designed.
- **Primary accent:** A single strong accent color used for primary actions, active states, and key data highlights. It should be distinctive but not aggressive — consider deep teal, slate-blue, or a controlled amber. Whatever is chosen, it must pass WCAG AA on both light and dark backgrounds.
- **Semantic colors:** Use color purposefully and consistently:
  - Green: positive delta, savings, within-budget, successful extraction
  - Red/rose: alerts, over-budget, price increase, error
  - Amber: warning, pending, review needed
  - Blue: informational, neutral data link
  - These are never purely decorative.
- **Supplier/category identifiers:** A set of 8–10 distinct but muted colors assigned to supplier or spend categories. Used consistently across all charts, tags, and table rows throughout the app session.

### Typography

- **Font family:** A single high-quality sans-serif variable font. Something with good legibility at small sizes and excellent tabular number support (e.g., Inter, Geist, or equivalent). Do not use decorative or display typefaces anywhere in the product.
- **Scale:** 5 sizes maximum in active use: small label (11px), body (13px), body-medium (14px), subtitle (16px), title (20–24px). Larger sizes only for dashboard hero numbers.
- **Numeric data:** Always use tabular figures (equal-width digits) for any column of numbers, prices, or quantities. This is non-negotiable — misaligned columns in financial tables are an immediate trust signal failure.
- **Weight contrast:** Use weight (not size) to create hierarchy within a data row — a bold supplier name with regular-weight invoice number and light-weight date in the same 13px size is cleaner than three different font sizes.
- **Line length:** Body text and labels should never exceed ~70 characters per line. Invoice descriptions may wrap but should be truncated with tooltip on hover when in compact table rows.

### Spacing & Layout

- **Grid:** 12-column grid on desktop, collapsing to 4 on mobile. Panels and cards snap to the grid — no arbitrary widths.
- **Spacing unit:** 4px base unit. All spacing values are multiples of 4. Common spacings: 4, 8, 12, 16, 24, 32, 48.
- **Card radius:** Consistent, moderate border radius — enough to feel modern, not so much it looks like a toy. 8px on cards, 6px on inputs, 4px on tags/badges.
- **Elevation:** Three levels only: background, surface (cards/panels), overlay (modals/dropdowns). No more. Define them by subtle background shift and a single drop-shadow level, not by stacking multiple shadows.
- **Dividers:** Use space and background contrast to separate sections wherever possible. Explicit divider lines should be thin (1px), very low contrast, and used sparingly.

### Iconography

- Consistent icon set throughout. Line icons (not filled), medium weight, optically aligned with surrounding text.
- Icons used to reinforce meaning — never as decoration. If an icon adds no information, remove it.
- Alert icons, status indicators, and navigation icons should be immediately recognizable — prefer commonly understood metaphors.

### Motion

- Minimal. Transitions between states: 150–200ms, ease-out. No bouncing, no elaborate entrances.
- Loading states: skeleton screens (not spinners) for content areas. Spinners only for button loading states.
- Avoid motion that delays information delivery. A user waiting for an extraction result should see a clear progress state, not an animation that obscures timing.

---

## Navigation

### Shell

A persistent left sidebar on desktop. Not a collapsible hamburger — always visible, because navigation context must always be clear for a productivity tool. Width: compact enough to not steal content space (~220px), wide enough for legible labels.

Sidebar structure:
1. **App logo / wordmark** at top — minimal, single line
2. **Primary navigation:** 6–8 items, icon + label, grouped logically:
   - Dashboard (home)
   - Invoices
   - Suppliers
   - Analytics (with sub-items: Spend, Prices)
   - Budgets
   - Reminders
3. **Utility navigation** pinned to bottom: Settings, Help/Feedback, User avatar + name
4. **Upload invoice** — a visually distinct call-to-action within or just below the primary nav. This is the most frequent action and should be permanently, unmistakably accessible. Consider an accent-colored button or elevated visual treatment.

Active state: clear active item highlight with the accent color. No ambiguity about where you are.

On mobile: bottom tab bar with the 4–5 most important destinations. Upload invoice accessible from a center, raised tab button (iOS convention). Sidebar is replaced entirely.

### Breadcrumbs

Used on detail pages (invoice detail, supplier detail) to show context and enable back-navigation. One level deep — `Invoices / Factura 2026-0471`. Always linkable.

---

## Dashboard — The Central Axis

The dashboard is the first screen after login and the most important screen in the app. It should answer, without scrolling on a standard laptop viewport (1280×800+):

1. **How much did I spend this week/month?**
2. **Are there any alerts I need to act on?**
3. **Which suppliers are driving my costs?**
4. **Am I over or under budget?**
5. **What invoices need my attention?**

### Layout

A three-column grid on wide viewports, collapsing to two then one on narrower screens.

**Top row — KPI strip:**
Four hero metric cards spanning full width. Each card contains:
- A label (e.g., "This month's spend")
- The primary number in a large, bold, tabular font
- A delta indicator vs. the previous period: "+12% vs last month" with semantic color (green down = good for spend, red up = alert)
- A sparkline or micro-chart showing trend over the last 30 days
- An optional subtitle (e.g., "across 14 invoices")

Suggested KPIs: Total spend this month, Average spend per supplier, Pending to pay, % budget used.

**Second row — left 2/3:**
A spend-over-time chart. Bar chart (not line — restaurant owners think in weekly buckets, not smooth trends). Each bar is a week or a day, depending on the selected time range. Bars can be stacked by top spend category. Time range selector (7d / 30d / 90d) in the card header, no modal. The chart fills the card — this is the primary analytical surface of the dashboard.

**Second row — right 1/3:**
An alert feed. This is not an afterthought — it is a primary surface. Each alert item:
- Icon indicating type (price increase, stock alert, payment due)
- One-line description in plain language: "Aceite oliva: +18% vs. last order (Proveedor Ibérico)"
- Timestamp
- A dismiss or "view" action inline
- Semantic background color tinting the entire row (subtle rose for price increase, amber for pending, etc.)

Alerts are sorted by severity, then recency. If no alerts: show a calm empty state — "No alerts — you're up to date." Not an empty box with a sad icon, just a clean affirmation.

**Third row — left 1/2:**
Supplier spend breakdown. Horizontal bar chart or ranked list with embedded bar. Top 6–8 suppliers by spend in the current period. Each row: supplier name, spend amount, percentage of total, and a small bar. Tappable to navigate to that supplier's detail.

**Third row — right 1/2:**
Recent invoices. A compact table of the last 5–8 invoices. Columns: supplier name, invoice number, date, total, status (extracted/confirmed/pending). Each row is clickable. "View all invoices" link at the bottom.

**Sticky header / page header:**
At the very top of the content area (not the sidebar): the page title "Dashboard", a period selector (this month / last month / custom), and the Upload Invoice button again — persistent at the top level.

### Information Hierarchy on Dashboard

The visual weight must follow the informational priority:
1. KPI numbers (largest, highest contrast)
2. Alerts (accent-colored, demand attention)
3. Spend chart (large surface, secondary weight)
4. Supplier list and recent invoices (supporting context, tertiary weight)

Nothing decorative should compete with any of these.

---

## Invoice Upload Flow

### Entry Point

Accessible from: sidebar CTA, dashboard "Upload" button, and the invoice list page header. All three go to the same flow.

### Step 1 — File Drop

A large, centered drop zone occupying the majority of the viewport. Clear affordance: dashed border, icon, explicit instruction "Drop invoice PDFs or photos here, or click to browse." Accepts PDF, JPG, PNG, HEIC.

Multiple files allowed. As files are added, they appear below the drop zone as a queue — thumbnail (for images) or file icon (for PDFs), filename, file size, and a remove button. No upload happens yet.

A secondary option: "Or forward by email" — shows a unique forwarding address for this account. Subtle, not the primary path.

CTA: "Extract data from X invoice(s)" — accent button, disabled until at least one file is added.

### Step 2 — Extraction in Progress

Each invoice gets an individual progress state. The queue from step 1 persists on the left. On the right: a panel showing the currently processing invoice.

Progress is shown as a meaningful state, not a percentage: "Reading document…" → "Identifying fields…" → "Extracting line items…" → "Done." Use a subtle animated indicator, not a spinning circle.

If processing multiple invoices, they run in sequence or parallel. The queue shows per-item status.

### Step 3 — Review Extracted Data

The core screen. Two-panel layout:

**Left panel (40% width):** The original document. PDF rendered inline (scrollable if multipage), or the image. The user should be able to reference the source while reviewing extracted data. Do not show just a thumbnail — show the actual document.

**Right panel (60% width):** The extracted data in an editable form. Sections:
- **Header fields:** Supplier name (with autocomplete against known suppliers), Invoice number, Invoice date, Due date, Total amount, Currency — all editable inline
- **Line items table:** Each line item as an editable row — description, quantity, unit, unit price, total. Add row / remove row controls. The table should feel like a spreadsheet, not a form — tab-through editing between cells.
- **IVA/VAT summary:** Calculated and displayed automatically from line items. If the calculated total doesn't match the extracted total, show a clear discrepancy warning.

Fields where the AI had low confidence should be visually flagged (subtle amber underline or background) to draw attention without alarming.

A "Field extracted from document" tooltip on hover shows the raw text from the document that sourced that field — this builds trust in the extraction.

CTA: "Confirm and Save" — accent button. Destructive actions (discard, re-extract) are lower-weight and positioned away from the primary CTA.

---

## Invoice List

### Layout

Full-width table. Dense but not cramped. This page is used for lookup, audit, and bulk operations — information density is its purpose.

**Filters bar** (above the table, full width):
- Date range picker (with quick presets: this week, this month, last month, custom)
- Supplier multi-select dropdown
- Status filter (all / pending review / confirmed / exported)
- Search (searches across invoice number, supplier name, description)
- Export button (CSV) — right-aligned

**Table columns:**
Supplier, Invoice number, Date, Due date, Line items count, Total (IVA included), Status, Actions.

Status is always a badge: color-coded, never just text. "Confirmed" (green), "Pending review" (amber), "Exported" (blue).

Rows are clickable (navigate to invoice detail). Hover state is a subtle row highlight.

**Row density:** Compact default. Content should not feel like it's gasping for air between rows. 44px row height is sufficient for this context.

**Pagination or infinite scroll:** Pagination with explicit page controls and a "showing X–Y of Z" counter. Restaurant owners need to know how many invoices they're looking at.

**Empty state:** If no invoices match filters, show a clear "No invoices found" with a suggestion to clear filters or upload the first invoice. Not a sad illustration — just a clear message and action.

---

## Invoice Detail / Edit

### Layout

Two-column on desktop: document viewer (left, 45%) + data panel (right, 55%). Same pattern as the extraction review, because the mental model is the same: source document + structured data side by side.

The data panel shows all fields in a view mode by default. An "Edit" button enters edit mode for all fields simultaneously. In edit mode, the same spreadsheet-like UX as the extraction review applies.

Below the main data: a timeline/history section — when the invoice was uploaded, extracted, confirmed, and any manual edits with timestamps. This is compact, not prominent.

**Supplier linkage:** The supplier field links to the supplier's profile. One click.

**Actions available:** Edit, Export as PDF, Delete (with confirmation). Delete is a destructive action — put it behind a secondary menu or a confirm step, never a single accidental click.

---

## Suppliers

### List View

Similar density to the invoice list. Each supplier row: name, category badge, number of invoices, total spend (all time), last invoice date, and a "view" action.

A search bar at the top. A category filter.

Clicking a supplier navigates to their profile.

### Supplier Profile

**Header:** Supplier name, CIF/NIF if known, category, a "last seen" timestamp (most recent invoice).

**Tabs below header:**
1. **Overview** — spend trend chart for this supplier (bar chart, monthly), average invoice value, price change frequency
2. **Invoices** — filtered invoice list showing only this supplier's invoices (same table component as the main invoice list)
3. **Products** — every product/ingredient ever ordered from this supplier. Table: product name, unit, current price, previous price, delta, last ordered. This is where price shock history lives at the supplier level.
4. **Unit Conversions** — any custom unit mappings defined for this supplier (e.g., "garrafa" → 5L). Editable.

---

## Analytics — Spend

### Layout

A focused analytical view. Not a general dashboard — it answers a specific question: "Where is my money going, and how is that changing?"

**Page header:** Time range selector (same as dashboard — 7d, 30d, 90d, custom). All charts update together.

**Primary chart (full width):** Spend by category over time. Stacked bar chart. Categories are the user-defined spend categories assigned to suppliers. Each bar is a week. Legend below the chart, not to the side.

**Secondary row:** Three or four focused charts side by side:
- Top 5 suppliers by spend in period (horizontal ranked bar)
- Spend by day of week (to reveal delivery patterns)
- Month-over-month comparison (current vs. previous period, overlaid bars)

**Detail table below charts:** All line items from the selected period, grouped by category. Collapsible groups. Each row: product description, supplier, total quantity, total spend, average unit price. Sortable columns.

**Export:** A single "Export CSV" button in the page header.

---

## Analytics — Prices

### Layout

This page answers: "Which ingredient prices are changing, and by how much?"

**Product search / filter bar:** Search by product name. Filter by supplier. Filter by date range.

**Product price cards:** A grid of cards (3 per row on desktop), one per tracked product. Each card:
- Product name (bold)
- Current price per unit
- Delta from previous order: "+€0.40/kg (+8%)" in semantic red or green
- A small sparkline showing price over last 5–10 orders
- Supplier name below
- Last updated date

Cards are sorted by delta magnitude by default — biggest price changes at the top, because those are the most actionable.

**Detail view:** Clicking a product expands or navigates to a full price history chart for that product. Line chart over time, with each data point being an order. Tooltip on hover showing invoice number, date, price, and supplier.

---

## Budgets

### Layout

A single-page view. Not a complex modal-driven flow — everything visible and editable in place.

**Page header:** Current month label + a toggle to view previous months (read-only).

**Budget table:** One row per category. Columns:
- Category name (with color swatch matching the spend analytics)
- Budget amount (editable inline — click to edit)
- Spent so far this month
- Remaining
- Progress bar (fills with semantic color: green < 80%, amber 80–100%, red > 100%)
- % used

A total row at the bottom aggregating all categories.

**Adding a category:** A "+ Add category" row at the bottom of the table. Inline input.

**Alert threshold:** A global setting visible on this page — "Alert me when any category reaches X% of budget." Editable inline. Not buried in settings.

---

## Reminders

### Layout

A clean list of payment reminders. Not a calendar — a task list.

**Filters:** All / Due this week / Overdue / Paid.

**Each reminder item:**
- Supplier name
- Invoice number (linkable)
- Amount due
- Due date
- Days until due (or "Overdue by X days" in red)
- Status: Pending / Paid
- Mark as paid button (single click, no modal required — optimistic UI update)

Overdue items surface to the top automatically, colored in red/rose.

**Add reminder:** A "+ New reminder" button in the page header. A minimal inline form: supplier (autocomplete from known suppliers), invoice number (optional), amount, due date. No full modal needed.

---

## Settings

### Layout

A left-nav within the settings page (or a segmented control on mobile) with sections:
- **Account** — name, email, password change
- **Team** — user management, roles, invite
- **Notifications** — which alerts fire, via what channel (in-app, email), at what thresholds
- **Billing** — current plan, usage (documents this month vs limit), payment method
- **Data & Export** — bulk export, data retention, delete account

Settings should be clean and form-heavy. No unnecessary illustration. Each section is a focused form. Save changes with an explicit "Save" button per section — no auto-save for settings (too high-risk for sensitive data like notification thresholds).

---

## Upload Invoice — Mobile Experience

On mobile, the upload flow is optimized for the scenario: the restaurateur just received a paper invoice and wants to log it immediately.

**Entry:** A camera-first interface. The screen opens to a camera view with a document detection overlay (a framing guide for the invoice). A button to switch to "Choose from library" for PDFs or already-taken photos.

**After capture:** A quick preview with crop/rotate tools. Then the same extraction + review flow, adapted to single-column mobile layout. The document viewer is a thumbnail that can be tapped to expand full-screen — not a permanent side-by-side panel.

**Review on mobile:** Each field on its own row. The line items table becomes a card-based list (one card per line item, tap to expand and edit). This is slower than the desktop table experience but is usable without a keyboard.

---

## Empty States & Onboarding

**First login:** The dashboard shows a purposeful empty state — not a generic illustration but a clear, structured prompt:
1. "Upload your first invoice" — large primary CTA
2. "Set up your categories" — secondary link
3. A brief one-line explanation of what the app does: "Mise en Place reads your supplier invoices and tells you when prices change."

Do not show an empty dashboard with eight zero-value KPI cards and empty charts. That is disorienting. Replace the entire dashboard with the onboarding prompt until the first invoice is confirmed.

**Empty states for individual sections:** Each section (invoices list, suppliers, reminders) should have a specific, contextual empty state with a clear action. "No invoices yet — upload your first one." Not a generic "Nothing here."

---

## Accessibility

- All interactive elements meet WCAG AA contrast ratios in both light and dark mode
- Tab order follows visual reading order on all pages
- All form inputs have visible labels (never placeholder-only)
- Error states are communicated in text, not color alone
- The extraction review flow is fully keyboard-navigable (tab between cells, arrow keys in table)
- Touch targets on mobile are a minimum of 44×44px

---

## Design Anti-Patterns to Avoid

- **Modal-heavy flows.** If an action can be done inline, do it inline. Reserve modals for truly disruptive or high-consequence operations (delete, bulk action confirmation).
- **Sidebar within sidebar.** One level of navigation only. If a section has sub-pages (Analytics > Spend, Analytics > Prices), use tabs or a secondary top nav — not a nested sidebar.
- **Charts as decoration.** Every chart on every page must answer a specific question. If it cannot be articulated in one sentence, it should not exist.
- **Inconsistent empty states.** Every list view must have a designed empty state. No raw "No data available" text.
- **Loading spinners for page transitions.** Use skeleton screens for content areas. Spinners are only for in-place loading (button states, small widgets).
- **Truncation without tooltip.** Any truncated text (long supplier names, product descriptions) must show the full content on hover.
- **Ambiguous financial numbers.** Every monetary value must show its currency (€ prefix), be formatted with correct locale separators (1.234,56 €), and be labeled with its period or context.
