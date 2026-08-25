# Admin Operations

The ops console under `/admin` (dashboard, events, revenue, health), the public health endpoint, and the server modules backing them. Admin access is guarded by `isAdminUser` in `src/lib/server/admin.ts`.

## Code notes

### `src/routes/(admin)/+layout.svelte`
**`markup`**
- Admin banner at the top; scrollable page content area beneath it.
- One `md` (768px) branch, per ADR-020 (issue #657): below it the header keeps its 52px rail but drops the labels that do not survive a phone — the "back to app" caption, the wordmark, the ADMIN badge and the admin email — leaving the chevron, the mark, the avatar and the theme toggle. The seven-item nav becomes the flexible child (`flex:1;min-width:0`) and scrolls horizontally inside the rail; the active-item underline is desktop-only because `overflow-x: auto` also clips vertically. Page containers and `AdminPageHead` pad 12px instead of 24px.

### `src/lib/components/admin/AdminTableScroll.svelte`
**`markup`**
- The scroll wrapper every admin `<table>` sits in (issue #657). Admin cards are `overflow: hidden`, so a table wider than its card used to have its right-hand columns clipped with no way to reach them — at 390px that was 11 of the 17 admin tables, up to 828px unreachable on the dead-letter queue. The wrapper scrolls that overflow instead of hiding it, and tables narrow enough to fit still fit. `tests/admin-mobile-tables.test.ts` fails if a new admin table is added outside this component, and asserts the measurements in `shots/admin-mobile-audit.json` written by `scripts/admin-mobile-audit.mjs`.

### `src/routes/(admin)/admin/+page.server.ts`
**`const load`**
- Aggregates: invoices saved in the last 7 days; active restaurants (had invoices) in the last 7 days (`COUNT(DISTINCT …)`); pending system notifications (global); total invoices, suppliers and restaurants; sessions currently being extracted by the worker; most recently created restaurants (raw `sql` template).
- `sql<number>` aggregates come back as strings from postgres.js — wrap with `Number(...)` before use.

### `src/routes/(admin)/admin/+page.svelte`
**`markup`**
- Sections: 7-day KPIs, totals, recent restaurants, links.

### `src/routes/(admin)/admin/events/+page.server.ts`
**`const load`**
- Loads the available event types for the filter dropdown.

### `src/routes/(admin)/admin/events/+page.svelte`
**`markup`**
- Type filter, table, pagination (only when `data.totalPages > 1`).

### `src/routes/(admin)/admin/revenue/+page.server.ts`
**`const load`**
- Revenue Performance Framework console (SaaS unit economics): MRR/ARR, ARPA, ACV, CAC, LTV, LTV/CAC, payback, NRR/GRR, churn, signup cohorts and revenue leakage, assembled by `revenueOverview()`. Definitions, formulas, caveats: `docs/02_product/revenue_metrics.md`.

**`const actions`**
- `addCost` / `deleteCost` maintain the acquisition-spend table that CAC divides by; without ≥ one month of spend, CAC, LTV/CAC and payback stay blank rather than reporting a zero cost of acquisition.
- `snapshot` / `backfill` are the manual twins of the daily `scheduled-mrr-snapshot` job: capture the current month now, or replay each subscription's current tier over its lifetime so cohorts and churn have history on day one. Backfilled rows carry `source = 'estimated'` and never overwrite a live capture.
- Amounts parsed with `parseAmountCents` (shared, tested), not `Number()`: a Spanish-speaking operator types `1.250,50` and it must mean 1250.50, not NaN.

### `src/routes/(admin)/admin/health/+page.server.ts`
**`const STUCK_MINUTES`**
- A dead worker leaves items stuck in queued/extracting; warn past this (15 min), error past the count threshold (issue #257).

**`function checkWorkerHeartbeat`**
- Stuck-item counts are a lagging, inferred signal; the heartbeat is the direct one (#540). `stale` is an *error*, not a warning: with nothing consuming `extract-invoice`, every upload in flight is heading for the stall timeout, which is a user-visible outage. Never having started is only a `warn` — that is the normal state of a fresh environment.
- Runs alongside the other DB-backed checks and falls back to `unknown` on failure, so a heartbeat problem never takes the whole health page down.

**`const load`**
- DB connectivity, and (only if reachable) table record counts; pg_stat not available in all environments.
- Worker liveness + queue depth — a worker that died Friday night otherwise shows a green page while invoices pile up in 'queued' (issue #257).
- Shared WhatsApp number (issue #321): one WABA serves every tenant, so a quality downgrade stops ingest for the whole base — it belongs on the same page as the worker and the DB.

**`property status`**
- "Never reported" is not healthy — the account-level webhook fields aren't subscribed yet, so a downgrade would arrive as silence.

**`const load`**
- Required env vars check.

### `src/routes/(admin)/admin/health/+page.svelte`
**`type Severity`**
- WhatsApp account events carry their own severity vocabulary (issue #321); map it onto the page's three states rather than inventing a second colour scheme.

**`const QUALITY_COLOR`**
- Meta's own quality-rating vocabulary, shown literally since that is what WhatsApp Manager UI says.

**`markup`**
- Checks; shared WhatsApp number (issue #321) — a downgrade here is an incident, not a metric; which tenant to talk to if blocks spike (read-only: de-authorising stays an explicit act in that owner's Settings); table row counts.

### `src/routes/api/health/+server.ts`
**`function GET`**
- DB reachability; worker / extraction queue depth (pg-boss) — a growing backlog is the canonical signal the worker is down or wedged; active upload sessions (24 h, analytics only); uploads directory check (local driver only, `fs.statfsSync`, Node ≥ 18.8).
- Queue depth alone is ambiguous: a backlog looks identical whether the worker is dead or merely busy. `worker.liveness` / `last_seen_at` / `last_job_completed_at` (from `worker_heartbeats`) are what disambiguate it (#540); read defensively so a missing heartbeat row degrades to `unknown` instead of throwing.
- Graceful degradation: `pgboss` schema not provisioned or a failed check leaves the flag false rather than throwing; responds 503 when degraded so load balancers / uptime monitors detect it.

### `src/routes/robots.txt/+server.ts`
**`const GET`**
- `(app)` is a SvelteKit route group and never appears in real URLs, so the authenticated pages are listed by their served paths.

### `src/lib/server/admin.ts`
**`function isAdminUser`**
- Admin allowlist check — `AUTH_ADMIN_EMAIL` is a comma-separated list. Used by the server hook (request-level guard for `/admin`) and the `(admin)` layout load, so the group is protected even when layout loads don't rerun.

### `src/lib/server/revenue-metrics.ts`
**`const MRR_SNAPSHOT_CRON`**
- MRR history must be captured; it can't be recovered later because `subscriptions` is a current-state table with no status log. Runs daily (`15 2 * * *`) so a missed run is harmless and the current month is always current.

**`function mrrOf`**
- MRR counts `active` only; `past_due` is reported separately as at-risk revenue so a failed payment surfaces as a leak, not as MRR that silently disappears from the trend.

**`function backfillMrrSnapshots`**
- Straight-line estimate for months before snapshots existed: each paid subscription's current tier replayed from trial end (or creation) to today or cancellation. Can't see tier changes or past cancellations, so rows are tagged `source = 'estimated'`, conflicts are left alone, and the page labels months accordingly.

**`function revenueOverview`**
- Metrics lacking inputs return `null` and render as `—` (NRR without a 12-month snapshot, movement without a previous month, CAC without spend or new customers); an approximated retention number is worse than an absent one because it looks like a measurement.
- The CAC window ends on the last complete month: the current month's spend and signups are both partial and would understate CAC.

### `src/lib/revenue-math.ts`
**`const HEALTHY_LTV_CAC_RATIO`**
- The SaaS convention graded against: LTV ≥ 3× CAC, CAC recovered inside 12 months. Kept next to the formulas so thresholds and arithmetic can't drift apart.

**`function expectedLifetimeMonths`**
- `1 / churn` diverges as churn → 0, exactly a young book's situation; the horizon cap (default 36 months) keeps LTV finite, and the page states the lifetime it used so the cap is never invisible.

**`function netRetention`**
- NRR is about the existing book — only tenants that paid in the base month contribute, so new customers can't flatter it. GRR is the same sum with each tenant capped at its base MRR, making NRR − GRR the expansion contribution.

**`function buildCohorts`**
- Cohort = the month a tenant first paid, not signed up; the table answers how contracted revenue behaves at +3/+6/+12 months. Unelapsed offsets return `null` rather than 0, so an immature cohort reads as unknown, not as a total loss.
