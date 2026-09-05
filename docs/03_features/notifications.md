---
tags: [mep, features]
related: "[[CONTEXT]]"
---

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
  `verifactu_qr_mismatch`, `restaurant_phone_mismatch` (issue #918),
  `restaurant_tax_id_mismatch` (issue #905).
- **Producer** (`invoice-save.ts` `resolveRestaurantTaxIdSignal`, #905 task 3):
  `restaurant_tax_id_mismatch` — raised post-commit when a confirmed document
  is addressed to a `receiver_nif` that is not the restaurant's own `cif_nif`.
  A warning, never a block: the document is saved either way, because the
  wrong side of the mismatch may be the profile rather than the document.
  Silent unless both ids are known and the extracted one is checksum-valid and
  legible (`taxIdDecidesIdentity`) — a misread digit must not accuse the owner
  of filing someone else's invoice. Nothing is auto-filled from it: unlike the
  phone below, a blank `restaurants.cif_nif` is left blank, since a fiscal
  identity taken from a document that may not be ours is exactly the value this
  alert exists to doubt.
- **Producer** (`invoice-save.ts` `resolveRestaurantPhoneSignal`, #918):
  `restaurant_phone_mismatch` — raised post-commit when a confirmed invoice's
  `receiver_phone` disagrees with a `restaurants.phone` the owner already has
  on file. Informational only: the mismatch is never applied, so this is the
  one alert whose payload never changes any row — it just links back to
  Settings so the owner decides. A blank `restaurants.phone` is filled inside
  the save transaction instead (no notification, nothing to decide).
- **Producer** (`alerts.ts` `runLineItemReconciliation`, #886): `line_item_mismatch`
  — raised as a post-save effect right after duplicate-purchase detection, only
  when the just-saved invoice has a `linkedInvoiceId` (document-level linking,
  #809/#879) and `reconcileLineItems` (`src/lib/server/line-reconciliation.ts`)
  finds a missing line item or a quantity mismatch between the linked albarán
  and factura. See "Line-item reconciliation" in `invoice_management.md` for
  the matching/verdict rules. Rendering: `notification-display.ts` gives it its
  own icon/color (`file-diff`, warn) — neither `possible_duplicate_purchase`
  nor `related_document_found` are special-cased in `NotificationItem.svelte`
  today (no notification type currently deep-links to its invoice; that is a
  separate gap, not one this issue closes), so `line_item_mismatch` renders
  through the same generic path they do, with its own icon/color and the
  `messageKey`/`messageVars` payload carrying the detail.
- **Producers** (`integrations/whatsapp/jobs.ts` `raiseReviewNotification`):
  `whatsapp_pending_save` (sender answered `OK`), `whatsapp_needs_review`
  (sender answered `NO`, or extraction failed). These are the only rows written
  with `invoiceId = null` — an `OK` over WhatsApp reviews the extraction, it
  does not save an invoice (ADR-008: one canonical write path), so the reminder
  is what carries the invoice to the panel. Payload carries `batchId`/`itemId`
  and the CTA deep-links to `/batch/[id]`.
- **Storage**: `system_notifications(rid, invoiceId?, notificationType, message,
  payload, status pending|sent|resolved)`; index `(rid, status, created_at)`.
- **Per-type preferences** (#577): each tenant can switch individual alert types
  off in Ajustes → Alertas. The toggleable set is `price_shock`,
  `budget_overage`, `possible_duplicate_purchase`, `line_item_mismatch` (#886),
  `supplier_uncategorized`, `low_stock_forecast`, `weekly_digest`,
  `invoice_reminders`, grouped for the UI as `purchase` / `inventory` /
  `reports`. Stored as `settings` rows keyed
  `alert_pref_<type>` with value `true`/`false`; **absent means enabled**, so
  existing tenants keep today's behaviour and no migration is needed.
  `saveAlerts` is the single choke point: it drops every alert whose type maps
  to a disabled preference before the insert, so a disabled type produces no
  row at all. `supplier_category_suggested` rides on the
  `supplier_uncategorized` toggle; alert types with no toggle
  (`unit_conversion_needed`, `product_suggestion`, `verifactu_qr_mismatch`,
  `restaurant_phone_mismatch`, `restaurant_tax_id_mismatch`) are never filtered. The two email jobs check their own toggle before doing any
  work (`weekly_digest`, `invoice_reminders`).
  `notificationType` is free-form `text`, so a new type needs no migration —
  `/reminders` selects every pending row and unknown types degrade to a bell.
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

`pending → sent` (dismiss/action). `pending → resolved` (#831): the data that
raised the alert was corrected and the underlying condition no longer holds —
a distinct outcome from the user's own dismissal, so the two can be told
apart later (e.g. to measure how much alert volume was real vs. noise).
Re-evaluated on invoice edit (`price_shock`, `budget_overage`,
`possible_duplicate_purchase`/`related_document_found`,
`verifactu_qr_mismatch`, `line_item_mismatch` (#886) — re-runs the
reconciliation and resolves the pending row once the edited line items no
longer produce an issue) and on invoice delete (same five, orphaned instead of
re-checked since there is nothing left to compare against, except
`budget_overage` which is re-evaluated against the category's remaining
spend); `supplier_uncategorized`/`supplier_category_suggested` also resolve
when the supplier's category is corrected directly on its profile, not only
via the suggestion widget's own accept/dismiss. Both `sent` and `resolved`
are terminal and excluded from every `status='pending'` read path (bell,
badge, `/reminders`, dashboard), so nothing else needed to change to stop
showing a resolved alert as pending. Invoices: see `invoice_management.md`.

## Data dependencies

`system_notifications`, `invoices`, `invoice_line_items`, `suppliers`,
`stock_levels`, `category_budgets`, `settings`.
Alert preferences live in `settings` under the `alert_pref_` key namespace.

## API dependencies

`(app)/api/notifications`, `(app)/api/product-aliases` (dismiss),
`/reminders` actions.

## UI dependencies

`NotificationBell.svelte`, `NotificationItem.svelte`, `MobileAlerts.svelte`,
`reminders/+page.svelte`, nav badge in `+layout.svelte`.

## Background dependencies

Producers run inline post-save, except the two WhatsApp types: those are raised
from the worker's inbound-message handler when the sender answers the summary.

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
- Every toggleable alert type has a switch in Ajustes → Alertas, grouped and
  labelled; preferences round-trip through the `settings` table; a disabled type
  generates no notification and no email.
- Correcting the data that raised a re-evaluable alert (invoice price/total/
  date, supplier category) resolves it without the user dismissing it by hand
  (#831); deleting the invoice that raised it never leaves the alert pointing
  at a gone invoice.
- Tests: `tests/events.test.ts`, `tests/alert-engine.test.ts`,
  `tests/working-days.test.ts`, `tests/alert-preferences.test.ts`,
  `tests/settings-alert-preferences.test.ts`, `tests/scheduler.test.ts`,
  `tests/alert-reevaluation.test.ts`, `tests/line-reconciliation.test.ts` (#886,
  pure), `tests/invoice-save-duplicate-purchase.test.ts` (#886, DB-backed).

## Code notes

### `src/routes/(app)/api/notifications/+server.ts`

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

- The bell renders `messageKey` through i18n; `message` is the Spanish-rendered fallback for non-UI consumers (chat context, the saved-invoice toast on legacy rows) and for any row whose payload predates the `messageKey` scheme (#536). It is never the raw `notificationType: value` machine string.

**`function runCategorySuggestion`**

- Offer a category for a supplier still in the uncategorised bucket (#315). Suppliers are tagged only when *created*, so older/sparse ones stay in the bucket forever; rather than silently reclassify (can't tell "never categorised" from a deliberate "leave in Other"), surface the guess for one-tap accept. One per supplier, ever; supersedes the plain nudge. Nothing to offer when the resolver collapsed an unusable guess; a human-classified supplier is never second-guessed; deduped across both statuses so a dismissed suggestion doesn't return.
- The extraction-proposed category only counts (`fromExtraction`) when it is one of the restaurant's own visible `categories` (`visibleCategoryNames(rid)`, ADR-037 part 2, issue #881) — not the fixed `VALID_CATEGORIES` — so a restaurant that hid a default category is never offered it back. `dominantSupplierLineCategory`'s own line-spend guess is scoped the same way.

**`function runBudgetCheck`**

- Supplier category (legacy NULL now falls into the 'Other' bucket instead of silently hiding spend from budget alerts — #301); warning threshold (0-100 in settings, default 80); monthly budget (current month); month spend; level = exceeded | warning | null; dedup one alert per category+level per calendar month, counting only rows still standing (`pending`/`sent`) — a `resolved` row (#831) does not suppress a fresh crossing of the same threshold.

**`function openOveragesThisMonth`** (#831)

- The `(category, level)` pairs `runBudgetCheck` dedupes against: this month's
  `budget_overage` rows that are still standing, i.e. `pending` or `sent`. Rows marked
  `resolved` are excluded on purpose — the spend that raised them was corrected back
  under the threshold, so crossing it again is a new event and has to warn again
  instead of staying silent for the rest of the month. `sent` still suppresses: the
  user saw that crossing and dismissed it.

**`function reevaluateInvoiceAlerts`** (#831)

- Called after the invoice edit action commits. Re-runs `runPriceShock`,
  `runPossibleDuplicatePurchase`, the VERI\*FACTU check, and `runBudgetCheck`'s
  comparison against the invoice's *current* (post-edit) data, and marks any
  pending alert tied to this invoice whose condition no longer holds as
  `resolved`. Best-effort per sub-check (one failing does not block the
  others or the edit), mirroring the producers' own isolation in
  `invoice-save.ts`.

**`function orphanInvoiceAlerts`** (#831)

- Called after an invoice is soft-deleted. Closes `price_shock`,
  `possible_duplicate_purchase`, `related_document_found`,
  `verifactu_qr_mismatch`, `line_item_mismatch` (#886), and
  `restaurant_phone_mismatch` (#918) and `restaurant_tax_id_mismatch` (#905)
  alerts tied to that invoice — there is
  nothing left to re-compare, so they are marked `resolved` outright rather
  than orphaned against a gone invoice. `budget_overage` is handled separately
  (`reevaluateBudgetAlertsForInvoice`) since it is category-wide, not specific
  to the deleted invoice.

**`function resolveSupplierCategoryAlerts`** (#831)

- Called from the supplier profile's `update` action when the category is set
  directly (outside the suggestion widget). Closes
  `supplier_uncategorized`/`supplier_category_suggested` for that supplier —
  the same outcome `dismissSuggestion` gives when the correction instead comes
  through `(app)/api/supplier-category`.

**`function runLineItemReconciliation`** (#886)

- Line-item reconciliation between a linked delivery note and invoice (issue
  #886, on top of #809's document-level linking): reads back the just-saved
  invoice's `linkedInvoiceId`, resolves which side is the `albaran` and which
  the `factura` by `documentType`, loads both documents' `invoice_line_items`,
  and hands them to the pure `reconcileLineItems` (see
  `src/lib/server/line-reconciliation.ts` below). When the result has a
  document issue (a missing line, or a quantity mismatch — a unit or price
  mismatch alone does not count, per ADR-009's "unknown, not wrong" discipline
  for unit comparison), and no pending `line_item_mismatch` notification already exists
  for this pair (`notificationsForType`, reused from #876 rather than a new
  query), it builds one `Alert` and flips both invoices to
  `reviewState: 'incidencia', incidenceKind: 'documento'` unless a given side
  is already `incidencia` — mirroring the duplicate-purchase flip, but across
  both documents in the pair since either one could be the invoice currently
  being saved. Wired into `runPostSaveEffects` (`invoice-save.ts`, ADR-008)
  right after the duplicate-purchase effect, as one more entry in its
  `alertEffects` table — the invoice-save side only calls the function and
  lets the existing `saveAlerts`/`filterEnabledAlerts` pipeline persist and
  gate it; all reconciliation logic and the flip live here, next to
  `runPossibleDuplicatePurchase`, its sibling.

**`function reevaluateLineItemMismatchAlerts`** (#886)

- Re-evaluation counterpart (#831 pattern): finds pending `line_item_mismatch`
  rows tied to either side of the pair, re-runs the same reconciliation via
  `resolveLinkedDocumentPair`/`reconcileLinkedDocuments` (shared with
  `runLineItemReconciliation`, so a re-evaluation call never re-triggers the
  create-time dedup check against its own still-pending row), and resolves
  them once the edited line items no longer produce a document issue. Does
  not reverse the `incidencia`/`documento` flip — consistent with every other
  re-evaluator, which only ever closes the notification.
### `src/lib/server/email.ts`

**`const apiKey`**

- Transactional email via Resend; RESEND_API_KEY unset → no-ops (dev mode). Copy Spanish-first, matching the default locale (#202).

**`const COLOR_*`**

- The MEP light ramp copied by hand, because email clients do not resolve CSS
  custom properties. `COLOR_ACCENT` is `--mep-acc` for `slate` (`#34507a`); it
  sat on the retired amber `#8a530f` long after the app moved
  ([ADR-027](../06_decisions/experience/ADR-027-amber-accent-removed-and-enforced.md)),
  so every transactional email was branded a colour the product no longer used.
  `tests/design-tokens-accent-discipline.test.ts` now asserts these constants
  equal the `:root[data-theme="light"]` token values — this is the one place in
  `src/` allowed to hard-code the ramp, and the only thing keeping the copy honest.

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
- Filters the batch through `filterEnabledAlerts` first (#577). Gating here rather than inside each producer means one place decides, every producer (including future ones) inherits it, and the producers keep returning what they found — the preference is about delivery, not detection.

### `src/lib/server/alert-preferences.ts`

**`const ALERT_PREFERENCE_TYPES`**

- The alert types a tenant may switch off (#577). Deliberately a subset: only alerts a restaurant can reasonably not want. Data-integrity nudges (`unit_conversion_needed`, `product_suggestion`, `verifactu_qr_mismatch`) are not toggleable — silencing them would silently degrade the numbers the rest of the app reports.

**`const ALERT_PREFERENCE_GROUPS`**

- The three groups the settings pane renders, in order. Group ids and type ids are also i18n key fragments (`set.alertPrefs.group.*`, `set.alertPrefs.type.*`, `set.alertPrefs.desc.*`), so adding a type is one entry here plus its two strings per locale.

**`const ALERT_PREFERENCE_KEY_PREFIX`**

- Namespaced so a preference key can never collide with the threshold keys already living in the same key/value `settings` table (`price_alert_threshold`, `budget_warning_threshold`, the one-shot job claims).

**`const NOTIFICATION_TYPE_PREFERENCE`**

- Producer notification type → the toggle that governs it. Not an identity map: `supplier_category_suggested` is the second half of the same conversation as `supplier_uncategorized`, so one switch turns both off; anything absent from this map is ungoverned and always delivered.

**`function defaultAlertPreferences`**

- Absent row means enabled. Existing tenants therefore keep exactly today's behaviour with no backfill, and no migration is needed for the feature at all.

**`function loadAlertPreferences`**

- One `IN` query for the whole set — the settings pane and `filterEnabledAlerts` both want every toggle at once.

**`function isAlertEnabled`**

- Single-toggle read for the two scheduled email jobs, which run per tenant and only care about one preference each.

**`function filterEnabledAlerts`**

- Early-outs before touching the database when nothing in the batch is governed, so the common invoice-save path adds a query only when it has something to gate.

### `src/lib/server/line-reconciliation.ts` (#886)

**`function reconcileLineItems`**

- Pure, DB-free: `reconcileLineItems(a, b)` where `a` is the delivery note's
  lines and `b` the invoice's. Matches greedily and one-to-one in two passes —
  first by `productId` when both sides carry one (a catalog match always
  outranks a text match), then by `normalizeProductKey(description)` on
  whatever is left; anything still unmatched lands in `missingInInvoice`
  (delivery lines with no invoice counterpart) or `missingInDeliveryNote`
  (invoice lines with no delivery counterpart). `greedyMatch` pre-indexes target lines
  in a `bKeyMap` (`Map<string, number[]>`) to resolve key lookups in O(N + M) time
  rather than O(N * M) linear scans, avoiding repeated normalization on large line sets.
- For each matched pair: with equal units (case-insensitive), a quantity
  mismatch is a difference beyond `max(0.01, 0.5% of the larger quantity)` —
  an absolute floor for small counts, a relative one for large ones. With
  different units, it falls back to each line's `baseQuantity` (pack size ×
  quantity, in kg/L/ud — the caller derives this from `parsePack`, this module
  never parses text) when *both* sides carry one; when they do not, the pair
  is a `unitMismatch`, not a quantity verdict — ADR-009's normalisation
  returns *unknown*, not *wrong*, for anything it cannot resolve, and this
  module refuses to guess rather than compare unlike things. Price mismatch is a separate,
  independent check: normalized €/base when both sides have one, else raw
  `unitPrice` with equal units, flagged beyond 5%.
- `hasDocumentIssue` is `true` on a missing line or a quantity mismatch only —
  a unit mismatch or a price-only mismatch is recorded but does not, on its
  own, flag the document pair (the caller decides what to do with those).

### `src/lib/components/mep/NotificationBell.svelte`

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
- The bell button's accessible name includes the badge count (e.g. "Notificaciones: 3") so the visible badge text matches the aria-label.

### `src/lib/components/mobile/MobileAlerts.svelte`

**`markup`**

- Summary chips; overdue section; due-soon section.
- Each incidencias card carries an `IncidenceKindBadge` under the `incidencia` badge (issue #879, see `docs/03_features/invoice_management.md`) so the read-error-vs-document-problem distinction shows up here too, not only on the invoice detail.
- A `documento`-kind incidence is also where the supplier claim email is offered — see `docs/03_features/supplier_claim_email.md` (issue #887).
