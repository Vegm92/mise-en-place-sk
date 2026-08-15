# Feature Spec — Notifications (in-app alerts, bell, badge, reminders hub)

## Purpose

Surface every alert type (price shock, stock forecast, budget, category,
unit-conversion, product suggestion, VERI\*FACTU mismatch) in one place with
consistent i18n rendering and actionable CTAs, plus the unified reminders hub.

## Actors

- Signed-in member (view, dismiss, act).
- Alert engines + invoice save (producers).

## Preconditions

- A producer wrote a `system_notifications` row.

## Inputs

- Notification type + payload (`messageKey`/`messageVars`, typed fields).

## Outputs

- Rendered rows in `/reminders`, `MobileAlerts.svelte`, header bell.
- Nav badge counts (overdue invoices + `budget_overage` level `exceeded`).
- Mark-as-`sent` on dismiss/action.

## Business rules

- **Producers** (`alerts.ts` `runPriceShock`/`runStockForecast`/`runBudgetCheck`,
  `invoice-save.ts`): `price_shock`,
  `low_stock_forecast`, `budget_overage`, `supplier_uncategorized`,
  `supplier_category_suggested`, `unit_conversion_needed`, `product_suggestion`,
  `verifactu_qr_mismatch`.
- **Storage**: `system_notifications(rid, invoiceId?, notificationType, message,
  payload, status pending|sent)`; index `(rid, status, created_at)`.
- **i18n**: `payload.messageKey/messageVars` rendered via `$tiv` in
  `NotificationItem.svelte`; icon/color/grouping from `notification-display.ts`
  (`priceShock`, `lowStock`, `budget`, `suppliers`, `other`).
- **Badge** (`+layout.server.ts:114`): overdue invoices (status `pending`/
  `accepted`, due < today) + pending `budget_overage` with `level='exceeded'` —
  deliberately NOT the raw pending count.
- **Reminders hub** (`/reminders`): overdue/due-soon invoices (status
  `pending|accepted`, `due_date <= now + 7 d`) + pending notifications; actions
  mark-paid/bulk-paid, accept/reject invoice; e-invoice acceptance deadlines use
  working days (`working-days.ts`).
- `(app)/api/notifications` GET (default `status=pending`), POST marks `sent`.

## State transitions

`pending → sent` (dismiss/action). Invoices: see `invoice_management.md`.

## Data dependencies

`system_notifications`, `invoices`, `invoice_line_items`, `suppliers`,
`stock_levels`, `category_budgets`, `settings`.

## API dependencies

`(app)/api/notifications`, `(app)/api/product-aliases` (dismiss),
`/reminders` actions.

## UI dependencies

`NotificationBell.svelte`, `NotificationItem.svelte`, `MobileAlerts.svelte`,
`reminders/+page.svelte`, nav badge in `+layout.svelte`.

## Background dependencies

None (producers run inline post-save).

## External dependencies

None.

## Validation

Type ∈ known set; payload shape per type; tenant scope.

## Error states

- Unknown `messageKey` → fallback string (i18n render should not crash).
- Notification referencing a soft-deleted invoice → safe render.

## Edge cases

- Many notifications at once — bell shows top-5; reminders page paginates.
- Same shock every save — content-hash gate upstream prevents duplicates.

## Security rules

- Notification reads/writes scoped to the tenant.

## Idempotency rules

- Producers dedupe (budget per category+level+month; category nudges per
  supplier). Marking `sent` is an update, not a delete.

## Observability

- `notificationType` breakdown in `/admin/events`.

## Acceptance criteria

- Every producer creates a `pending` row with the right payload; badge counts
  only overdue + exceeded budgets; dismiss → `sent`.
- Tests: `tests/events.test.ts`, `tests/alert-engine.test.ts`,
  `tests/working-days.test.ts`.

## Code notes

### `src/routes/api/notifications/+server.ts`

**`const GET`**

- GET /api/notifications?status=pending — WhatsApp bot polls this. Keyed on the authenticated user, not the client IP (#223): `notifications:${locals.user!.id}`.

**`const POST`**

- POST /api/notifications/:id/ack — mark as sent.

### `src/lib/server/alert-engine.ts`

**`const LOW_STOCK_DAYS`**

- Active BI Engine — alerts fired after each invoice save: runPriceShock (>15% unit price deviation vs last recorded), runStockForecast (days-of-stock after purchase; alerts if < 3 days), runBudgetCheck (budget_overage when category monthly spend crosses the threshold).

**`function median`**

- Middle value of a numeric list (lower of the two middles on an even count).

**`function collapseHistory`**

- Collapses the last HISTORY_SIZE price points for a key into one comparison point: median unit price, plus a median €/base when all points share the same base unit (#308) — a single noisy purchase (different pack size, promo, seasonal blip) no longer reads as a shock; a real sustained change still shows on the first purchase after it.

**`function runPriceShock`**

- Match on the shared normalized key (#296); mep_norm_key is the SQL twin of normalizeProductKey. Batch of the last PRICE_HISTORY_WINDOW points per item key (#308), with stored €/base (#299) for apples-to-apples pack comparisons.
- For lines resolved to catalog products (#298), also fetch the latest price per product_id — differently-sized descriptions of one product share a product, not a description key; only that grouping (compared as €/base) meets without a false shock. Prefer product-grouped history, fall back to same-description. Prefer €/base when both sides carry it for the same base unit — stops "caja 5kg" vs "caja 10kg" reading as a ~92% shock.

**`function runStockForecast`**

- One IN query for all stock levels, matched on the normalized key so "Harina 00" updates a stock row saved as "harina 00".

**`function runCategorizationNudge`**

- Nudge the owner to categorise a supplier on its first saved invoice (#301): uncategorised spend sits in "Sin categoría", visible but un-budgetable, and nothing used to ask. One per supplier, ever — deduped on supplier id, qualifies only while still uncategorised; belt-and-braces guard against a re-raise (deleted first invoice, re-save).

**`property message`**

- The bell renders `messageKey` through i18n; `message` is the language-neutral fallback for non-UI consumers (chat, admin).

**`function runCategorySuggestion`**

- Offer a category for a supplier still in the uncategorised bucket (#315). Suppliers are tagged only when *created*, so older/sparse ones stay in the bucket forever; rather than silently reclassify (can't tell "never categorised" from a deliberate "leave in Other"), surface the guess for one-tap accept. One per supplier, ever; supersedes the plain nudge. Nothing to offer when the resolver collapsed an unusable guess; a human-classified supplier is never second-guessed; deduped across both statuses so a dismissed suggestion doesn't return.

**`function runBudgetCheck`**

- Supplier category (legacy NULL now falls into the 'Other' bucket instead of silently hiding spend from budget alerts — #301); warning threshold (0-100 in settings, default 80); monthly budget (current month); month spend; level = exceeded | warning | null; dedup one alert per category+level per calendar month.
### `src/lib/server/email.ts`

**`const apiKey`**

- Transactional email via Resend; RESEND_API_KEY unset → no-ops (dev mode). Copy Spanish-first, matching the default locale (#202).

**`interface EmailPayload`**

- Coarse type for telemetry — tagged on Sentry, never the recipient (#257).

**`function maskEmail`**

- Mask for logs — keep first char and domain (#254).

**`function sendEmail`**

- A silent Resend failure means the owner never gets a welcome/subscription/digest/quota email — report it (tagged by type, not recipient) so a broken key or outage surfaces (#257).

**`function welcomeEmail`**

- Email templates.

**`function trialExpiredEmail`**

- Sent the day the trial lapses (#287/#288); uploads are blocked from that point, so the copy says what stopped working and what still does.

### `src/lib/server/notifications.ts`

**`function saveAlerts`**

- Persists alert objects to system_notifications.

### `src/lib/components/NotificationBell.svelte`

**`const decidingCategory`**

- Suggested supplier category (#315): accept in one tap; the generic X declines (supplier stays in the uncategorised bucket — a valid answer); "change" links to the supplier's category field.

**`function acceptCategory`**

- 404 = supplier was categorised by hand meanwhile; the server clears the stale suggestion too, so drop it locally. Offline/server error — leave to retry later.

**`const deciding`**

- Product-catalog suggestion (#298/#300): fuzzy suggestions confirm the auto-link; LLM suggestions (source 'llm') carry a candidate product to merge on confirm and just dismiss on decline (the line is already its own product). On success the server also dismisses, so drop locally.

**`function decideProduct`**

- Offline/server error — leave in place to retry later.

**`function dismiss`**

- Offline or server error — restore the item at its place instead of silently losing the dismissal (#255).

**`markup`**

- Server-raised alerts carry an i18n key + vars so text follows the reader's locale; `message` is only the fallback for alerts not yet keyed. One-tap route to the supplier's category field (#301); suggested category: accept or pick another (#315).

### `src/lib/components/MobileAlerts.svelte`

**`markup`**

- Summary chips; overdue section; due-soon section.
