# ADR-038 — One period rule per page type: calendar month for the dashboard and budgets, rolling range for lists and analytics, no picker elsewhere

**Status:** Active
**Feature:** experience (app shell, dashboard, budgets, lists, analytics)
**Date:** 2026-09-05
**Issue:** production-readiness goal, section 3

## Context

The app shell rendered `DateRangePicker` (`24h · 1w · 1m · 3m · 6m · 1y · all`)
on every authenticated page and appended `?period=` to every sidebar link, but
only six of ~30 loaders read the range (`dashboard`, `invoices`, `products`,
`budgets`, `suppliers`, `analytics/spend`). Four other `?period` vocabularies
had grown next to it — `recipes` (`7d|30d|3m|6m|1y`, its own pills),
`analytics/spend` chips (`month|quarter|half|all`), `plantilla-lista`
(`day|month|year|all`) and `reports/[type]` (an ISO week or month id) — and
`period-range.ts` accepted any string, so `?period=quarter` silently became
30 days and `?period=all` on the recipes page became 30 days.

Two semantic bugs came with it. The dashboard spec (`docs/03_features/dashboard.md`)
speaks in calendar months (`?month=YYYY-MM`, plan-to-date = budget ×
elapsed / days-in-month, forecast close) while the loader received the rolling
`1m` window: `selectedMonth` was the month of *30 days ago*, so the budgets
compared against the spend were the wrong month's whenever the window crossed
a boundary, and `days_in_month` was always 30. The budgets page rendered its own
`?month=` navigator while its loader took the month from the rolling range, so
the arrows changed the label and nothing else.

"Today" was `new Date().toISOString().slice(0, 10)` — the UTC date. Spain is
UTC+1/+2, so an upload at 00:30 local landed on yesterday's dashboard and the
month rolled over an hour or two late.

Alternatives rejected:

- **One picker everywhere, honoured everywhere.** Detail pages, the review
  flow, settings, reports and reminders have no meaningful range; forcing one
  invents semantics the page cannot honour honestly.
- **Keep both `?period` and `?month` on the dashboard.** Two axes for one
  screen; every projection formula would need a branch.
- **Per-restaurant timezone column.** Correct in the limit, but the product is
  Spain-only today and the column would be `Europe/Madrid` for every row;
  a process-level default gets the same result without a migration.

## Decision

`src/lib/period.ts` is the single vocabulary and the single map from page to
period mode:

| Mode | Pages | URL | Semantics |
|---|---|---|---|
| `month` | `/dashboard`, `/budgets` | `?month=YYYY-MM` (default: current month, clamped to not-future by `parseMonthParam`) | The calendar month: first to last day. Previous period is the previous calendar month. Elapsed days, days-in-month, plan-to-date and forecast all use the real month length. Header shows the month navigator (`PeriodPicker`). |
| `range` | `/invoices`, `/suppliers`, `/products`, `/recipes`, `/analytics/spend` | `?period=24h\|1w\|1m\|3m\|6m\|1y\|all` (default `1m` = 30 days) | Rolling window ending today. Previous period is the same length immediately before. Header shows `DateRangePicker`. Any other value falls back to `1m`. |
| `none` | everything else — detail pages (`invoice/[id]`, `suppliers/[id]`, `products/[id]`, `recipes/[id]`), `invoices/export` (own from/to), `analytics/prices` (latest vs previous price, no window), `analytics/extraction` (monthly series), `reminders` (always today), `reports/*` (own week/month ids), `digest`, `settings`, `billing`, `chat`, `help`, `batch`/`confirm`/`extract`, `plantilla-lista` (demo pills) | — | No header picker; sidebar links to these pages carry neither param. The layout still resolves a default `1m` range so a stray `?period` cannot reshape them. |

`src/lib/server/period-range.ts` resolves the state once per request in the
`(app)` layout load (`resolvePeriod(url, route.id)`) and every page reads it
through `parent()`: `periodMode`, `activePeriod`, `activeMonth`,
`currentMonth`, `today`, `rangeFrom`, `rangeTo`. "Today" is
`localToday()` — the date in `APP_TIMEZONE` (default `Europe/Madrid`) via
`Intl.DateTimeFormat`, never a UTC slice.

Sidebar links go through `withPeriodParam(href, state)`: a link to a `range`
page carries `?period` when it is not the default, a link to a `month` page
carries `?month` when it is not the current month, a link to a `none` page
carries nothing. Crossing modes drops the parameter — a month is not a range.

The four private vocabularies are gone: recipes reads the shared range and lost
its pills; the spend chips emit `1m|3m|6m|all`; `plantilla-lista` guards its
demo keys; reports keep their own `?period` ids because that page is `none` and
the layout never writes into it.

## Consequences

- The dashboard's "1m" tile semantics are gone: it is the calendar month, as
  the spec always said. `previousRange()` steps a full month to the previous
  full month (February follows March correctly) and a rolling range back by
  its own length, so the DB-backed dashboard tests that pass a rolling parent
  range keep working.
- The budgets month navigator now moves the data; the page's two in-card
  navigators are replaced by the one in the header.
- `?period` values outside the vocabulary are dropped rather than honoured
  with a wrong window; a saved URL with `period=quarter` shows the default and
  a clean canonical URL, not 30 days labelled "quarter".
- A restaurant outside `Europe/Madrid` gets the wrong "today" until
  `APP_TIMEZONE` is set for that deployment or a per-restaurant column is
  added — that is the deliberately deferred part.
- `tests/period.test.ts` holds the map, the vocabulary, the link builder, the
  local-today rule, month bounds and the previous-period rule.

## Related

- [ADR-020](./ADR-020-both-viewports-rendered-css-chooses.md) — mobile and
  desktop share the same resolved state; only the picker chrome differs.
- `docs/03_features/dashboard.md` — the month-based projection this decision
  makes true.
