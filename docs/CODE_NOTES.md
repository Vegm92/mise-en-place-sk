# Code Notes

Prose documentation for `mise-en-place`. Every note here was previously an inline comment in `src/`; the code itself is now comment-free by policy (see _Conventions_ below).

This file is tracked in the repo — it is the shared reference for why the code is the way it is. The rest of `docs/` remains gitignored.

- Extracted: 1856 notes from 162 of 233 source files
- Generated: 2026-07-31

---

## Conventions

Source files under `src/` carry **no explanatory comments**. Anything worth saying about *why* code is the way it is belongs in this file, keyed by file and symbol. The only comments permitted in source are machine-read directives:

`@ts-expect-error` · `@ts-ignore` · `eslint-*` · `svelte-ignore` · `prettier-ignore` · `@vite-ignore` · `c8/v8/istanbul ignore` · `@vitest-*` · `/// <reference>`

These change how a tool behaves, so removing them would change behaviour — they are not documentation.

---

## Contents

- [HTTP API endpoints](#http-api-endpoints)
- [Authenticated app pages](#authenticated-app-pages)
- [Public routes (marketing, auth, webhooks)](#public-routes-marketing-auth-webhooks)
- [Server core (DB, extraction, billing, jobs)](#server-core-db-extraction-billing-jobs)
- [UI components](#ui-components)
- [Client stores](#client-stores)
- [Shared library](#shared-library)
- [App shell, hooks, workers](#app-shell-hooks-workers)

---

## Root config files

### `svelte.config.js`

**`form-action` CSP directive**

Google OAuth login (`/login?/signInWithGoogle`) is a plain HTML form POST; the server action responds with a 303 redirect straight to Supabase's `/auth/v1/authorize` endpoint. Browsers validate `form-action` against that first redirect hop (not just the form's own same-origin target), so the Supabase project origin must be allowlisted alongside `'self'` or the redirect gets blocked client-side. The further hop from Supabase to `accounts.google.com` is a normal navigation and isn't re-checked.

---

## HTTP API endpoints

### `src/routes/(app)/api/active-restaurant/+server.ts`

**`const POST`**

- Switch the active location (issue #290).

    hooks.server.ts has always read an `active_restaurant` cookie to resolve the tenant for the request — nothing ever wrote it, so a user with two memberships was pinned to the first one forever. This writes it, but only after confirming the caller is actually a member of the target restaurant: the cookie is the tenant selector for every subsequent query, so an unverified value here would be a tenant-isolation hole. (The hook re-checks membership on every request as well.)

    ↳ `import { json, error } from '@sveltejs/kit';`
- Scoped to the *target* tenant — this is the one query in the app that legitimately looks outside locals.restaurantId, and membership is exactly what it is checking.

    ↳ `const target = forTenant(restaurantId);`

### `src/routes/(app)/api/chat/+server.ts`

**`const POST`**

- AI chat is paid capacity: an expired trial keeps its data but stops spending (issue #287). 402 so the client can show upgrade copy rather than a generic failure.

    ↳ `const access = await getAccessState(rid);`
- Key by authenticated user, not client IP: behind a proxy every user shares one IP, which would let a single tenant exhaust the global chat budget.

    ↳ `if (!await checkRateLimit('chat:${locals.user!.id}', CHAT_RATE_LIMIT_RPM)) {`
- Resolve or create session — an existing id must belong to this tenant

    ↳ `let resolvedSessionId = sessionId;`
- Persist user message

    ↳ `await db.insert(chatMessages).values({ restaurantId: rid, sessionId: resolvedSessionId,…`
- System instruction is entirely server-controlled. Restaurant data lives in <restaurant_data> tags so the model treats it as data, not as instructions, even if supplier names or invoice text contain adversarial strings.

    ↳ `const systemInstruction = [`

**`property contents`**

- User message is kept in the user turn, never concatenated into the system instruction.

    ↳ `contents: [{ role: 'user', parts: [{ text: message }] }],`

**`const POST`**

- Persist assistant message

    ↳ `await db.insert(chatMessages).values({`

### `src/routes/(app)/api/notifications/+server.ts`

**`const GET`**

- GET /api/notifications?status=pending — WhatsApp bot polls this.

    ↳ `export const GET: RequestHandler = async ({ url, locals }) => {`
- Keyed on the authenticated user, not the client IP (issue #223).

    ↳ `if (!await checkRateLimit('notifications:${locals.user!.id}', 60)) throw error(429, 'To…`

**`const POST`**

- POST /api/notifications/:id/ack — mark a notification as sent.

    ↳ `export const POST: RequestHandler = async ({ request, locals }) => {`

### `src/routes/(app)/api/product-aliases/+server.ts`

**`const POST`**

- Confirm or reject a pending product-alias suggestion (issue #298).

    A pending suggestion (product_aliases fuzzy auto-link, or an async LLM proposal, issue #300) raises a `product_suggestion` notification. The review UI posts here to:

    - confirm (+ targetProductId): merge this description into an existing product the LLM proposed;

    - confirm (no target): keep the fuzzy link, mark the alias confirmed;

    - reject: split this description off into its own product;

    - dismiss: just clear the suggestion (used for LLM proposals — the line is already its own product, so declining needs no DB change).

    The notification carries the raw `description`; the raw_key is derived server-side so the client never has to know the alias id.

    ↳ `import { json, error } from '@sveltejs/kit';`
- 'dismiss' just clears the notification (LLM proposal declined).

    ↳ `if (action === 'dismiss') {`

**`function dismissSuggestion`**

- Mark the matching product_suggestion notification(s) as handled.

    ↳ `async function dismissSuggestion(rid: string, rawKey: string): Promise<void> {`

### `src/routes/(app)/api/stock-levels/+server.ts`

**`const GET`**

- GET /api/stock-levels — list all stock level entries for this restaurant.

    ↳ `export const GET: RequestHandler = async ({ locals }) => {`
- Keyed on the authenticated user, not the client IP (issue #223): behind a reverse proxy every request shares one IP and therefore one bucket.

    ↳ `if (!await checkRateLimit('stock-levels:${locals.user!.id}', 60)) throw error(429, 'Too…`

**`const POST`**

- POST /api/stock-levels — upsert daily burn rate for an ingredient (TPV sync stub).

    ↳ `export const POST: RequestHandler = async ({ request, locals }) => {`

### `src/routes/(app)/api/supplier-category/+server.ts`

**`const POST`**

- Accept or decline a suggested supplier category (issue #315).

    Extraction proposes a category for a supplier still in the uncategorised bucket, which raises a `supplier_category_suggested` notification. The bell posts here to:

    - accept: write the category onto the supplier;

    - dismiss: clear the suggestion without touching the supplier.

    The category is re-validated against VALID_CATEGORIES here rather than trusted from the request, so this endpoint cannot be used to write an arbitrary string into the column the budgets page groups on. Accepting only moves a supplier *out* of the bucket: a supplier someone has already classified is left alone, so a stale notification can't overwrite a newer manual choice.

    ↳ `import { json, error } from '@sveltejs/kit';`

**`const updated`**

- Bucket or legacy NULL only — never overwrite a real category.

    ↳ `or(isNull(suppliers.category), eq(suppliers.category, UNCATEGORIZED_CATEGORY)),`

**`const POST`**

- Either not this tenant's supplier, or already categorised by hand. Clear the stale suggestion either way so the bell doesn't keep it.

    ↳ `await dismissSuggestion(rid, supplierId);`

**`function dismissSuggestion`**

- Mark the supplier's pending category suggestion as handled.

    ↳ `async function dismissSuggestion(rid: string, supplierId: number): Promise<void> {`

### `src/routes/(app)/api/trend/+server.ts`

**`const GET`**

- Keyed on the authenticated user, not the client IP (issue #223).

    ↳ `if (!await checkRateLimit('trend:${locals.user!.id}', 60)) throw error(429, 'Too many r…`

### `src/routes/(app)/api/unit-conversions/+server.ts`

**`const POST`**

- POST /api/unit-conversions — save a new UoM rule and clear pending flags.

    ↳ `export const POST: RequestHandler = async ({ request, locals }) => {`
- Keyed on the authenticated user, not the client IP (issue #223).

    ↳ `if (!await checkRateLimit('unit-conversions:${locals.user!.id}', 30)) throw error(429, …`
- Clear pending flags — join by supplier_id when known, fall back to name join. Normalized comparison (issue #296): the pending line may spell the ingredient/unit with different casing or accents than the saved rule.

    ↳ `if (resolvedSupplierId != null) {`

## Authenticated app pages

### `src/routes/(app)/+layout.server.ts`

**`const load`**

- Every restaurant this user belongs to, for the location switcher (issue #290). One row for almost everyone; the switcher only renders when there is something to switch to.

    ↳ `db.select({ id: restaurants.id, name: restaurants.name })`
- For existing users who never got a tutorial row, skip the tour silently

    ↳ `const rawTutorialStep = tutorialStepRow[0]?.value;`

**`property quotaLimit`**

- null = unlimited; shared convention in billing.resolveMonthlyQuota (#295)

    ↳ `quotaLimit:              resolveMonthlyQuota(quotaLimitRow[0]?.value, planTier),`

**`property restaurantName`**

- The settings override exists for tenants that set a display name; the restaurants row is the source of truth after a rename (issue #293).

    ↳ `restaurantName:          restaurantNameRow[0]?.value ?? restaurantRow[0]?.name ?? '',`

### `src/routes/(app)/+layout.svelte`

**`const curPath`**

- Seed tutorial store from server data on each navigation

    ↳ `$effect(() => {`

**`const showReviewCoachMark`**

- The tour is a single coach mark on the batch review page (issue #230). The upload-zone mark that used to come first explained an empty state whose own headline already said the same thing, on top of four other first-session overlays. '1' is the stored step for "tour not seen yet" — accepted here too so users mid-tour (and anyone who used "repeat the tour") still get it.

    ↳ `const showReviewCoachMark = $derived(`

**`const showComplete`**

- Completion card: first invoice landed on dashboard

    ↳ `const showComplete = $derived(isFirstInvoice && $tutorialStep !== 'dismissed');`

**`const TOUR_PAGES`**

- App-wide walkthrough (steps 3-11): one coach mark per main page, in nav order

    ↳ `const TOUR_PAGES = [`

**`const showTourNudge`**

- Dashboard nudge offering the app-wide walkthrough — persists until accepted/dismissed

    ↳ `const showTourNudge = $derived($tutorialStep === 'done' && curPath === '/dashboard');`

**`const revealAll`**

- Progressive disclosure (issue #231): before the first saved invoice, every section below Invoices is an empty state — eight of them, plus a quota meter for a quota nobody has touched. They reveal after the first save, which is also when they start having something to show.

    ↳ `const revealAll = $derived(data.hasCompletedOnboarding);`

**`const switchingLocation`**

- Switching writes the active_restaurant cookie server-side, then a full reload so every layout query re-runs against the new tenant (issue #290).

    ↳ `let switchingLocation = $state(false);`

**`function switchLocation`**

- fall through — the select resets on the next render

    ↳ `}`

**`markup`**

- Mobile overlay

    ↳ `{#if mobileOpen}`
- ── Sidebar

    ↳ `<aside`
- Brand

    ↳ `<div style="display:flex;align-items:center;gap:10px;padding:0 10px 22px;">`
- Location switcher — only when there is somewhere to switch to (#290)

    ↳ `{#if data.locations && data.locations.length > 1}`
- Upload CTA (desktop primary action)

    ↳ `<a`
- Primary nav

    ↳ `<nav style="display:flex;flex-direction:column;gap:1px;">`
- Quota widget — hidden until the first invoice is saved (issue #231)

    ↳ `{#if revealAll}`
- quotaLimit null → unlimited plan, nothing to fill up (#295)

    ↳ `<div style="width:{data.quotaLimit ? Math.min(100, Math.round(data.quotaUsed / data.quo…`
- Util links

    ↳ `<div style="display:flex;flex-direction:column;gap:1px;">`
- Legal footer

    ↳ `<div style="display:flex;gap:10px;padding:8px 10px 0;flex-wrap:wrap;">`
- User chip

    ↳ `<div style="margin-top:10px;padding:8px;display:flex;align-items:center;gap:10px;border…`
- ── Main area

    ↳ `<div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--mep-…`
- TopBar — universal header (mobile + desktop)

    ↳ `<header style="height:56px;flex-shrink:0;display:flex;align-items:center;padding:0 16px…`
- Mobile hamburger (kept for fallback pages not yet mobilised)

    ↳ `<button`
- Title

    ↳ `<h1 style="margin:0;flex:1;min-width:0;font-size:20px;font-weight:600;color:var(--mep-f…`
- Chat (desktop only — sidebar nav handles mobile)

    ↳ `<span class="hidden md:inline-flex"><ChatFab /></span>`
- Language toggle

    ↳ `<button`
- Notification bell

    ↳ `<NotificationBell notifications={data.notifications ?? []} />`
- Theme toggle

    ↳ `<button`
- Upload CTA — mobile only (sidebar handles desktop)

    ↳ `<a href="/" class="md:hidden btn btn-primary" style="height:34px;text-decoration:none;">`
- Page content — boundary contains a post-hydration client render/effect error (e.g. the /batch/[id] polling loop, the chat page) to this region so the shell survives; +error.svelte still covers load errors.

    ↳ `<div style="flex:1;overflow:auto;">`
- ── Tutorial coach marks

    ↳ `{#if browser}`
- Completion overlay
- svelte-ignore a11y_no_static_element_interactions

    ↳ `<div`
- svelte-ignore a11y_no_static_element_interactions

    ↳ `<div`
- App-wide tour nudge — small dismissible corner card, persists across dashboard visits

    ↳ `<div`

### `src/routes/(app)/+page.server.ts`

**`function remainingMonthlyQuota`**

- Returns the number of invoices the tenant can still add this calendar month, or null when no plan quota is configured (treated as unlimited). Best-effort: never blocks the upload path on a DB error.

    ↳ `async function remainingMonthlyQuota(rid: string): Promise<number | null> {`
- Shared quota convention (issue #295) — null means unlimited.

    ↳ `const limit = await getMonthlyQuota(rid);`

**`property error`**

- An i18n key (issue #294) — the panel translates it. `errorVars` carries the interpolation values that survive a redirect.

    ↳ `error: url.searchParams.get('error') ?? null,`

**`property upload`**

- A lapsed trial (or a cancelled/past-due subscription) may keep reading its data, but must not start new paid work (issue #287). First thing in the action: an expired tenant gets sent to /billing without uploading a 20 MB file first, and never reaches the rate limiter or quota gate.

    ↳ `const access = await getAccessState(rid);`
- Use typeof check instead of instanceof — SvelteKit's internal File class may differ from globalThis.File across Node.js versions, causing instanceof to silently drop files.

    ↳ `const files = rawFiles.filter((f): f is File => typeof f !== 'string' && (f as Blob).si…`
- Each upload consumes a paid Gemini extraction — cap batch submissions per tenant regardless of plan quota (quota is unlimited when unset).

    ↳ `if (!(await checkRateLimit('upload:${rid}', 10))) {`
- Plan quota gate — block before consuming any Gemini extraction and send the user to /billing to upgrade. Skipped when no quota is configured. Uses a redirect (not fail) so the message + upgrade CTA render reliably for both the XHR and no-JS submit paths via the page's error banner.

    ↳ `const remaining = await remainingMonthlyQuota(rid);`
- Redirect (not fail) so the banner renders on both the XHR and no-JS paths; the key and its interpolation value travel as query params.

    ↳ `redirect(303, remaining === 0`
- Random storage namespace — generated before the batch exists so files can be saved first; it does not need to match the batch id.

    ↳ `const namespace = randomBytes(16).toString('hex');`
- Every file was rejected by validation — report the first reason with the offending filename (issue #294); reasons are i18n keys.

    ↳ `const first = errors[0];`
- One batch, one item per invoice — no chained sessions.

    ↳ `const { batchId, itemIds } = await createBatch(rid, saved.map((name, i) => ({ key: keys…`
- Start extraction right away — the upload CTA promises "extract data", so landing on the batch page must not require a second click.

    ↳ `await enqueueBatchExtraction(itemIds[0], rid, {`

### `src/routes/(app)/analytics/extraction/+page.server.ts`

**`const load`**

- kpisRows, supplierRows, trendRows read from mv_extraction_stats (pre-aggregated). fieldRows still queries extraction_corrections directly (no rollup needed — it's a small table).

    ↳ `const [kpisRows, fieldRows, supplierRows, trendRows] = await Promise.all([`

### `src/routes/(app)/analytics/extraction/+page.svelte`

**`markup`**

- Header

    ↳ `<div style="display:flex;align-items:center;gap:8px;">`
- Empty state

    ↳ `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-conten…`
- KPI row

    ↳ `<div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">`
- Middle row: most-corrected fields + accuracy trend

    ↳ `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;" class="max-[900px]:gr…`
- Most-corrected fields

    ↳ `<div class="card" style="padding:16px;">`
- Accuracy trend

    ↳ `<div class="card" style="padding:16px;">`
- Accuracy by supplier

    ↳ `<div class="card" style="padding:16px;">`

### `src/routes/(app)/analytics/prices/+page.server.ts`

**`const load`**

- Read from mv_price_snapshots (pre-computed latest+prev price per item+supplier). Replaces the self-joining window CTE that scanned all invoice_line_items.

    ↳ `const rawRows = await db.execute(sql'`

### `src/routes/(app)/analytics/prices/+page.svelte`

**`markup`**

- Mobile prices analytics

    ↳ `<div class="md:hidden" style="height:100%;overflow:hidden;">`
- Desktop prices analytics

    ↳ `<div class="hidden md:block" style="height:100%;overflow:auto;">`
- Header

    ↳ `<div style="display:flex;align-items:center;gap:12px;">`
- Toolbar

    ↳ `<div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:10px;fle…`
- Summary strip

    ↳ `<div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2">`
- Price cards grid

    ↳ `{#if !filtered.length}`

### `src/routes/(app)/analytics/spend/+page.server.ts`

**`const PERIOD_DATE_SQL`**

- Month-based filters for mv_item_monthly_spend / mv_category_monthly_spend. Slightly coarser than exact date ranges (always full calendar months) but correct for analytics display.

    ↳ `const PERIOD_DATE_SQL: Record<string, SQL> = {`

**`const load`**

- topItems, categorySpend, itemTrendRows read from pre-aggregated views; kpisRows still queries raw tables (it's one simple aggregate, no CTEs/window functions).

    ↳ `const [topItems, categorySpend, kpisRows, itemTrendRows] = await Promise.all([`

### `src/routes/(app)/analytics/spend/+page.svelte`

**`const SERIES_COLORS`**

- Spend donut — top 5 + "Other", fixed categorical hue order (never cycled)

    ↳ `const SERIES_COLORS = ['var(--mep-series-1)', 'var(--mep-series-2)', 'var(--mep-series-…`

**`markup`**

- Mobile spend analytics

    ↳ `<div class="md:hidden" style="height:100%;overflow:hidden;">`
- Desktop spend analytics

    ↳ `<div class="hidden md:block" style="height:100%;overflow:auto;">`
- Header + period picker

    ↳ `<div style="display:flex;align-items:center;gap:12px;">`
- KPI row

    ↳ `<div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2" data-coach="analytics-main">`
- Charts row

    ↳ `<div style="display:grid;grid-template-columns:3fr 2fr;gap:12px;">`
- Top items

    ↳ `<div class="card" style="padding:16px;">`
- Donut

    ↳ `<div style="position:relative;flex-shrink:0;width:180px;height:180px;">`
- Legend + hover detail

    ↳ `<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;">`
- By category

    ↳ `<div class="card" style="padding:16px;">`

### `src/routes/(app)/batch/[id]/+page.server.ts`

**`function statSize`**

- ignore stat errors — size stays '—'

    ↳ `}`

**`function findDuplicateInvoiceId`**

- Read-only heads-up for the review screen — same supplier (case-insensitive, matching the `uq_suppliers_rid_name` index) + same invoice number as an already-saved invoice. This is a coarser check than the exact-content-hash gate in invoice-save.ts (which fires on submit); it exists purely to flag the likely duplicate before the user spends time reviewing fields, so they can discard right away instead of hitting the block on confirm.

    ↳ `async function findDuplicateInvoiceId(rid: string, supplierName: string, invoiceNumber:…`

**`function settledRedirect`**

- Everything reviewed — leave the page. Confirmed invoices exist, so the dashboard is the natural landing spot; an all-discarded batch goes home.

    ↳ `const items = await getBatchItems(batchId);`

**`property save`**

- The done→confirmed transition commits atomically with the invoice insert — a drop between them can no longer strand the item as reviewable and produce a confusing duplicate error (issue #248).

    ↳ `const outcome = await saveReviewedInvoice(item, formData, rid, async (tx) => {`
- A replayed submit (double-click, offline replay) already saved on the first pass — land on the batch page, which routes onward if settled.

    ↳ `if (outcome.type === 'replay') redirect(303, '/batch/${params.id}');`
- Straight to the list that just changed, with a toast carrying the save confirmation and any alerts (issue #235) — the interstitial page this replaces existed only to say "saved ✓".

    ↳ `redirect(303, '/invoices?saved=${outcome.invoiceId}');`

**`property add`**

- If extraction is already running, fold the new items straight into the queue.

    ↳ `const anyActive = items.some(i => i.status === 'queued' || i.status === 'extracting' ||…`

### `src/routes/(app)/batch/[id]/+page.svelte`

**`const timer`**

- ── Queue polling — the single feedback mechanism While anything is queued/extracting, poll the batch status endpoint and reload server data when any item's status changes. No simulated progress.

    ↳ `onMount(() => {`
- network error — keep polling

    ↳ `}`

**`type LineItem`**

- ── Review form state

    ↳ `type LineItem = {`

**`const lineItems`**

- Synced from server data (not initialized once): the active review item changes in place as the user confirms invoices.

    ↳ `let lineItems = $state<LineItem[]>([]);`

**`const lowConfAckItemId`**

- keep user edits across unrelated reruns

    ↳ `lineItemsSource = raw;`
- The active review item changes in place (same component instance across batch items — moving to the next invoice is a redirect back to this same route, not a remount). Without this, an ack/modal from one item survives into the next: `lowConfAck` in particular is sent straight through to the server's low-confidence gate (invoice-save.ts), so a stale `true` would silently bypass review for an item the user never actually acknowledged. Seeded with the current item, not null — a fresh mount (e.g. the full page reload after a failed non-enhanced form submit) must not read as an "item changed" event, or it clobbers the modal that the effect above just opened from the same submit's `form` result.

**`const supplierNameInput`**

- Header fields, editable — local state so a correction survives a failed save (the low-confidence gate) instead of being overwritten by the server-derived `review.data` snapshot once the item itself hasn't actually changed (issue #305). Seeded once per item, same "changed in place" guard as `lowConfAckItemId` above.

**`const idempotencyKey`**

- One idempotency key per review item (issue #250) — regenerated only when the active item changes, so a retry after a validation error reuses it.

    ↳ `const idempotencyKey = $derived.by(() => { void review?.itemId; return crypto.randomUUI…`

**`const focusedItemId`**

- Focus the first uncertain field when a new review item appears.

    ↳ `let focusedItemId: string | null = null;`

**`const addFiles`**

- ── Add more files

    ↳ `let addFiles = $state<File[]>([]);`

**`markup`**

- Where the user is in Upload → Extract → Review (issue #232). The cue used to stop at the upload page, i.e. right before the two steps it describes. Extract stays current while anything is still in flight; once a review item is on screen, step 3 is.

    ↳ `<div style="padding:16px 20px 0;flex-shrink:0;">`
- Two-column grid: queue + active panel

    ↳ `<div style="flex:1;min-height:0;padding:16px 20px 20px;display:grid;grid-template-colum…`
- ── Queue

    ↳ `<div class="card" style="padding:16px 0 12px;display:flex;flex-direction:column;min-hei…`
- Add more + batch discard

    ↳ `<div style="padding:10px 16px 4px;border-top:1px solid var(--mep-divider);display:flex;…`
- ── Active panel

    ↳ `{#if review}`
- Out-of-tree form target: the discard button sits visually inside the save form's header; nesting real forms is invalid HTML.

    ↳ `<form id="discard-item-form" method="POST" action="?/discardItem" style="display:none;"…`
- Doc viewer

    ↳ `<div class="card" style="padding:0;overflow:hidden;display:flex;flex-direction:column;m…`
- Review form

    ↳ `<form id="save-form" method="POST" action="?/save" style="display:contents;" use:enhance>`
- Header bar

    ↳ `<div style="padding:12px 16px;border-bottom:1px solid var(--mep-divider);display:flex;a…`
- Cabecera fields

    ↳ `<div style="padding:14px 16px;border-bottom:1px solid var(--mep-divider);flex-shrink:0;…`
- Line items

    ↳ `<div style="flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:140px;">`
- Totals footer

    ↳ `<div style="padding:12px 16px;border-top:1px solid var(--mep-divider);background:var(--…`
- Failed item panel

    ↳ `<div style="display:flex;flex-direction:column;gap:12px;max-width:560px;">`
- In-flight panel — real status only

    ↳ `<div class="card" style="display:flex;flex-direction:column;align-items:center;justify-…`
- Ready: nothing extracted yet

    ↳ `<div class="card" style="display:flex;flex-direction:column;align-items:center;justify-…`
- Content-duplicate block modal

    ↳ `{#if showContentDuplicateModal}`
- svelte-ignore a11y_no_static_element_interactions

    ↳ `<div`
- svelte-ignore a11y_no_static_element_interactions

    ↳ `<div`
- Low-confidence review gate modal

    ↳ `{#if showLowConfModal}`
- svelte-ignore a11y_no_static_element_interactions

    ↳ `<div`
- svelte-ignore a11y_no_static_element_interactions

    ↳ `<div`

### `src/routes/(app)/billing/+page.server.ts`

**`property available`**

- false when STRIPE_PRICE_ID_<TIER> is unset (issue #286)

    ↳ `available: isTierAvailable(tier as PlanTier),`

**`property checkout`**

- A tier whose STRIPE_PRICE_ID_* is unset used to throw out of createCheckoutSession as a 500 error page (issue #286). Surface it as a form error instead — it's a deployment misconfiguration, not a crash.

    ↳ `if (!isTierAvailable(tier)) {`
- Refuse a second checkout when the tenant already has a live subscription (issue #239). Without this, a user with an active plan — or one whose checkout.session.completed webhook is still in flight — could complete a second Checkout and hold two subscriptions charging the same card. Plan changes go through the Customer Portal instead.

    ↳ `const [existing] = await db.select({`
- Idempotency key (issue #250) — a double-submit must not spin up two Stripe checkout sessions. A replay lands back on /billing (a fresh page load mints a new key for a genuine retry).

    ↳ `const idemKeyRaw = formData.get('idempotency_key');`
- checkout_started (issue #253) — lets checkout drop-off be measured against plan_upgraded, which only fires on webhook success.

    ↳ `trackEvent('checkout_started', rid, { tier });`
- Reuse the per-submit idempotency key as the Stripe idempotency key so a proxy retry can't create a second Checkout session (#239).

    ↳ `idemKey ?? undefined,`
- Release the key so the user can retry after a Stripe hiccup.

    ↳ `if (idemKey) await releaseRequest(idemKey);`

### `src/routes/(app)/billing/+page.svelte`

**`const upgradeMessage`**

- Sent here by the upload gate once the trial lapses (issue #287).

    ↳ `: data.upgradeFor === 'trial' ? $t('billing.upgrade.trial')`

**`const idempotencyKey`**

- Idempotency key (issue #250) — one per page load so a double-submit can't spin up two Stripe checkout sessions.

    ↳ `const idempotencyKey = crypto.randomUUID();`

**`markup`**

- Status card

    ↳ `<div class="card" style="padding:24px;margin-bottom:20px;">`
- Plan card

    ↳ `{#if data.status !== 'active'}`

### `src/routes/(app)/budgets/+page.server.ts`

**`const load`**

- Include any custom categories already stored in the DB for this restaurant

    ↳ `const storedCats = rows.map(r => r.category);`

**`property save`**

- Only the current month can ever be edited — a past-month submission (e.g. a stale tab left open across a month boundary) is rejected here rather than trusted from the client, which only hides the Save button.

    ↳ `const currentMonth = toMonthStr(new Date());`
- Categories list is passed from the form so new custom ones are included

    ↳ `let categories: string[];`

### `src/routes/(app)/budgets/+page.svelte`

**`markup`**

- ── Desktop layout

    ↳ `<div class="hidden md:flex" style="height:100%;flex-direction:column;overflow:hidden;">`
- Overall progress card

    ↳ `<div class="card" style="padding:18px 20px;flex-shrink:0;" data-coach="budgets-main">`
- Budget table

    ↳ `<div class="card" style="padding:0;overflow:hidden;flex:1;display:flex;flex-direction:c…`
- Add category row

    ↳ `{#if !isPastMonth}`
- ── Mobile layout

    ↳ `<div class="flex md:hidden" style="height:100%;flex-direction:column;overflow:hidden;">`
- Scrollable content

    ↳ `<div style="flex:1;overflow-y:auto;padding:14px 16px 100px;display:flex;flex-direction:…`
- Hero summary card

    ↳ `<div class="card" style="padding:16px;">`
- Segmented bar

    ↳ `<div style="height:8px;border-radius:4px;background:var(--mep-surface-2);overflow:hidde…`
- Section header

    ↳ `<div style="padding:4px 2px 0;">`
- Category cards

    ↳ `{#each rows as r}`
- Top row: swatch + name + projection badge

    ↳ `<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">`
- Progress bar

    ↳ `{#if r.limit > 0}`
- 80% target marker

    ↳ `<div style="position:absolute;left:80%;top:-3px;bottom:-3px;width:1.5px;background:var(…`
- Amounts row: spent · % · remaining

    ↳ `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom…`
- Budget input

    ↳ `<div style="display:flex;align-items:center;gap:8px;">`
- Add category card (mobile)

    ↳ `{#if !isPastMonth}`
- Sticky save button

    ↳ `<div style="`

### `src/routes/(app)/chat/+page.server.ts`

**`const load`**

- Only accept a ?session= id that belongs to this tenant — otherwise fall back to the most recent session instead of leaking another tenant's chat.

    ↳ `const requestedId = sessionIdParam ? parseInt(sessionIdParam, 10) : NaN;`

### `src/routes/(app)/chat/+page.svelte`

**`function sendMessage`**

- Trial lapsed — paid capacity is off, but the data is still there.

    ↳ `messages = [...messages, { role: 'assistant', text: $t('chat.err.trialExpired') }];`
- Nothing new was persisted on the assistant side — invalidateAll() would rerun `load`, and the $effect below resyncs `messages` from that (unchanged) server data, silently wiping this error bubble before the user ever sees it (issue #306). Show it and stop.

    ↳ `messages = [...messages, { role: 'assistant', text: $t('chat.error') }];`

**`markup`**

- Backdrop (tap outside to close sidebar)

    ↳ `{#if mobileSidebarOpen}`
- Sidebar: always a fixed slide-over from the left, toggled by Historial button

    ↳ `<aside`
- Main chat area

    ↳ `<div style="flex:1;min-width:0;display:flex;flex-direction:column;background:var(--mep-…`
- Top bar: historial button + new chat button (all screen sizes)

    ↳ `<div`
- Messages

    ↳ `<div`
- Privacy note + Input

    ↳ `<div style="border-top:1px solid var(--mep-divider);background:var(--mep-bg);padding:12…`

### `src/routes/(app)/confirm/[id]/+page.server.ts`

**`const load`**

- Legacy route — superseded by /batch/[batchId]. Old links carry an item id; resolve it to the batch when possible, otherwise go home.

    ↳ `export const load: PageServerLoad = async ({ params }) => {`

### `src/routes/(app)/dashboard/+page.server.ts`

**`const load`**

- SSR'd so the trend chart renders with the rest of the dashboard instead of flashing a client-side "Loading…" state on every visit.

    ↳ `getTrendDataByRange(rid, '30d', 'weekly'),`
- Sparkline — daily spend for selected month

    ↳ `const sparkMap: Record<string, number> = {};`

**`function relativeTime`**

- Alerts

    ↳ `function relativeTime(iso: Date | string | null): string {`

**`const actions`**

- Guarded transitions (issue #243) — markPaid now also records paidAt (the reminders action always did) and markUnpaid clears the stale timestamps.

    ↳ `export const actions: Actions = {`

### `src/routes/(app)/dashboard/+page.svelte`

**`const currentMonthStr`**

- Period picker — derived values shared between mobile and desktop

    ↳ `const currentMonthStr = $derived(toMonthStr(new Date()));`

**`markup`**

- Mobile dashboard

    ↳ `<div class="md:hidden" style="height:100%;overflow:hidden;">`
- Desktop dashboard

    ↳ `<ErrorBoundary>`

### `src/routes/(app)/digest/+page.server.ts`

**`const load`**

- Generating a digest is a paid Gemini call, so it gates on live access the same way uploads and chat do (issue #287) — otherwise a lapsed tenant could keep minting them from this page.

    ↳ `const access = await getAccessState(rid);`

### `src/routes/(app)/extract/[id]/+page.server.ts`

**`const load`**

- Legacy route — superseded by /batch/[batchId]. Old links carry an item id; resolve it to the batch when possible, otherwise go home.

    ↳ `export const load: PageServerLoad = async ({ params }) => {`

### `src/routes/(app)/invoice/[id]/+page.svelte`

**`markup`**

- Mobile invoice detail

    ↳ `<div class="md:hidden" style="height:100%;overflow:hidden;">`
- Desktop invoice detail

    ↳ `<div class="hidden md:block">`
- Breadcrumb

    ↳ `<nav style="display:flex;align-items:center;gap:6px;">`
- Main two-column panel

    ↳ `<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">`
- Left: doc viewer (45%)

    ↳ `<div class="card" style="flex:0 0 44%;min-width:280px;overflow:hidden;">`
- Filename header

    ↳ `<div class="card-header">`
- Zoom controls (decorative)

    ↳ `<div style="display:flex;gap:4px;">`
- Document preview

    ↳ `{#if invoice.source_file}`
- Right: details + actions (55%)

    ↳ `<div style="flex:1;min-width:280px;display:flex;flex-direction:column;gap:12px;">`
- Fields card

    ↳ `<div class="card p-4" style="display:flex;flex-direction:column;gap:14px;">`
- Actions

    ↳ `<div style="display:flex;gap:8px;flex-wrap:wrap;">`
- Line items

    ↳ `{#if lineItems.length > 0}`
- Activity timeline

    ↳ `<div class="card p-4" style="display:flex;flex-direction:column;gap:12px;">`
- Dot + line

    ↳ `<div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0;width:1…`
- Content

    ↳ `<div style="display:flex;flex-direction:column;gap:1px;">`
- end desktop wrapper

### `src/routes/(app)/invoice/[id]/edit/+page.server.ts`

**`property save`**

- Optimistic concurrency (issue #242): the form carries the version it loaded; the UPDATE below only fires if it still matches.

    ↳ `const expectedVersion = Number(data.get('version'));`
- Idempotency key (issue #250) — claimed inside the transaction below.

    ↳ `const idemKeyRaw = data.get('idempotency_key');`
- Header update + line-item delete/reinsert commit atomically — a crash between the delete and the insert must not destroy the line items.

    ↳ `let conflict: 'duplicate' | 'stale' | null = null;`
- Idempotency claim first (#250) — a replayed submit skips the whole edit and falls through to the same /invoices redirect as success.

    ↳ `if (idemKey && !(await claimRequest(idemKey, rid, tx))) {`
- Atomic supplier get-or-create (issue #238).

    ↳ `supplierId = await getOrCreateSupplierId(rid, supplierName, tx);`
- Release so a corrected resubmit isn't skipped as a replay (#250).

    ↳ `if (idemKey) await releaseRequest(idemKey, tx);`

**`const updated`**

- Tolerate a missing/invalid version (e.g. a form cached from before this field existed) — no guard rather than a hard 409.

    ↳ `Number.isFinite(expectedVersion) ? eq(invoices.version, expectedVersion) : undefined,`

**`property save`**

- Replay (#250) and success share the destination — the first submit already applied the edit.

    ↳ `redirect(303, '/invoices');`

### `src/routes/(app)/invoice/[id]/edit/+page.svelte`

**`const idempotencyKey`**

- Idempotency key (issue #250) — one per loaded invoice; a validation-error retry reuses it (the failed save released the key), a fresh load mints one.

    ↳ `const idempotencyKey = $derived.by(() => { void invoice.id; return crypto.randomUUID();…`

**`const computedLineTotal`**

- Older invoices can have a null stored total (extraction gap). Fall back to the sum of line totals so the field isn't blank when the data to fill it is right there in the table below.

    ↳ `const computedLineTotal = $derived(`

**`markup`**

- Invoice details

    ↳ `<div class="card p-5">`
- Line items

    ↳ `<div class="card overflow-hidden">`

### `src/routes/(app)/invoices/+page.server.ts`

**`const load`**

- Set by the batch save action after the last invoice of a batch lands (issue #235) — replaces the /save-confirmation interstitial.

    ↳ `const savedId = parseInt(url.searchParams.get('saved') ?? '', 10);`
- Alerts raised while saving that invoice ride along on the toast instead of needing their own page.

    ↳ `const savedAlerts = Number.isFinite(savedId)`
- Line items only for the current page

    ↳ `const invoiceIds = invoiceRows.map(r => r.id);`

**`property markPaid`**

- Guarded transitions (issue #243) — a stale tab gets a conflict banner instead of silently overwriting a change made elsewhere.

    ↳ `markPaid: async ({ request, locals }) => {`

### `src/routes/(app)/invoices/+page.svelte`

**`const toastDismissed`**

- Save confirmation (issue #235): saving the last invoice of a batch used to land on a whole page whose only job was to say "saved ✓". It now lands here, on the list that just changed, with a toast. Alerts raised during the save ride along, so nothing is lost by dropping the interstitial. A toast with alerts stays until dismissed; a plain "saved" fades on its own.

    ↳ `let toastDismissed = $state(false);`

**`const checkedIds`**

- Selection

    ↳ `let checkedIds = $state<Set<number>>(new Set());`

**`const openIds`**

- Row expansion

    ↳ `let openIds = $state<Set<number>>(new Set());`

**`const noteText`**

- Notes

    ↳ `let noteText = $state<Record<number, string>>({});`

**`const confirmPaidOpen`**

- Confirm dialogs

    ↳ `let confirmPaidOpen        = $state(false);`

**`function handleBulkPaid`**

- Bulk actions

    ↳ `function handleBulkPaid() {`

**`markup`**

- Saved toast — shared by both layouts (issue #235)

    ↳ `{#if showSavedToast}`
- Mobile invoice list

    ↳ `<div class="md:hidden" style="height:100%;overflow:hidden;">`
- Desktop invoice list

    ↳ `<div class="hidden md:flex flex-col gap-4 p-6">`
- ── KPI Strip

    ↳ `<div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-3" dat…`
- ── Filter bar + table

    ↳ `<SectionCard title={$t('inv.title')} noPad>`
- Filter bar

    ↳ `<form method="get" action="/invoices"`
- Hidden bulk forms

    ↳ `<form id="bulk-paid-form" method="post" action="?/bulkPaid" class="hidden">`
- Bulk action bar

    ↳ `<div class="flex items-center gap-3 px-4 py-2 border-b border-divider min-h-[40px]">`
- Invoice rows

    ↳ `<div class="grid gap-3 p-4 xl:grid-cols-2">`
- Main row

    ↳ `<button type="button"`
- Checkbox

    ↳ `<input type="checkbox"`
- Supplier + invoice no

    ↳ `<div class="min-w-0">`
- Due date

    ↳ `<div class="body text-fg-3 max-[800px]:hidden" style="font-size:12px;">`
- Amount

    ↳ `<div class="num text-right font-semibold" style="font-size:13px;">`
- Status badge

    ↳ `<div class="max-[800px]:hidden">`
- Expand chevron

    ↳ `<div class="flex justify-end text-fg-3 transition-transform {expanded ? 'rotate-90' : '…`
- Expanded drawer

    ↳ `{#if expanded}`
- Actions row

    ↳ `<div class="flex items-center gap-2 flex-wrap">`
- Line items

    ↳ `{#if inv.line_items.length > 0}`
- Notes

    ↳ `<div class="flex flex-col gap-1.5">`
- Pagination

    ↳ `{#if pagination.totalPages > 1}`
- Confirm dialogs

    ↳ `<ConfirmDialog`

### `src/routes/(app)/invoices/export/download/+server.ts`

**`const GET`**

- Header row styling

    ↳ `const headerRow = sheet.getRow(1);`
- Borders + banded rows for the data

    ↳ `sheet.eachRow((row, rowNumber) => {`

### `src/routes/(app)/products/[id]/+page.server.ts`

**`property update`**

- Both fields filled in ⇒ this product's pack size is now known; clear any pending "how many base units does this pack contain?" alerts for it.

    ↳ `if (unitsPerPack != null && baseUnit) {`

### `src/routes/(app)/products/[id]/+page.svelte`

**`type BlockedSupplier`**

- The delete action re-renders this page with `form.suppliers` when blocked (issue: full-CRUD Products, delete requires unlinking every supplier first).

    ↳ `type BlockedSupplier = { supplierId: number; supplierName: string };`

**`const confirmUnlinkOpen`**

- Per-supplier unlink: first confirmation.

    ↳ `let confirmUnlinkOpen = $state(false);`

**`const confirmDeleteOpen`**

- Final delete: second confirmation, only reachable once nothing is linked.

    ↳ `let confirmDeleteOpen = $state(false);`

### `src/routes/(app)/reminders/+page.server.ts`

**`const rows`**

- Show pending AND accepted invoices that have not been paid yet

    ↳ `sql'${invoices.status} IN ('pending', 'accepted')',`

**`const enriched`**

- 4-working-day acceptance countdown: only applies to e-invoices still 'pending'

    ↳ `let acceptanceWorkingDaysLeft: number | null = null;`

**`const actions`**

- Guarded transitions (issue #243): a stale tab whose invoice was already accepted/rejected/paid elsewhere gets a conflict banner, not a silent overwrite of the other change.

    ↳ `export const actions: Actions = {`

**`property acceptInvoice`**

- Accept an e-invoice — starts the paid-status obligation clock (RD 238/2026).

    ↳ `acceptInvoice: async ({ request, locals }) => {`

**`property rejectInvoice`**

- Reject an e-invoice — records the rejection date (RD 238/2026).

    ↳ `rejectInvoice: async ({ request, locals }) => {`

### `src/routes/(app)/reminders/+page.svelte`

**`markup`**

- Mobile alerts

    ↳ `<div class="md:hidden" style="height:100%;overflow:hidden;">`
- Desktop reminders

    ↳ `<div class="hidden md:flex flex-col gap-4 p-6">`
- Summary chips

    ↳ `<div class="flex gap-2 flex-wrap items-center" data-coach="reminders-main">`
- Overdue section

    ↳ `{#if data.overdue.length}`
- Due soon section

    ↳ `{#if data.due_soon.length}`

### `src/routes/(app)/settings/+page.server.ts`

**`const WHATSAPP_ENABLED`**

- The WhatsApp card is pointless when the bot isn't wired up — authorising a number would do nothing, because no webhook is delivering messages.

    ↳ `const WHATSAPP_ENABLED = Boolean(WHATSAPP_ACCESS_TOKEN && WHATSAPP_PHONE_NUMBER_ID);`

**`const WHATSAPP_BOT_NUMBER`**

- The bot's own number, resolved once at boot (issue #319).

    Authorising a staff number is only half of onboarding — the staff member also has to know *what number to message*, and nothing in the app ever said. The QR is the one that matters in practice: it gets printed and stuck in the kitchen, so nobody types a phone number into a shared handset.

    Null when `WHATSAPP_DISPLAY_NUMBER` is unset or unparseable; the card then renders its authorisation half exactly as before rather than showing a broken link.

    ↳ `const WHATSAPP_BOT_NUMBER = (() => {`

**`property qrSvg`**

- The QR encodes the same wa.me link, so scanning and tapping land in the same chat. Rendered once at boot — it never varies per tenant.

    ↳ `qrSvg: renderQrSvg(link),`

**`const load`**

- Locations this user belongs to (issue #290)

    ↳ `db.select({ id: restaurants.id, name: restaurants.name })`
- Live enrolment code, if the owner has one outstanding (issue #320).

    ↳ `WHATSAPP_ENABLED ? activePairingCode(rid) : Promise.resolve(null),`

**`property profile`**

- Profile section (issue #293)

    ↳ `profile: {`

**`property hasPassword`**

- Google accounts have no password to change in this app.

    ↳ `hasPassword: locals.user!.app_metadata?.provider === 'email',`

**`property locations`**

- Multi-location (issue #290)

    ↳ `locations: locationRows,`

**`property whatsappEnabled`**

- WhatsApp invoice bot — authorised sender numbers.

    ↳ `whatsappEnabled: WHATSAPP_ENABLED,`

**`property whatsappBotNumber`**

- …and where to send those invoices (issue #319).

    ↳ `whatsappBotNumber: WHATSAPP_BOT_NUMBER,`

**`property whatsappPairingCode`**

- Self-service enrolment (issue #320).

    ↳ `whatsappPairingCode: pairingCode,`

**`property saveName`**

- ── Profile (issue #293)

    ↳ `/** Display name — stored in Supabase user_metadata, read by the layout. */`
- Display name — stored in Supabase user_metadata, read by the layout.

    ↳ `saveName: async ({ request, locals }) => {`

**`property saveEmail`**

- Email change. Supabase sends a confirmation link to the *new* address (and, when "secure email change" is on, to the old one too); the address only changes once confirmed, so this reports "check your inbox", never "done".

    ↳ `saveEmail: async ({ request, locals, url }) => {`

**`property changePassword`**

- Password change while signed in. The current password is re-verified first — an unattended session must not be enough to take over the account.

    ↳ `changePassword: async ({ request, locals, getClientAddress }) => {`
- Same brute-force budget as the login form, keyed on the account.

    ↳ `if (!(await checkRateLimit('password-change:${locals.user!.id}', 5))) {`

**`property addLocation`**

- Add a location (issue #290). Business tier only, capped at the tier's maxLocations. The new restaurant is a child of the paying one, so it inherits the plan instead of starting its own trial, and the caller becomes its owner. Data stays fully separate — only billing is shared.

    ↳ `addLocation: async ({ request, locals, cookies }) => {`
- Slug carries a random suffix for the same reason onboarding's does: two restaurants may legitimately share a name.

    ↳ `const slug = '${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')`
- Plan name/quota for the new location mirror the paying subscription.

    ↳ `await applyTierSettings(newId, tier);`
- Switch to it — adding a location and then having to find the switcher would be a strange place to stop.

    ↳ `cookies.set('active_restaurant', newId, {`

**`property renameRestaurant`**

- Rename the restaurant. Owner-only; the slug stays fixed.

    ↳ `renameRestaurant: async ({ request, locals }) => {`
- Keep the settings override in step so the header does not keep showing the old name for tenants that have one.

    ↳ `await db.update(settings)`

**`property addWhatsappContact`**

- ── WhatsApp bot: authorised numbers

    ↳ `/**`
- Authorise a phone number to send invoices for this restaurant. Owner-only: an authorised number can inject invoices into the tenant and spend its extraction quota, so this is the same trust level as renaming the venue.

    ↳ `addWhatsappContact: async ({ request, locals }) => {`

**`property removeWhatsappContact`**

- De-authorise a number. Owner-only, tenant-scoped.

    ↳ `removeWhatsappContact: async ({ request, locals }) => {`

**`property generateWhatsappPairingCode`**

- Mint a pairing code (issue #320). Same owner-only gate as typing a number in by hand — the code is a bearer token for exactly that privilege.

    ↳ `generateWhatsappPairingCode: async ({ request, locals }) => {`

**`property revokeWhatsappPairingCode`**

- Cancel the outstanding code — e.g. it was read out to the wrong person.

    ↳ `revokeWhatsappPairingCode: async ({ locals }) => {`

**`function requireOwner`**

- True when this user owns the restaurant.

    ↳ `async function requireOwner(restaurantId: string, userId: string): Promise<boolean> {`

### `src/routes/(app)/settings/+page.svelte`

**`const feedback`**

- Profile forms (issue #293) each report into their own card; `section` identifies which one the last submit came from.

    ↳ `const feedback = (section: string) => (form?.section === section ? form : null);`

**`const formatTime`**

- Pairing codes expire in minutes (issue #320), so the owner needs the wall clock, not a date — they are relaying this to someone standing next to them.

    ↳ `const formatTime = (at: Date | string) =>`

**`const botNumberCopied`**

- Copy the bot number (issue #319). Staff often read it off one phone and type it into another; copying removes the step that goes wrong.

    ↳ `let botNumberCopied = $state(false);`

**`function copyBotNumber`**

- Clipboard blocked (insecure context, denied permission) — the number is on screen and selectable, so there is nothing to recover from.

    ↳ `}`

**`markup`**

- Display name

    ↳ `<form method="POST" action="?/saveName" class="flex flex-col gap-2">`
- Email

    ↳ `<form method="POST" action="?/saveEmail" class="flex flex-col gap-2">`
- Password

    ↳ `<form method="POST" action="?/changePassword" class="flex flex-col gap-2">`
- Restaurant name

    ↳ `<form method="POST" action="?/renameRestaurant" class="flex flex-col gap-2">`
- Where to send invoices (issue #319). Authorising a number is useless if the staff member never learns what to message.

    ↳ `<div class="wa-number-block">`
- eslint-disable-next-line svelte/no-at-html-tags

    ↳ `<div class="wa-qr" aria-hidden="true">{@html data.whatsappBotNumber.qrSvg}</div>`
- Self-service enrolment (issue #320). The number is captured from the message, so it cannot be mistyped the way the form below can.

    ↳ `<div class="wa-pair-block">`

**`style`**

- WhatsApp bot number + QR (issue #319).

    ↳ `.wa-number-block {`
- Pairing code (issue #320) — read off a screen and typed into a phone, so it is set large, monospaced and widely tracked.

    ↳ `.wa-pair-block {`
- The QR is meant to be printed and taped up in the kitchen, so it is sized in absolute units — 45 mm on paper scans reliably from arm's length.

    ↳ `.wa-qr {`
- Explicit white backing: a dark-theme card behind a transparent QR inverts the modules and scanners reject it.

    ↳ `background: #fff;`

### `src/routes/(app)/suppliers/[id]/+page.server.ts`

**`const load`**

- Build 7-month spend history for chart

    ↳ `const monthlyMap: Record<string, number> = {};`

**`property update`**

- Backfill (issue #307): products created from this supplier's invoices only ever get a category once, at creation time, from whatever the supplier's category was then — usually the 'Other' default. Editing the supplier here is the one moment a user expresses a real category, so carry it onto that supplier's still-uncategorized products instead of leaving them stuck on 'Other' forever.

    ↳ `if (cat) {`

**`property delete`**

- One transaction — a crash between statements must not leave invoices detached from a supplier that still exists (issue #247).

    ↳ `await db.transaction(async (tx) => {`

### `src/routes/(app)/suppliers/[id]/+page.svelte`

**`const SERIES_COLORS`**

- Product spend donut â€” top 5 + "Other", fixed categorical hue order (never cycled)

    ↳ `const SERIES_COLORS = ['var(--mep-series-1)', 'var(--mep-series-2)', 'var(--mep-series-…`

**`markup`**

- ── MOBILE

    ↳ `<div class="flex md:hidden" style="height:100%;flex-direction:column;overflow:hidden;">`
- Header

    ↳ `<div style="padding:14px 18px 0;flex-shrink:0;">`
- Edit form (mobile)

    ↳ `{#if editing}`
- KPI strip

    ↳ `<div class="card" style="margin-bottom:12px;padding:10px 14px;display:flex;align-items:…`
- Tabs

    ↳ `<div style="display:flex;gap:6px;overflow-x:auto;padding-bottom:12px;scrollbar-width:no…`
- Tab content (scrollable)

    ↳ `<div style="flex:1;overflow:auto;padding:0 18px 24px;display:flex;flex-direction:column…`
- Info card

    ↳ `<div class="card" style="padding:14px;">`
- Recent invoices

    ↳ `{#if data.invoices.length}`
- Reliability

    ↳ `{#if m}`
- Mobile add form

    ↳ `<div class="card" style="padding:14px;">`
- Desktop supplier detail

    ↳ `<div class="hidden md:flex" style="height:100%;flex-direction:column;overflow:hidden;">`

### `src/routes/(app)/suppliers/+page.server.ts`

**`const load`**

- Refresh stale scores (>24h old) for suppliers with enough invoices

    ↳ `const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();`

### `src/routes/(app)/suppliers/+page.svelte`

**`markup`**

- Mobile suppliers

    ↳ `<div class="md:hidden" style="height:100%;overflow:hidden;">`
- Desktop suppliers

    ↳ `<div class="hidden md:flex" style="height:100%;flex-direction:column;overflow:hidden;">`

## Public routes (marketing, auth, webhooks)

### `src/routes/(admin)/+layout.svelte`

**`markup`**

- Admin banner

    ↳ `<header style="`
- Page content

    ↳ `<main style="flex:1;overflow:auto;">`

### `src/routes/(admin)/admin/+page.server.ts`

**`const load`**

- Invoices saved in last 7 days

    ↳ `db.select({ cnt: sql<number>'COUNT(*)' })`
- Active restaurants (had invoices) in last 7 days

    ↳ `db.select({ cnt: sql<number>'COUNT(DISTINCT ${invoices.restaurantId})' })`
- Pending system notifications (global)

    ↳ `db.select({ cnt: sql<number>'COUNT(*)' })`
- Total invoices

    ↳ `db.select({ cnt: count() }).from(invoices),`
- Total suppliers

    ↳ `db.select({ cnt: count() }).from(suppliers),`
- Total restaurants

    ↳ `db.select({ cnt: count() }).from(restaurants),`
- Sessions currently being extracted by the worker

    ↳ `db.select({ cnt: sql<number>'COUNT(*)' })`
- Most recently created restaurants

    ↳ `db.execute(sql'`

### `src/routes/(admin)/admin/+page.svelte`

**`markup`**

- 7-day KPIs

    ↳ `<section>`
- Totals

    ↳ `<section>`
- Recent restaurants

    ↳ `<section>`
- Links

    ↳ `<section style="display:flex;gap:10px;flex-wrap:wrap;">`

### `src/routes/(admin)/admin/events/+page.server.ts`

**`const load`**

- Available event types for the filter dropdown

    ↳ `db.execute(sql'`

### `src/routes/(admin)/admin/events/+page.svelte`

**`markup`**

- Type filter

    ↳ `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">`
- Table

    ↳ `<div class="card" style="overflow:hidden;padding:0;">`
- Pagination

    ↳ `{#if data.totalPages > 1}`

### `src/routes/(admin)/admin/health/+page.server.ts`

**`const STUCK_MINUTES`**

- A worker that died leaves items stuck in queued/extracting. Warn on any item stuck past this; error past the count threshold (issue #257).

    ↳ `const STUCK_MINUTES = 15;`

**`const load`**

- DB connectivity

    ↳ `let dbOk = false;`
- Table record counts (only if DB is reachable)

    ↳ `let tableCounts: Array<{ table: string; rows: number }> = [];`
- pg_stat not available in all environments

    ↳ `}`
- Worker liveness + queue depth — a worker that died Friday night otherwise shows a green page while invoices pile up in 'queued' (issue #257).

    ↳ `if (dbOk) {`
- Shared WhatsApp number (issue #321). One WABA serves every tenant, so a quality downgrade or restriction stops ingest for the whole customer base at once — it belongs on the same page as the worker and the database.

    ↳ `let whatsapp: {`

**`property status`**

- Never reported is not the same as healthy — it means the account-level webhook fields are not subscribed yet, so a downgrade would arrive as silence.

    ↳ `status: !health.everReported`

**`const load`**

- Required env vars

    ↳ `const requiredVars = [`

### `src/routes/(admin)/admin/health/+page.svelte`

**`type Severity`**

- WhatsApp account events carry their own severity vocabulary (issue #321); map it onto the page's existing three states rather than inventing a second colour scheme on the same screen.

    ↳ `type Severity = 'info' | 'warning' | 'critical';`

**`const QUALITY_COLOR`**

- Meta's own vocabulary for the quality rating — worth showing literally, since that is what the WhatsApp Manager UI says.

    ↳ `const QUALITY_COLOR: Record<string, string> = {`

**`markup`**

- Checks

    ↳ `<div class="card" style="overflow:hidden;padding:0;">`
- Shared WhatsApp number (issue #321). One WABA serves every tenant, so a quality downgrade here is an incident, not a metric.

    ↳ `{#if data.whatsapp}`
- Which tenant to talk to if blocks spike. Read-only: de-authorising a number stays an explicit act in that owner's own Settings.

    ↳ `{#if data.whatsapp.tenants.length > 0}`
- Table row counts

    ↳ `{#if data.tableCounts.length > 0}`

### `src/routes/api/auth/[...all]/+server.ts`

**_module level_**

- Auth is now handled by Supabase. This route is intentionally empty. Supabase OAuth callback lives at /auth/callback.

    ↳ `export {};`

### `src/routes/api/batch-status/[id]/+server.ts`

**`const GET`**

- Single poll endpoint for the batch page — returns every item's real status. This is the only feedback channel the UI uses; there is no client-side simulated progress anywhere.

    ↳ `export const GET: RequestHandler = async ({ params, locals }) => {`

**`property status`**

- `pending` reads as queued once extraction was requested; the page only polls while something is in flight, so this is always right.

    ↳ `status: i.status,`

### `src/routes/api/health/+server.ts`

**`function GET`**

- DB check

    ↳ `let dbReachable = false;`
- dbReachable stays false

    ↳ `}`
- Worker / extraction queue depth (pg-boss). A growing backlog is the canonical signal that the worker process is down or wedged.

    ↳ `let queue: { reachable: boolean; pending: number } = { reachable: false, pending: 0 };`
- pgboss schema not provisioned yet — reachable stays false

    ↳ `}`
- Active upload sessions (updated in last 24 h)

    ↳ `let activeCount = 0;`
- ignore — analytics only

    ↳ `}`
- Uploads directory check (local driver only)

    ↳ `let uploadsDir: { writable: boolean; free_mb: number } | null = null;`
- not writable

    ↳ `}`
- fs.statfsSync available Node ≥ 18.8

    ↳ `const stat = (fs as unknown as { statfsSync?: (p: string) => { bfree: number; bsize: nu…`
- ignore

    ↳ `}`
- Non-200 when degraded so load balancers / uptime monitors detect it.

    ↳ `{ status: degraded ? 503 : 200 }`

### `src/routes/api/stripe-webhook/+server.ts`

**`const POST`**

- Stripe sends webhook events here. Configure the URL in the Stripe dashboard.

    ↳ `export const POST: RequestHandler = async ({ request }) => {`
- Signature failures are expected noise (forged/misconfigured senders) and un-retryable → 400. Everything else is a real handler failure (e.g. a DB write for checkout.session.completed): report it and return 500 so Stripe retries and its dashboard flags the endpoint (issue #253).

    ↳ `if (err instanceof WebhookSignatureError) {`

### `src/routes/api/user/delete/+server.ts`

**`function deleteTenantFiles`**

- Remove every stored file belonging to these restaurants (issue #289): confirmed invoices (`invoices.source_file`), files still sitting in an upload batch (`batch_items.file_key`) and WhatsApp bot captures (`whatsapp_bot_sessions.file_key`). Failures are logged, never thrown — the account deletion must still complete.

    ↳ `async function deleteTenantFiles(restaurantIds: string[]): Promise<void> {`

**`const POST`**

- Destructive + irreversible — cap attempts to blunt accidental/abusive bursts.

    ↳ `if (!(await checkRateLimit('account-delete:${user.id}', 3))) {`
- Require explicit confirmation in request body

    ↳ `const body = await request.json().catch(() => ({}));`
- Collect all restaurants the user owns

    ↳ `const memberships = await db`
- Delete owned restaurants (cascades to all business data via FK) — but only those where this user is the sole member. Restaurants with other members survive so one owner's account deletion can't wipe teammates' data.

    ↳ `if (ownedIds.length > 0) {`
- Cancel live Stripe subscriptions BEFORE deleting the rows that link the Stripe customer to the tenant — otherwise the card keeps being charged for a deleted account and support can't trace it (issue #246). Immediate cancellation (GDPR deletion, not cancel-at-period-end).

    ↳ `const liveSubs = await db`
- GDPR deletion has to reach the files, not just the rows (issue #289): once the restaurant row goes, the DB cascade drops every pointer to the uploaded invoice PDFs and photos, and nothing would ever be able to find them again. Delete them first, best-effort — a storage hiccup must not block the account deletion.

    ↳ `await deleteTenantFiles(soleOwnedIds);`
- All row deletes commit atomically so a mid-flight failure leaves a clean state to retry from, not a half-deleted account.

    ↳ `await db.transaction(async (tx) => {`
- Remove the user from any restaurants they're a member of (but don't own).

    ↳ `await tx.delete(userRestaurants).where(eq(userRestaurants.userId, user.id));`
- No owned restaurants — still detach the user from shared ones.

    ↳ `await db.delete(userRestaurants).where(eq(userRestaurants.userId, user.id));`
- Delete the Supabase Auth account (must be last — keeps the endpoint retryable: the Stripe cancels and DB deletes above are all idempotent).

    ↳ `const admin = createSupabaseAdminClient();`

### `src/routes/api/user/export/+server.ts`

**`const GET`**

- Full-account export is a heavy multi-table read — cap per user.

    ↳ `if (!(await checkRateLimit('account-export:${user.id}', 5))) {`

### `src/routes/api/whatsapp/webhook/+server.ts`

**`function verifySignature`**

- WhatsApp Cloud API webhook. GET — Meta verify-token challenge (set WHATSAPP_VERIFY_TOKEN in env). POST — Incoming messages from WhatsApp Business.

    Configure the webhook URL in Meta Developer Console: https://developers.facebook.com/apps → WhatsApp → Configuration → Webhook URL: https://your-domain.com/api/whatsapp/webhook Verify token: value of WHATSAPP_VERIFY_TOKEN Subscribed fields: messages, account_update, phone_number_quality_update

    The account fields are what turn a shared-number quality downgrade from something discovered via support tickets into something delivered (#321).

    ↳ `import { json } from '@sveltejs/kit';`
- Verify Meta's X-Hub-Signature-256 HMAC over the raw request body. A configured secret with a bad/missing signature is rejected. A missing secret is tolerated only outside production (dev / not-yet-set-up): in production the webhook fails CLOSED, because an unauthenticated POST here can impersonate a registered WhatsApp number and inject invoices into that tenant (plus burn Gemini extraction quota).

    ↳ `function verifySignature(rawBody: string, header: string | null): boolean {`

**`const GET`**

- Meta calls GET to verify the webhook endpoint during setup.

    ↳ `export const GET: RequestHandler = async ({ url }) => {`

**`const POST`**

- WhatsApp delivers message events here. We return 200 immediately.

    ↳ `export const POST: RequestHandler = async ({ request }) => {`
- Read the raw body first — HMAC must be computed over the exact bytes Meta sent.

    ↳ `const rawBody = await request.text();`
- Process asynchronously — WhatsApp expects a 200 within 5 s

    ↳ `for (const msg of messages) {`
- Account-level events (issue #321). Ingest for every tenant runs through one shared number, so a quality downgrade or restriction has to be delivered here rather than discovered from support tickets.

    ↳ `for (const evt of accountEvents) {`

**`function extractChanges`**

- Split a webhook payload into inbound messages and account-level events.

    Meta multiplexes every subscribed field through the same endpoint and distinguishes them by `changes[].field`. Reading `value.messages` regardless of the field (as this did) silently discarded everything that was not a message — including the quality and restriction notices #321 exists to catch.

    ↳ `function extractChanges(body: unknown): {`
- Statuses (sent/delivered/read receipts) are the other high-volume field and carry no health signal — skip them rather than filling the events table with noise.

    ↳ `if (Array.isArray(value.statuses)) continue;`
- Anything else that is subscribed is health-relevant by definition: we only subscribe to fields we intend to act on, and an unrecognised event is better recorded than dropped.

    ↳ `accountEvents.push({ field, value });`

### `src/routes/auth/callback/+server.ts`

**`const GET`**

- Handles Supabase OAuth callback — exchanges code for session cookies.

    ↳ `export const GET: RequestHandler = async ({ url, locals, getClientAddress }) => {`
- Only allow relative paths to prevent open-redirect attacks

    ↳ `const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';`
- The provider handed us back an error (denied consent, misconfig, …).

    ↳ `logAuthEvent('oauth_error', { ipHash: hashIp(getClientAddress()), stage: 'callback_prov…`
- consent=1 → the signup page validated the T&C checkbox before starting the OAuth flow; persist it now that the user id exists.

    ↳ `if (url.searchParams.get('consent') === '1' && data.user?.id) {`

### `src/routes/forgot-password/+page.server.ts`

**`const load`**

- "Forgot password" request page (issue #284).

    Sends a Supabase recovery link that lands on /auth/callback (which exchanges the code for a session) and continues to /reset-password.

    The response is identical whether or not the address has an account — a different message here would turn this form into an account-enumeration oracle. Rate limited per IP and per email like the login action.

    ↳ `import { fail } from '@sveltejs/kit';`

**`property default`**

- Supabase returns an error for malformed addresses and for its own rate limiter, but never "no such user". Log it and still answer "sent".

    ↳ `if (error) {`

### `src/routes/login/+page.server.ts`

**`property signIn`**

- Failures return fail() instead of redirecting so the form keeps the typed email — retyping it after a password slip is pure friction.

    ↳ `if (!email || !password) return fail(422, { error: 'missing', email: email ?? '' });`
- Brute-force protection: per-IP and per-account attempt caps.

    ↳ `const ipHash  = hashIp(getClientAddress());`

### `src/routes/login/+page.svelte`

**`const error`**

- Form failures carry the error inline (keeping the typed email); the query param remains for OAuth-callback redirects, which have no form state.

    ↳ `const error = $derived(form?.error ?? $page.url.searchParams.get('error'));`

**`const resetDone`**

- Set after a completed password reset (issue #284) — the user signs in again with the new password, which is also the proof it took effect.

    ↳ `const resetDone = $derived($page.url.searchParams.get('reset') === '1');`

**`markup`**

- Logo

    ↳ `<div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bott…`
- Card

    ↳ `<div class="card" style="padding:28px;">`
- Divider

    ↳ `<div style="display:flex;align-items:center;gap:10px;margin:18px 0;">`
- Google OAuth

    ↳ `<form method="POST" action="?/signInWithGoogle">`

### `src/routes/onboarding/+page.server.ts`

**`const load`**

- Users who signed up via Google from the login page have no recorded T&C acceptance yet — ask for it here, on first authenticated landing.

    ↳ `const needsConsent = !(await hasConsent(locals.user.id));`

**`property default`**

- Idempotent creation (issue #241). A double-submit or the same form in two tabs must not create two restaurants + two trials + two welcome emails. The slug carries a random suffix so no unique constraint can fire, so we serialize per user with an advisory lock and re-check membership inside it — a replay finds the first submit's restaurant and becomes a no-op redirect to '/'. The #250 idempotency key is a second guard for the exact same submit.

    ↳ `let newRestaurantId: string | null = null;`
- Start 30-day free trial for new restaurant

    ↳ `const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);`
- Side effects only for the submit that actually created the restaurant — a replay skips them so there is exactly one welcome email.

    ↳ `if (newRestaurantId) {`
- Persist plan_name / plan_quota so the trial counter and quota gate have data from day one (layout otherwise falls back to tier defaults).

    ↳ `await applyTierSettings(newRestaurantId, 'trial');`
- Send welcome email (fire-and-forget)

    ↳ `if (locals.user.email) {`

### `src/routes/onboarding/+page.svelte`

**`const idempotencyKey`**

- Idempotency key (issue #250) — one per page load so a double-submit can't create two restaurants.

    ↳ `const idempotencyKey = crypto.randomUUID();`

**`markup`**

- Language toggle

    ↳ `<div style="display:flex;justify-content:flex-end;margin-bottom:16px;">`
- Logo

    ↳ `<div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bott…`
- Card

    ↳ `<div class="card" style="padding:28px;">`

### `src/routes/reset-password/+page.server.ts`

**`const MIN_PASSWORD_LENGTH`**

- Set a new password from a recovery link (issue #284).

    /auth/callback exchanges the emailed code for a session and forwards here, so reaching this page with a user in locals *is* the proof of ownership. Landing without one means the link expired or was already used.

    On success the session is signed out and the user re-authenticates with the new password — it proves the change took, and it drops the recovery session from the browser.

    ↳ `import { fail, redirect } from '@sveltejs/kit';`

**`property default`**

- Supabase rejects a password identical to the current one and anything its own policy refuses; both are user-fixable.

    ↳ `return fail(400, { error: 'failed' });`

### `src/routes/robots.txt/+server.ts`

**`const GET`**

- (app) is a SvelteKit route group and never appears in real URLs, so the authenticated pages must be listed by their served paths.

    ↳ `const body = [`

### `src/routes/signup/+page.server.ts`

**`property signUp`**

- Cap account-creation attempts per IP (abuse / user-enumeration control).

    ↳ `if (!(await checkRateLimit('signup:ip:${getClientAddress()}', 5))) {`
- Explicit, recorded consent to Terms + Privacy Policy (GDPR).

    ↳ `if (terms !== 'on') return fail(422, { error: 'terms_required' });`
- A broken Supabase auth config shows up here as a generic failure — surface it so it's distinguishable from "no one is signing up".

    ↳ `logAuthEvent('signup_failed', { ipHash: hashIp(getClientAddress()) });`
- Persist the checkbox acceptance (timestamp + policy version) for audit.

    ↳ `if (data.user?.id) {`
- Welcome email is sent once, after onboarding completes (covers both email and Google sign-ups and fires when the account is actually active).

    ↳ `return { success: true, email };`

**`property resend`**

- Re-send the verification link from the "check your email" screen, so a lost or delayed email doesn't strand the user outside the app.

    ↳ `resend: async ({ request, locals, url, getClientAddress }) => {`
- Success-shaped returns keep the "check your email" screen on screen; `resent` distinguishes a real send from a rate-limited attempt.

    ↳ `if (!(await checkRateLimit('signup:resend:${getClientAddress()}', 3))) {`

**`property signUpWithGoogle`**

- OAuth sign-ups must accept the Terms too; the callback records the consent once the Supabase user exists (consent=1 flag).

    ↳ `const form = await request.formData();`

### `src/routes/signup/+page.svelte`

**`const termsAccepted`**

- Shared consent state: the Google OAuth form is separate markup, so it mirrors the checkbox via a hidden input. The button itself stays enabled (issue #234) — a disabled OAuth button reads as broken, and its only explanation used to be a hover title, which touch devices never show. Consent is still required: the click validates it here and the server action re-checks it.

    ↳ `let termsAccepted = $state(false);`

**`markup`**

- Logo

    ↳ `<div style="display:flex;align-items:center;gap:10px;justify-content:center;margin-bott…`
- Card

    ↳ `<div class="card" style="padding:28px;">`
- Success state

    ↳ `<div style="text-align:center;padding:8px 0;">`
- Divider

    ↳ `<div style="display:flex;align-items:center;gap:10px;margin:18px 0;">`
- Google OAuth

    ↳ `<form method="POST" action="?/signUpWithGoogle" onsubmit={guardGoogleConsent}>`

### `src/routes/waitlist/+page.server.ts`

**`property join`**

- Honeypot: bots fill hidden fields, humans leave them empty

    ↳ `if (data.get('_hp')) return fail(422, { error: 'invalid' });`
- Rate limit: 5 submissions per minute per IP

    ↳ `const ip = getClientAddress();`

### `src/routes/waitlist/+page.svelte`

**`const extractLines`**

- ── Mock data

    ↳ `const extractLines = [`

**`const CH`**

- Compute chart bar positions in script so SVG can use plain numbers

    ↳ `const CH = 130, CPT = 14, CPB = 22, CVW = 400, padL = 28;`

**`markup`**

- Open Graph

    ↳ `<meta property="og:type"        content="website" />`
- Twitter / X Card

    ↳ `<meta name="twitter:card"        content="summary_large_image" />`
- Structured data

    ↳ `{@html '<script type="application/ld+json">${JSON.stringify({`
- ── Nav

    ↳ `<nav style="display:flex;align-items:center;gap:14px;padding:14px 32px;`
- ── Masthead

    ↳ `<div style="padding:10px 32px;border-bottom:1px solid var(--mep-divider);`
- ── Hero

    ↳ `<section style="padding:64px 32px 56px;">`
- Left rail

    ↳ `<div style="display:flex;flex-direction:column;gap:28px;padding-top:12px;">`
- Center: headline + form

    ↳ `<div>`
- Right: rotated extract preview

    ↳ `<div>`
- ── Integrations strip

    ↳ `<div style="padding:14px 32px;border-top:1px solid var(--mep-fg);border-bottom:1px soli…`
- ── Pain — Chapter I

    ↳ `<section style="padding:88px 32px 56px;">`
- ── How — Chapter II

    ↳ `<section style="padding:72px 32px;background:var(--mep-surface-2);`
- ── Product mock (replaces PNG screenshots) ──

    ↳ `<div>`
- Mock 01 · Capture: faux invoice + WhatsApp bubble

    ↳ `<div style="position:relative;width:100%;aspect-ratio:4/3;border-radius:16px;overflow:h…`
- Faux invoice paper

    ↳ `<div style="position:absolute;top:22px;left:22px;width:54%;height:78%;`
- WhatsApp bubble

    ↳ `<div style="position:absolute;right:28px;bottom:28px;width:46%;`
- Mock 02 · Extract: structured invoice table

    ↳ `<div class="card" style="width:100%;padding:0;overflow:hidden;display:flex;flex-directi…`
- Mock 03 · Dashboard: stacked bar chart + alert

    ↳ `<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:12px;">`
- SVG chart with pre-computed positions

    ↳ `<svg viewBox="0 0 {CVW} {svgH}" width="100%" style="display:block;overflow:visible;">`
- Alert row

    ↳ `<div style="display:flex;align-items:center;gap:10px;padding:9px 12px;`
- ── Testimonials — Chapter III

    ↳ `<section style="padding:88px 32px;">`
- ── Final CTA — inverted

    ↳ `<section style="padding:100px 32px;background:var(--mep-fg);color:var(--mep-bg);`
- ── Footer

    ↳ `<footer style="padding:20px 32px;display:flex;align-items:center;justify-content:space-…`

## Server core (DB, extraction, billing, jobs)

### `src/lib/server/admin.ts`

**`function isAdminUser`**

- Admin allowlist check — AUTH_ADMIN_EMAIL is a comma-separated list. Used by both the server hook (request-level guard for /admin) and the (admin) layout load, so the route group is protected even when layout loads don't rerun.

    ↳ `export function isAdminUser(user: User | null): boolean {`

### `src/lib/server/alert-engine.ts`

**`const LOW_STOCK_DAYS`**

- Active BI Engine — proactive alerts fired after each invoice save. runPriceShock: detects >15% unit price deviation vs last recorded price. runStockForecast: projects days-of-stock after purchase; alerts if < 3 days. runBudgetCheck: fires budget_overage when category monthly spend crosses threshold.

    ↳ `import { db, forTenant } from './db';`

**`function median`**

- Middle value of a numeric list (lower of the two middles on an even count).

    ↳ `function median(values: number[]): number {`

**`function collapseHistory`**

- Collapses up to the last `HISTORY_SIZE` price points for one key into a single comparison point: the median unit price, plus a median €/base price when every point in the window shares the same base unit (issue #308) — a single noisy purchase (a different pack size, a one-off promo, a seasonal blip) no longer reads as a shock against the very next delivery; a real, sustained price change still shows up on the first purchase after it happens, same as before.

    ↳ `function collapseHistory(points: PricePoint[]): PricePoint {`

**`function runPriceShock`**

- Match by the shared normalized key (issue #296): "TOMATE PERA" and "Tomate Pera" are the same product. mep_norm_key is the SQL twin of normalizeProductKey — both sides of the comparison use the same fold.

    ↳ `const itemKeys = [...new Set(lineItems.map(i => normalizeProductKey(i.description ?? ''…`
- Batch: the last PRICE_HISTORY_WINDOW price points per item key (not just the single latest one — issue #308), so the comparison point can be a median instead of one potentially-noisy purchase. Also pull the stored €/base (issue #299) so pack sizes can be compared apples-to-apples.

    ↳ `const priceRows = await db.execute<{ itemKey: string; unitPrice: number; normalizedUnit…`
- When lines are resolved to catalog products (issue #298), also fetch the latest price per product_id — differently-sized descriptions of one product ("saco 25kg" vs "saco 10kg") share a product but not a description key, and only this grouping (compared as €/base) makes them meet without a false shock.

    ↳ `const productPriceMap = new Map<number, PricePoint>();`
- Prefer the product-grouped history; fall back to same-description history.

    ↳ `const prev = (pid != null ? productPriceMap.get(pid) : undefined) ?? keyPriceMap.get(key);`
- Prefer €/base when both sides carry it for the same base unit — this is what stops "caja 5kg" vs "caja 10kg" of one product from reading as a ~92% shock. Otherwise compare the raw unit price as before.

    ↳ `const newPack = parsePack(description, item.unit);`

**`function runStockForecast`**

- Batch: one IN query for all stock levels, matched on the normalized key so "Harina 00" on the invoice updates a stock row saved as "harina 00".

    ↳ `const stockRows = await db`

**`function runCategorizationNudge`**

- Nudge the owner to categorise a supplier the first time one of its invoices is saved (issue #301). An uncategorised supplier's spend is lumped into the "Sin categoría" bucket: visible, but it can't be budgeted against or read as a real category — and nothing used to ask. One notification per supplier, ever: it is deduped on the supplier id, and the supplier only qualifies while it is still uncategorised.

    ↳ `export async function runCategorizationNudge(`
- Only on the supplier's first invoice — later ones would nag.

    ↳ `const [countRow] = await db`
- Belt and braces: if one was already raised for this supplier (a deleted first invoice, a re-save), don't raise a second.

    ↳ `const existing = await db`
- malformed payload — treat as no match

    ↳ `}`

**`property message`**

- The bell renders `messageKey` through i18n; `message` is the language-neutral fallback for non-UI consumers (chat context, admin).

    ↳ `message: 'supplier_uncategorized: ${supplier.name}',`

**`function runCategorySuggestion`**

- Offer a category for a supplier still sitting in the uncategorised bucket (issue #315).

    A supplier is tagged from extraction only when it is *created*, so one that was created before this existed — or whose first invoice was too sparse to classify — stays in the bucket forever, even once a later invoice gives the model plenty to go on. Rather than silently reclassify it (we cannot tell "never categorised" apart from a deliberate "leave this in Other"), this surfaces the guess and lets the owner accept it in one tap.

    One notification per supplier, ever — a suggestion on every invoice would be nagging. It supersedes the plain `supplier_uncategorized` nudge for the same supplier: naming a category is strictly more useful than asking for one, so the older nudge is cleared instead of stacking up next to it.

    ↳ `export async function runCategorySuggestion(`
- Nothing to offer: the resolver already collapsed an unusable guess (junk, translation, low confidence) into the bucket.

    ↳ `if (!proposedCategory || proposedCategory === UNCATEGORIZED_CATEGORY) return [];`
- Only for the bucket (or a legacy NULL). A supplier a human classified is never second-guessed.

    ↳ `if (supplier.category && supplier.category !== UNCATEGORIZED_CATEGORY) return [];`
- Deduped on the supplier id across both statuses, so a dismissed suggestion does not come back on the next invoice.

    ↳ `const existing = await db`
- malformed payload — treat as no match

    ↳ `}`
- Supersede the "please classify" nudge for this supplier.

    ↳ `await db`

**`property message`**

- The bell renders `messageKey` through i18n; `message` is the language-neutral fallback for non-UI consumers (chat context, admin).

    ↳ `message: 'supplier_category_suggested: ${supplier.name} -> ${proposedCategory}',`

**`function runBudgetCheck`**

- 1. Supplier category

    ↳ `const supplierRows = await db`
- Legacy suppliers (created before uncategorised became an explicit 'Other' bucket) still carry NULL. Treating that as "no budget applies" made all their spend invisible to budget alerts, silently — issue #301. It now falls into the same 'Other' bucket the spend query below already uses.

    ↳ `const category = supplierRows[0]?.category ?? UNCATEGORIZED_CATEGORY;`
- 2. Warning threshold (stored as 0-100 integer in settings, default 80)

    ↳ `const thresholdRows = await db`
- 3. Monthly budget for category (current month only)

    ↳ `const currentMonth = toMonthStr(new Date());`
- 4. This month's spend for category

    ↳ `const spendRows = await db`
- 5. Determine alert level

    ↳ `const level = pctFrac >= 1.0 ? 'exceeded' : pctFrac >= thresholdFrac ? 'warning' : null;`
- 6. Dedup: one alert per category+level per calendar month

    ↳ `const monthPrefix = new Date().toISOString().slice(0, 7);`

### `src/lib/server/auth-events.ts`

**`type AuthEventKind`**

- Auth telemetry (issue #256). Auth failure paths have no restaurantId, so they can't use trackEvent; this emits a structured console line plus a Sentry event so a credential-stuffing / brute-force wave or a broken auth config is visible instead of silent.

    Rules: counts, never credentials. The password is never passed here in any form, and emails are never logged in plaintext — a short salted-ish hash (hashIp / truncated identifier) is the most that's ever recorded.

    ↳ `import * as Sentry from '@sentry/sveltekit';`
- Password recovery (issue #284) — a spike in requests or failed resets is the same kind of signal as a login-failure wave.

    ↳ `| 'password_reset_requested'`

**`function hashIp`**

- Short, non-reversible fingerprint of an IP for correlating attempts without storing it.

    ↳ `export function hashIp(ip: string | null | undefined): string {`

**`function logAuthEvent`**

- Tagged Sentry event so alert rules can catch a spike; breadcrumb too for context on any error that follows in the same request.

    ↳ `Sentry.addBreadcrumb({ category: 'auth', level: 'warning', message: kind, data: meta });`

### `src/lib/server/auth-seed.ts`

**`function seedAdminUser`**

- Seeds the initial admin user and default restaurant on first startup. Requires AUTH_ADMIN_EMAIL, AUTH_ADMIN_PASSWORD, and AUTH_ADMIN_RESTAURANT_NAME. No-ops if the user already exists in Supabase Auth.

    ↳ `export async function seedAdminUser(): Promise<void> {`
- AUTH_ADMIN_EMAIL also gates /admin and receives password-reset mail, so a placeholder address means an admin account nobody can recover (issue #295).

    ↳ `if (/@example\.(com|org|net)$/i.test(email) && process.env['NODE_ENV'] === 'production') {`
- Skip if Supabase is unreachable (local dev without credentials). Doing a DNS check avoids the SDK's retry loop which generates unhandled promise rejections as a side effect even when the final error is caught.

    ↳ `const supabaseHost = new URL(env.SUPABASE_URL!).hostname;`
- Check if user already exists

    ↳ `const { data: existing, error: listError } = await supabase.auth.admin.listUsers();`
- Create the user in Supabase Auth

    ↳ `const { data: created, error } = await supabase.auth.admin.createUser({`
- Create default restaurant

    ↳ `const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g,…`
- Link user → restaurant

    ↳ `await db.insert(userRestaurants).values({`

### `src/lib/server/backfill.ts`

**`type Database`**

- Backfill product links + pack fields on existing invoice line items (follow-up to #298/#299). The catalog and pack features only populate on new saves; this applies them to history so analytics/price-shock have data.

    Deterministic only — reuses resolveLineProducts (exact alias, pg_trgm fuzzy, abbreviation dictionary) and parsePack. No LLM. Idempotent: re-running skips rows already linked / already priced.

    ↳ `import { sql } from 'drizzle-orm';`

**`function backfillPacks`**

- Compute pack fields + €/base for rows that don't have them yet.

    ↳ `async function backfillPacks(database: Database, restaurantId: string): Promise<number> {`

**`function backfillProductLinks`**

- Resolve + link products for line items that are still unlinked, per supplier.

    ↳ `async function backfillProductLinks(database: Database, restaurantId: string): Promise<…`
- Group descriptions by supplier so one resolve pass handles all their items.

    ↳ `const bySupplier = new Map<number, Array<{ description: string; unit: string | null }>>();`

### `src/lib/server/batch-core.ts`

**`type BatchDb`**

- Batch upload data layer — the single owner of batch_items state.

    Every status transition is a guarded UPDATE (`WHERE status IN (…)`) that reports whether it actually fired. Stale or duplicate requests therefore become no-ops instead of lost updates; callers never read-modify-write.

    Ownership: the web process calls createBatch/addItems/markQueued/ markConfirmed/markDiscarded/removeItem; the worker calls markExtracting/ markDone/markFailed. Neither side writes the other's transitions.

    Factory over an injected drizzle instance so tests can run the real SQL against the test database; `batch.ts` binds it to the app connection.

    ↳ `import { and, asc, eq, inArray, lt, ne, sql } from 'drizzle-orm';`
- Accepts a transaction too, so callers can run a guarded transition inside an enclosing db.transaction (e.g. invoice save + item confirm, issue #248).

    ↳ `export type BatchDb =`

**`const UUID_RE`**

- Route params land here unvalidated; a non-UUID (e.g. a legacy session id from an old link) would make Postgres throw on the uuid cast (22P02).

    ↳ `const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;`

**`function pickActiveItem`**

- The item a review UI should surface: the first reviewable (`done`) open item, else the first failed one. Returns null while everything open is still pending or in flight.

    ↳ `export function pickActiveItem(items: BatchItem[]): BatchItem | null {`

**`function addItems`**

- Appends items to an existing batch, continuing the position sequence.

    ↳ `async function addItems(`

**`function getBatchItems`**

- All items of a batch in position order (including confirmed/discarded).

    ↳ `async function getBatchItems(batchId: string): Promise<BatchItem[]> {`

**`function nextReviewableItem`**

- The next item still needing user attention (anything not confirmed or discarded), preferring items after `afterPosition`, then wrapping around.

    ↳ `async function nextReviewableItem(`

**`function removeItem`**

- Deletes an item outright — only allowed before extraction starts.

    ↳ `async function removeItem(itemId: string): Promise<BatchItem | null> {`

**`function deleteBatch`**

- items cascade

    ↳ `}`

**`function transition`**

- ── Guarded transitions

    ↳ `async function transition(`

**`function markQueued`**

- Web: pending/failed → queued (re-queueing a failed item is the retry path).

    ↳ `function markQueued(itemId: string): Promise<boolean> {`

**`function markExtracting`**

- Worker: queued → extracting.

    ↳ `function markExtracting(itemId: string): Promise<boolean> {`

**`function markDone`**

- Worker: extracting (or queued, if the extracting write raced) → done.

    ↳ `function markDone(`

**`function markFailed`**

- Worker: queued/extracting → failed.

    ↳ `function markFailed(itemId: string, extractError: string): Promise<boolean> {`

**`function markConfirmed`**

- Web: done → confirmed (the invoice was saved).

    ↳ `function markConfirmed(itemId: string): Promise<boolean> {`

**`function markDiscarded`**

- Web: any non-terminal state → discarded.

    ↳ `function markDiscarded(itemId: string): Promise<boolean> {`

**`function isBatchSettled`**

- True when no item in the batch still needs user attention.

    ↳ `async function isBatchSettled(batchId: string): Promise<boolean> {`

### `src/lib/server/batch.ts`

**_module level_**

- Batch data layer bound to the app DB connection. Implementation lives in batch-core.ts (DI factory) so the guarded SQL is testable against the test database; this module is the production binding.

    ↳ `import { db } from './db';`

### `src/lib/server/billing.ts`

**`const secretKey`**

- Stripe billing integration. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and per-tier STRIPE_PRICE_ID_* in env. Without STRIPE_SECRET_KEY the module is a no-op (safe for dev).

    ↳ `import Stripe from 'stripe';`

**`class WebhookSignatureError`**

- Thrown by handleWebhookEvent when the Stripe signature does not verify — an expected, un-retryable condition (400). Every other throw is a real handler failure the route must surface as 500 so Stripe retries and Sentry sees it (issue #253).

    ↳ `export class WebhookSignatureError extends Error {`

**`interface TierConfig`**

- ── Tier definitions

    ↳ `export interface TierConfig {`
- null = unlimited

    ↳ `stripePriceId: string;`
- How many restaurants one subscription covers (issue #290).

    ↳ `maxLocations: number;`

**`const TIERS`**

- Prices are managed in Stripe; these quotas + features define what each tier includes. Prices: Starter €49/mo · Pro €99/mo · Business €199/mo (or custom for chains).

    ↳ `export const TIERS: Record<PlanTier, TierConfig> = {`

**`property trial`**

- enough to evaluate; not enough to rely on for free

    ↳ `stripePriceId: '',`

**`property starter`**

- €49/mo — covers most small Spanish restaurants (~50-80 invoices/mo)

    ↳ `stripePriceId: env.STRIPE_PRICE_ID_STARTER ?? env.STRIPE_PRICE_ID ?? '',`

**`property pro`**

- €99/mo — active full-service restaurants

    ↳ `stripePriceId: env.STRIPE_PRICE_ID_PRO ?? '',`

**`property business`**

- €199/mo — unlimited, up to 5 locations

    ↳ `stripePriceId: env.STRIPE_PRICE_ID_BUSINESS ?? '',`

**`function isTierAvailable`**

- True when this tier has a Stripe price ID configured and can be checked out.

    ↳ `export function isTierAvailable(tier: PlanTier): boolean {`

**`function tierFromPriceId`**

- Map a Stripe price ID to its tier. Falls back to 'starter' for unknown/legacy price IDs — but never silently (issue #286): an unmatched price means either a missing STRIPE_PRICE_ID_* var or a price rotated in the Stripe dashboard, and the fallback would quota a €199/mo Business customer at 100 invoices. Log at error level and report to Sentry so the mismatch is visible immediately.

    ↳ `export function tierFromPriceId(priceId: string | null | undefined): PlanTier {`

**`function billingRestaurantId`**

- The restaurant whose subscription pays for `restaurantId` (issue #290).

    An additional location of a multi-location account carries `parent_id` and has no subscription of its own; plan, quota and features all resolve against the parent, so a Business customer's second site is not treated as a fresh trial. A standalone restaurant resolves to itself.

    ↳ `export async function billingRestaurantId(restaurantId: string): Promise<string> {`

**`const UNLIMITED_QUOTA_SETTING`**

- ── Monthly invoice quota

    One convention for "how many invoices may this tenant save this month", replacing the three that used to disagree (issue #295): the layout defaulted a missing settings row to 150, the upload gate read the same absence as unlimited, and unlimited tiers were stored as the magic number 99999.

    settings.plan_quota = 'unlimited' → no limit settings.plan_quota = <positive n> → n invoices per calendar month missing / unparseable / <= 0 → the tier's configured quota (TIERS[tier].monthlyInvoiceQuota, itself null for unlimited tiers)

    `null` means unlimited at every call site.

    ↳ `/** Value stored in settings.plan_quota for tiers with no invoice cap. */`
- Value stored in settings.plan_quota for tiers with no invoice cap.

    ↳ `export const UNLIMITED_QUOTA_SETTING = 'unlimited';`

**`const LEGACY_UNLIMITED_QUOTA`**

- Pre-#295 rows wrote this magic number instead of the sentinel.

    ↳ `const LEGACY_UNLIMITED_QUOTA = 99999;`

**`function resolveMonthlyQuota`**

- Resolve a stored plan_quota value against the tenant's tier. null = unlimited.

    ↳ `export function resolveMonthlyQuota(raw: string | null | undefined, tier: PlanTier): nu…`

**`function getMonthlyQuota`**

- Same convention, reading both the settings row and the tier from the DB.

    ↳ `export async function getMonthlyQuota(restaurantId: string): Promise<number | null> {`

**`function applyTierSettings`**

- Sync plan settings for a restaurant when their tier changes. Writes plan_name and plan_quota to the settings table so the layout server can serve them without an extra subscriptions join.

    ↳ `export async function applyTierSettings(restaurantId: string, tier: PlanTier): Promise<…`

**`function getTierFeatures`**

- Look up the tier features for a restaurant. Fast enough for use in API request handlers.

    ↳ `export async function getTierFeatures(restaurantId: string): Promise<TierConfig['featur…`

**`interface AccessState`**

- False once a trial has lapsed (or the subscription is past due/cancelled).

    ↳ `allowed: boolean;`
- True specifically for "the trial ran out", which gets its own copy.

    ↳ `trialExpired: boolean;`

**`function getAccessState`**

- Resolve whether a tenant may still consume paid capacity — uploads, extraction, AI chat (issue #287). Read access to existing data is never gated on this; only new spend is.

    A tenant with no subscription row at all is treated as allowed: that only happens for rows created outside onboarding, and locking those out would be worse than the alternative.

    ↳ `export async function getAccessState(restaurantId: string): Promise<AccessState> {`

**`function getOrCreateCustomer`**

- Get or create a Stripe customer ID for a restaurant.

    Serialized against itself (issue #239): two tabs clicking "checkout" concurrently must not both create a Stripe customer and orphan one. A per-restaurant advisory lock held for the length of the transaction makes the loser wait, re-read, and reuse the winner's customer id. The idempotency key on customers.create is a second guard against a proxy-level retry minting a duplicate customer.

    ↳ `export async function getOrCreateCustomer(restaurantId: string, email: string, restaura…`

**`function createCheckoutSession`**

- Create a Stripe Checkout session for a specific tier.

    ↳ `export async function createCheckoutSession(`
- Idempotency key (issue #239) — a proxy-level retry of this create must not mint a second Checkout session (and therefore a second subscription).

    ↳ `const session = await stripe.checkout.sessions.create({`

**`function cancelSubscription`**

- Cancel a Stripe subscription immediately. Idempotent and safe to retry: an already-cancelled or missing subscription is treated as success so account deletion (issue #246) never wedges on a stale id. No-op when Stripe isn't configured (dev).

    ↳ `export async function cancelSubscription(subscriptionId: string): Promise<void> {`
- resource_missing → already gone; nothing to cancel.

    ↳ `if (code === 'resource_missing') return;`

**`function createPortalSession`**

- Create a Stripe Customer Portal session to manage subscription.

    ↳ `export async function createPortalSession(customerId: string, returnUrl: string): Promi…`

**`function handleWebhookEvent`**

- Handle incoming Stripe webhook event.

    ↳ `export async function handleWebhookEvent(body: string, signature: string): Promise<void> {`
- In production an unverified webhook is a security hole: forged events could mutate subscription state. Fail loudly instead of silently accepting/ignoring. In dev we allow skipping for local testing.

    ↳ `if (process.env.NODE_ENV === 'production') {`
- Event-id dedup (issue #240). Stripe retries deliveries for up to 3 days; claim the id and bail on a replay so we don't re-send emails or re-fire telemetry. Runs before the switch so every event type is covered.

    ↳ `const claimed = await db.insert(stripeWebhookEvents)`
- Stripe event.created (seconds) — the ordering key for lifecycle events.

    ↳ `const eventCreatedAt = new Date(event.created * 1000);`
- Subscription-confirmation email (fire-and-forget, issue #202).

    ↳ `const customerEmail = session.customer_details?.email ?? session.customer_email;`
- Out-of-order protection (issue #240): a delayed updated(past_due) arriving after updated(active) must not revert a customer who just paid. Only apply when this event is at least as new as the last one we recorded. An empty RETURNING means the event was stale (or the row is gone) — skip the tier/telemetry side effects too.

    ↳ `const applied = await db.update(subscriptions)`
- Payment-lifecycle telemetry (issue #253) — a card going past_due or a customer cancelling was previously invisible.

    ↳ `if (event.type === 'customer.subscription.deleted' || sub.status === 'canceled') {`
- Processing failed — release the dedup claim so Stripe’s retry can reprocess this event instead of being suppressed as a duplicate, which would let payment state drift from Stripe (#240 + #253).

    ↳ `await db.delete(stripeWebhookEvents).where(eq(stripeWebhookEvents.eventId, event.id))`

### `src/lib/server/consent.ts`

**`const POLICY_VERSION`**

- T&C / Privacy Policy consent recording (GDPR, issue #201). Every sign-up path must leave a row in user_consents before the user starts using the product: email sign-ups at form submit, Google OAuth sign-ups at the auth callback (signup page) or at onboarding (login page).

    ↳ `import { eq } from 'drizzle-orm';`
- Bump when /terms or /privacy change materially; earlier acceptances stay recorded.

    ↳ `export const POLICY_VERSION = '2026-07';`

### `src/lib/server/db-ssl.ts`

**`interface PgSslConfig`**

- Postgres TLS configuration, shared by the web pool (`db.ts`, postgres-js) and the worker's pg-boss connection (`worker.ts`, node-postgres) — issue #295.

    Both drivers hand this object straight to `tls.connect`, so one helper can serve both and the two processes can no longer drift apart (the worker used to hard-code `rejectUnauthorized: false`).

    Modes, via `DATABASE_SSL_MODE`: require (default) — connection is encrypted, certificate is not verified. Matches Supabase's documented default and the behaviour this app shipped with. verify-full — certificate chain is verified. Supply the Supabase CA with `DATABASE_CA_CERT` (a PEM string or a path to a .crt file); without it the system trust store is used.

    Reads `process.env` directly so the worker can import it without Vite — process.env is equivalent to $env/dynamic/private under adapter-node.

    A local/ephemeral Postgres (CI service container, `docker compose` for local dev) is never configured with TLS, so requesting SSL against it just resets the connection ("Client network socket disconnected before secure TLS connection was established"). `drizzle.config.ts` and the test-db helper already special-case this by host; this does the same so the app's own db/worker clients agree with migrations and tests.

    ↳ `import { readFileSync } from 'node:fs';`

**`function readCa`**

- Resolve DATABASE_CA_CERT, which may hold the PEM itself or a path to it.

    ↳ `function readCa(value: string): string {`

### `src/lib/server/db.ts`

**`type DB`**

- DB singleton — server-side only. Import only from +server.ts or +page.server.ts, never from components.

    Set DATABASE_POOL_URL to a Supabase Session Mode / PgBouncer URL for the runtime app; DATABASE_URL remains the direct connection used by migrations and pg-boss. If DATABASE_POOL_URL is not set, DATABASE_URL is used for both. prepare: false is required for PgBouncer transaction-mode compatibility.

    ↳ `import { env } from '$env/dynamic/private';`

**`function getDb`**

- Lazily create the Drizzle client on first use. We intentionally do NOT connect at import time: SvelteKit's build/prerender-analyse step imports server modules without runtime env, and a throw here would break the build. The connection (and the missing-config error) is deferred to the first query.

    ↳ `function getDb(): DB {`

**`const db`**

- Proxy so existing `db.select(...)` call sites keep working while the underlying client is created lazily on first property access. Methods are bound to the real Drizzle instance so internal `this` references resolve against it (not the proxy).

    `getDb` is also exported directly (not just via the `db` proxy) for `src/lib/server/auth.ts`'s `DrizzleAdapter(getDb(), ...)` call. `@auth/drizzle-adapter` runtime-detects the Postgres dialect via drizzle-orm's `is(db, PgDatabase)`, an instanceof-style check against the object's prototype chain — the `db` proxy's target is `{}`, so its prototype is `Object.prototype`, not `PgDatabase`'s, and `is()` fails against it. This only surfaces at SvelteKit's production-build SSR analysis step (not `pnpm check`, not `pnpm test`), since that's the first point the adapter is actually constructed with a real env-configured secret.

    ↳ `export const db: DB = new Proxy({} as DB, {`

**_module level_**

- Tenant-scoped query helper — see ARCHITECTURE_DECISIONS.md ADR-001.

    ↳ `export { forTenant } from './tenant';`

### `src/lib/server/einvoice-parser.ts`

**`type EinvoiceFormat`**

- Structured e-invoice parser for Facturae 3.2.x and UBL 2.1 (EN 16931).

    When an XML invoice is uploaded the entire Gemini extraction step is skipped — the fields arrive structured with confidence 1.0.

    Supported formats: Facturae 3.2.2 — Spain national format (B2G via FACe, also B2B private) UBL 2.1 — EU standard (EN 16931, mandatory for Spain's SPFE public platform)

    ↳ `import { XMLParser } from 'fast-xml-parser';`

**`const parser`**

- keep attribute values as strings

    ↳ `parseTagValue: true,        // parse numeric element values`
- parse numeric element values 'Invoice' intentionally omitted: it's the UBL root element (always singular) and appears as a Facturae child only inside <Invoices> — handled by getArr().

    ↳ `isArray: (name) =>`

**`function getChild`**

- ── Generic helpers

    ↳ `function getChild(obj: unknown, ...keys: string[]): unknown {`

**`const FACTURAE_UNIT_CODES`**

- ── Facturae 3.2.x
- Facturae 3.2.x UnitOfMeasureType, complete per the official spec (issue #297): 01 Unidades, 02 Horas, 03 Kilogramos, 04 Litros, 05 Otros, 06 Cajas, 07 Bandejas, 08 Barriles, 09 Bidones, 10 Bolsas, 11 Bombonas, 12 Botellas, 13 Botes, 14 TetraBriks, 15 Centilitros, 16 Centímetros, 17 Cubetas, 18 Docenas, 19 Estuches, 20 Garrafas, 21 Gramos, 22 Kilómetros, 23 Latas, 24 Manojos, 25 Metros, 26 Milímetros, 27 Packs de 6, 28 Paquetes, 29 Raciones, 30 Rollos, 31 Sobres, 32 Tarrinas, 33 m³, 34 Segundos, 35 Vatios, 36 kWh. The previous map here ('02'→kg, '03'→L, …) did not match the spec and mislabeled units on every real Facturae invoice. null = no food-relevant canonical unit; leave the line unit empty rather than inventing one.

    ↳ `const FACTURAE_UNIT_CODES: Record<string, string | null> = {`

**`function parseFacturae322`**

- Root element may be prefixed (namespace removed) or plain 'Facturae'

    ↳ `const root = (doc['Facturae'] ?? Object.values(doc)[0]) as Record<string, unknown>;`

**`property unit`**

- Numeric spec code → canonical unit; some issuers put literal text ("kg") in UnitOfMeasure — canonicalizeUnit covers those. Unknown codes yield null (flagged for conversion) instead of a fake unit.

    ↳ `unit: (uom ? (FACTURAE_UNIT_CODES[uom] ?? canonicalizeUnit(uom)) : null),`

**`function parseFacturae322`**

- Facturae payment terms live in PaymentDetails, omit for Phase 1

    ↳ `total_amount: totalAmount,`

**`function parseUbl21Invoice`**

- ── UBL 2.1

    ↳ `export function parseUbl21Invoice(xml: string): ExtractedInvoice & { e_invoice_format: …`
- Spanish NIF can be in PartyTaxScheme/CompanyID or PartyLegalEntity/CompanyID

    ↳ `const nif =`

**`const line_items`**

- UN/ECE Rec 20/21 codes (KGM, LTR, C62, XBX…) → canonical unit via the shared synonym map (issue #297). Previously the raw code was passed through lowercased ("kgm"), which no consumer recognized, so every UBL line demanded a manual conversion rule. Unknown codes → null.

    ↳ `const unit = typeof unitCodeRaw === 'string' ? canonicalizeUnit(unitCodeRaw) : null;`

**`type ParsedEinvoice`**

- ── Public API

    ↳ `export type ParsedEinvoice = ExtractedInvoice & {`

**`function parseEinvoice`**

- Auto-detects XML format and delegates to the appropriate parser. Returns null if the XML is not a recognised e-invoice format.

    ↳ `export function parseEinvoice(xml: string): ParsedEinvoice | null {`

### `src/lib/server/email.ts`

**`const apiKey`**

- Transactional email via Resend. Set RESEND_API_KEY in the environment; if absent, emails are no-ops (dev mode). Copy is Spanish-first, matching the product's default locale (issue #202).

    ↳ `import { Resend } from 'resend';`

**`interface EmailPayload`**

- Coarse type for telemetry — tagged on Sentry, never the recipient (#257).

    ↳ `kind?: EmailKind;`

**`function maskEmail`**

- Mask an email for logs — keep the first char and domain (issue #254).

    ↳ `function maskEmail(to: string): string {`

**`function sendEmail`**

- A silent Resend failure means the owner never gets a welcome / subscription / digest / quota email — report it (tagged by type, not recipient) so a broken key or provider outage surfaces (#257).

    ↳ `console.error('[email] send failed:', error);`

**`function welcomeEmail`**

- ── Email templates

    ↳ `export function welcomeEmail(email: string, restaurantName?: string): EmailPayload {`

**`function trialExpiredEmail`**

- Sent the day the trial lapses (issue #287/#288). Uploads are blocked from this point, so the copy has to say what stopped working and what still does.

    ↳ `export function trialExpiredEmail(email: string, restaurantName: string): EmailPayload {`

### `src/lib/server/env-dynamic-shim.ts`

**`const env`**

- Standalone replacement for SvelteKit's `$env/dynamic/private`, used only by the worker bundle (see vite.worker.config.ts). Mirrors what adapter-node does at runtime: dynamic private env is just process.env.

    ↳ `export const env = process.env as Record<string, string | undefined>;`

### `src/lib/server/env.ts`

**`const UPLOADS_DIR`**

- process.env is equivalent to $env/dynamic/private at runtime with adapter-node, and allows this module to be imported from the worker process without Vite.

    ↳ `export const UPLOADS_DIR = process.env.UPLOADS_DIR ?? 'uploads';`

**`const STRIPE_PRICE_ID_STARTER`**

- Stripe price IDs per tier — set these in your Stripe dashboard and env.

    ↳ `export const STRIPE_PRICE_ID_STARTER  = process.env.STRIPE_PRICE_ID_STARTER  ?? '';`

**`const WHATSAPP_ACCESS_TOKEN`**

- ── WhatsApp Cloud API

    ↳ `export const WHATSAPP_ACCESS_TOKEN    = process.env.WHATSAPP_ACCESS_TOKEN    ?? '';`

**`const WHATSAPP_APP_SECRET`**

- App secret from Meta App Dashboard — used to verify X-Hub-Signature-256 on inbound webhook POSTs. Without it, the webhook cannot authenticate Meta.

    ↳ `export const WHATSAPP_APP_SECRET      = process.env.WHATSAPP_APP_SECRET      ?? '';`

**`const WHATSAPP_API_VERSION`**

- Graph API version used for every Cloud API call. Meta expires each version roughly two years after release and calls to an expired one fail outright, so this is env-tunable: bumping it must not require a code change (and the default must be reviewed at each upgrade). See DEPLOYMENT.md.

    ↳ `export const WHATSAPP_API_VERSION     = process.env.WHATSAPP_API_VERSION     ?? 'v25.0';`

**`const WHATSAPP_DISPLAY_NUMBER`**

- The bot's own number, in a dialable form — this is what staff must message, and nothing else in the config carries it: WHATSAPP_PHONE_NUMBER_ID is an opaque Meta id. Without it the app cannot tell anyone where to send invoices (issue #319). Any input format works; it is normalised on read.

    ↳ `export const WHATSAPP_DISPLAY_NUMBER  = process.env.WHATSAPP_DISPLAY_NUMBER  ?? '';`

### `src/lib/server/extract-batch.ts`

**`interface BatchEnqueueDeps`**

- Batch extraction enqueueing — marks every open item of a batch queued and sends one pg-boss job each, idempotently.

    Deps are injected (no module-level db/pg-boss import) so this logic is testable without infrastructure, mirroring the repo's pure-logic test style.

    ↳ `import type { BatchItem } from './batch-core';`
- Guarded pending/failed → queued; false when the item was not in those states.

    ↳ `markQueued(itemId: string): Promise<boolean>;`

**`function enqueueBatchExtraction`**

- Idempotent: items the worker already owns (extracting) or that are settled (done/confirmed/discarded) are left untouched. `queued` items are re-sent — the pg-boss singletonKey dedups — and a deduped send is never an error. `failed` items re-queue, which is the retry path.

    ↳ `export async function enqueueBatchExtraction(`

### `src/lib/server/extract.ts`

**`const EXTRACTION_PROMPT`**

- Invoice extraction — classifies a file, prepares input for the LLM, and returns structured invoice data. No DB access, no side effects.

    XML path (Facturae / UBL): structured parser is used directly; Gemini is skipped. Image / PDF path: Gemini vision or text extraction as before.

    ↳ `import { readFileSync } from 'node:fs';`

**`interface ExtractedInvoice`**

- Category the model proposes for this supplier (issue #315). Raw model output — never trusted as-is. Run it through `resolveSupplierCategory` before it reaches `suppliers.category`.

    ↳ `supplier_category?: string | null;`
- ── e-invoicing extensions (optional)

    ↳ `/** NIF extracted from structured XML (Facturae/UBL). */`
- NIF extracted from structured XML (Facturae/UBL).

    ↳ `supplier_nif?: string | null;`
- AEAT or TicketBAI QR verification URL decoded from the document image.

    ↳ `qr_url?: string | null;`
- True when QR-decoded fields conflict with AI-extracted fields.

    ↳ `qr_mismatch?: boolean;`
- Format of structured XML invoice, if parsed from XML rather than AI.

    ↳ `e_invoice_format?: 'facturae_322' | 'ubl_21' | null;`

**`type GenerateFn`**

- Abstracted generate function — decoupled from SDK so tests can inject a mock.

    ↳ `export type GenerateFn = (content: string | object[]) => Promise<string>;`

**`function classifyPdf`**

- Pull the text layer out of a PDF to decide whether Gemini gets the text or the page images. Uses unpdf (a maintained pdf.js build) rather than the unmaintained pdf-parse this used to call — see issue #225. Dynamic import so tests can mock it and so the pdf.js bundle is only loaded for real PDFs.

    ↳ `async function classifyPdf(filePath: string): Promise<ClassifiedFile> {`
- Malformed, encrypted or slow PDFs fall back to vision extraction.

    ↳ `return { type: 'scanned_pdf' };`

**`function callGemini`**

- Never embed the raw response — it's customer invoice content (supplier names, amounts, tax IDs) that would ship to logs/Sentry (issue #254).

    ↳ `throw new Error('Gemini returned invalid JSON (${raw.length} chars)');`

**`function extractInvoice`**

- Structured XML path — skip Gemini entirely, use deterministic parser.

    ↳ `if (classified.type === 'xml') {`

**`function callProvider`**

- ── Provider-based extraction (production path — returns token usage)

    ↳ `async function callProvider(`
- Never embed the raw response — it's customer invoice content (issue #254).

    ↳ `throw new Error('LLM returned invalid JSON (${raw.length} chars)');`

**`function extractWithProvider`**

- Structured XML path — no LLM tokens consumed.

    ↳ `if (classified.type === 'xml') {`

### `src/lib/server/extraction-worker.ts`

**`interface ExtractionJobData`**

- Extraction job handler — runs in the worker process. Claims the batch item via a guarded queued→extracting transition, calls Gemini, and writes the result with markDone/markFailed. The worker only ever touches the columns it owns; web-side state can never be lost here.

    ↳ `import path from 'node:path';`
- Legacy payload field — jobs enqueued before the batch_items migration.

    ↳ `sessionId?: string;`

**`const DEGRADATION_ERRORS`**

- Transient LLM-degradation classes worth alerting on when they spike.

    ↳ `const DEGRADATION_ERRORS = new Set([`

**`function processExtractionJob`**

- Money gate: atomically claim a monthly extraction slot against the plan quota BEFORE any Gemini spend (issue #244). Skipped in the test path.

    ↳ `let claimedMonthlySlot = false;`
- A lapsed trial must not spend on extraction, whichever door the file came in through — web upload, WhatsApp or a retry of an older job (issue #287). The web upload action blocks earlier with a redirect; this is the backstop that covers every path.

    ↳ `const access = await getAccessState(restaurantId);`
- Aggregate quota exhaustion (was a lone console.warn) so a tenant hitting the wall is visible, not only discovered from support (#257).

    ↳ `Sentry.captureMessage('extraction.quota_exhausted', {`
- Claim the item. A false here means it is no longer queued (discarded by the user, or already processed) — drop the job and release the slot we took, since no extraction happened.

    ↳ `const claimed = await markExtracting(itemId);`
- Resolve the file to a local path the extraction engine can read. For Supabase storage, download to a temp file; for local, compute the path directly.

    ↳ `let filePath: string;`
- ignore

    ↳ `} };`
- Test path — legacy GenerateFn, no token tracking.

    ↳ `const invoice = await extractInvoice(filePath, generateOverride);`
- Production path — LLMProvider with token usage tracking.

    ↳ `const { invoice, usage } = await extractWithProvider(filePath);`
- Tag Gemini degradation (timeout / 429 / 503) with its errorClass so an alert rule can catch a rate spike — "Gemini timing out for 2 hours" must not look like one flaky PDF (#257). Activates once the worker process initializes Sentry (#252); a no-op until then.

    ↳ `if (DEGRADATION_ERRORS.has(extractError)) {`
- Report every other failure too, so a worker failing every job is visible (#252) - but WITHOUT the raw error: extract.ts embeds invoice text in some messages and that must not reach Sentry (PII, #254). Ship only the error class + ids.

    ↳ `Sentry.captureException(new Error('extraction_failed:${extractError}'), {`
- A failed extraction shouldn't count against the plan quota — give the claimed slot back (issue #244).

    ↳ `if (claimedMonthlySlot) await releaseMonthlyExtraction(restaurantId);`
- Do not re-throw — the error is stored on the item; no pg-boss retry.

    ↳ `} finally {`

### `src/lib/server/idempotency.ts`

**`const UUID_RE`**

- Idempotency-key helper (issue #250). A generic layer on top of the DB uniqueness fixes: money-adjacent form actions render a hidden per-submit UUID and claim it here before mutating, turning any duplicate submit (double-click, offline-queue replay, proxy retry) into a transparent no-op.

    Claim inside the mutation's transaction where one exists, so a rolled-back save releases the key automatically. For a handled conflict that commits, call releaseRequest in the same transaction to free the key so a corrected resubmit isn't wrongly skipped.

    ↳ `import { db } from './db';`

**`function isValidKey`**

- True for a well-formed UUID key — anything else is ignored (feature is best-effort).

    ↳ `export function isValidKey(key: unknown): key is string {`

**`function claimRequest`**

- Atomically claims a request key. Returns true on the first claim, false when the key was already claimed (a replay). Runs on the passed executor so it can join an enclosing transaction.

    ↳ `export async function claimRequest(key: string, rid: string | null, exec: BatchDb = db)…`

**`function releaseRequest`**

- Releases a claimed key (e.g. a handled conflict that still commits).

    ↳ `export async function releaseRequest(key: string, exec: BatchDb = db): Promise<void> {`

**`function cleanupProcessedRequests`**

- Prunes claim rows older than 48h. Piggybacks on the stale-batch cleanup cadence.

    ↳ `export async function cleanupProcessedRequests(): Promise<void> {`

### `src/lib/server/invoice-save.ts`

**`type SaveOutcome`**

- Invoice save flow — shared by the extract review route and the batch page. Pure outcome-returning function: no redirects or HTTP concerns in here; callers translate the outcome into fail()/redirect().

    ↳ `import { computeInvoiceContentHash } from './dedup';`

**`function linkProductsToInvoice`**

- Resolve each saved line to a catalog product and stamp product_id onto the line items (issue #298). Fuzzy auto-links raise a `product_suggestion` notification the review UI can confirm/reject. Fully self-contained: swallows its own errors so it can never disturb the already-committed invoice.

    ↳ `async function linkProductsToInvoice(`
- Nothing deterministic matched — ask the LLM asynchronously whether this new product is really an existing one (issue #300). Best-effort.

    ↳ `await enqueueNormalize(rid, r.productId, desc).catch((e) =>`

**`function saveReviewedInvoice`**

- Validates and persists a reviewed invoice from the submitted form data. Does NOT transition the batch item on duplicates — callers decide what a duplicate means for the batch (discard + where to go next). On a successful save, `onSaved` runs inside the same transaction, so callers can commit the batch-item confirm atomically with the invoice insert (issue #248) — a crash between the two can no longer strand the item as reviewable.

    ↳ `export async function saveReviewedInvoice(`
- Idempotency key (issue #250) — claimed inside the save transaction below.

    ↳ `const idemKeyRaw = formData.get('idempotency_key');`
- Gate: block save if any header field is low-confidence and user hasn't acknowledged

    ↳ `const lowConfAck = formData.get('low_confidence_ack') === 'true';`
- Category proposed by extraction for a supplier we may be about to create (issue #315). Read from the stored extraction, never from the form: the category is a machine guess about the *supplier*, not something the user reviewed on this screen.

    It is dropped when the confirmed supplier name no longer matches the one the model categorised — correcting "Lácteos García" to "García Bebidas" during review means the guess was made about a different business, and applying it would tag the new supplier from the wrong document. `resolveSupplierCategory` maps anything unrecognised onto the bucket, so the worst case here is the pre-#315 behaviour plus a nudge.

    ↳ `const extracted = item?.extractedData as ExtractedInvoice | undefined;`
- Block 100%-exact content duplicates: compute a canonical hash of all user-confirmed fields and reject if a non-deleted invoice in this tenant already has the same hash.

    ↳ `const nonEmptyDescs = lineDescriptions.filter(d => d.trim());`

**`type LineInput`**

- Pre-compute unit resolutions outside the transaction (read-only DB calls)

    ↳ `type LineInput = {`

**`function saveReviewedInvoice`**

- Transactional save: supplier upsert + invoice insert + line items

    ↳ `let supplierId = 0;`
- Idempotency claim first — a replayed submit (double-click, offline replay) finds the key present and skips the whole save (issue #250).

    ↳ `if (idemKey && !(await claimRequest(idemKey, rid, tx))) {`
- Atomic supplier get-or-create — concurrent saves of a new supplier converge on one row instead of racing to insert clones (issue #238).

    ↳ `supplierId = await getOrCreateSupplierId(rid, supplierName, tx, proposedCategory);`
- Duplicate check; onConflictDoNothing below handles the race condition

    ↳ `if (invoiceNumber.trim()) {`
- Release the key so a corrected resubmit (fixed number) isn't skipped as a replay (issue #250).

    ↳ `if (idemKey) await releaseRequest(idemKey, tx);`
- Insert invoice — onConflictDoNothing guards against concurrent duplicate inserts

    ↳ `const insertedInvoice = await tx`
- Insert line items (unit rules pre-computed above)

    ↳ `for (let i = 0; i < lineInputs.length; i++) {`
- Pack structure (issue #299) — €/base for cross-size comparison.

    ↳ `const pack = parsePack(li.desc, li.unitVal);`
- Post-commit side effects are explicitly non-critical — the invoice is already persisted, so a failure here must not 500 the action and make a saved invoice look unsaved (issue #248).

    ↳ `let isFirstInvoice = false;`
- Link line items to catalog products first (issue #298) so price-shock can group by product_id and compare pack sizes as €/base (issue #299). Post-commit and best-effort: an enrichment, never a reason to fail a save.

    ↳ `const productByKey = await linkProductsToInvoice(invoiceId!, supplierId, rid, lineInputs);`
- A supplier already sitting in the bucket — created before extraction proposed categories, or from an invoice too sparse to classify — gets the guess offered rather than applied (issue #315). Returns nothing when the supplier was just tagged at creation, so a new supplier does not get asked about a category it already has.

    ↳ `const categorySuggestions = await runCategorySuggestion(supplierId, rid, proposedCatego…`
- Fire-and-forget: warn the owner when monthly usage nears the plan quota.

    ↳ `void maybeSendQuotaWarning(rid);`
- Log field corrections (original AI values vs user-submitted values)

    ↳ `await logExtractionCorrections(`
- Mark onboarding complete on first invoice save

    ↳ `const onboardingRows = await db`

### `src/lib/server/invoice-status.ts`

**`type InvoiceStatus`**

- Guarded invoice status transitions (issue #243).

    Same pattern as batch-core.ts: every status mutation is an `UPDATE … WHERE status IN (from)` that reports whether it actually fired, so a stale tab or a double-submit becomes a no-op instead of a lost update or a contradiction between `status` and the RD 238/2026 timestamps (accepted_at / rejected_at / paid_at).

    Allowed transitions: pending → accepted | rejected | paid accepted → paid paid → pending (markUnpaid — resets the timestamps)

    ↳ `import { and, eq, inArray } from 'drizzle-orm';`

**`function markInvoicePaid`**

- pending/accepted → paid, recording the payment date.

    ↳ `export function markInvoicePaid(id: number, rid: string): Promise<boolean> {`

**`function markInvoiceUnpaid`**

- paid → pending, clearing the now-stale payment/acceptance timestamps.

    ↳ `export function markInvoiceUnpaid(id: number, rid: string): Promise<boolean> {`

**`function acceptInvoice`**

- pending → accepted (RD 238/2026 acceptance).

    ↳ `export function acceptInvoice(id: number, rid: string): Promise<boolean> {`

**`function rejectInvoice`**

- pending → rejected (RD 238/2026 rejection).

    ↳ `export function rejectInvoice(id: number, rid: string): Promise<boolean> {`

**`function markInvoicesPaidBulk`**

- Bulk pending/accepted → paid. Returns how many rows actually transitioned.

    ↳ `export async function markInvoicesPaidBulk(ids: number[], rid: string): Promise<number> {`

### `src/lib/server/llm-provider.ts`

**`interface LLMUsage`**

- Swappable LLM provider abstraction. Production code uses createLLMProvider(); tests inject a mock via extractInvoice's generateOverride.

    ↳ `import { GoogleGenAI } from '@google/genai';`

**`const COST_PER_MILLION`**

- Pricing per million tokens (USD) — verify against https://ai.google.dev/gemini-api/docs/pricing

    ↳ `const COST_PER_MILLION: Record<string, { input: number; output: number }> = {`

### `src/lib/server/llm-quota.ts`

**`function currentMonth`**

- Per-tenant LLM cost quota enforcement and usage logging.

    quota rows are optional — if no row exists for a tenant the tenant is treated as unlimited. Checks are advisory (best-effort) and never block the extraction path on DB errors.

    ↳ `import { and, eq, gte, sql } from 'drizzle-orm';`
- YYYY-MM

    ↳ `}`

**`function planQuotaLimit`**

- Reads the tenant's plan invoice quota. null = unlimited. Shared convention lives in billing.getMonthlyQuota (issue #295).

    ↳ `async function planQuotaLimit(restaurantId: string): Promise<number | null> {`

**`function claimMonthlyExtraction`**

- Atomically claims one monthly extraction slot against the tenant's plan quota (issue #244). A single INSERT … ON CONFLICT DO UPDATE … WHERE used < limit RETURNING is race-safe: concurrent uploads serialise on the row, and only those under the cap get a row back. Empty return → quota exhausted, before any Gemini spend. No configured limit → always claimed.

    ↳ `export async function claimMonthlyExtraction(restaurantId: string): Promise<ClaimResult> {`
- Seed at 1 on first insert; on conflict bump only while under the cap.

    ↳ `const rows = await db.insert(monthlyUsage)`

**`function releaseMonthlyExtraction`**

- Releases a previously claimed slot (extraction failed and shouldn't count against the quota). Never drops below zero. Best-effort — a lost decrement is self-correcting at month rollover.

    ↳ `export async function releaseMonthlyExtraction(restaurantId: string): Promise<void> {`

### `src/lib/server/normalize.ts`

**`function normalizeProductKey`**

- Shared product/unit normalization (issue #296).

    normalizeProductKey is the single TS-side definition of "same product": lowercase, accent-folded, whitespace-collapsed. It MUST stay in lockstep with the SQL function mep_norm_key (drizzle/0018_product_key_normalization.sql), which is the same transform expressed in Postgres and used by the materialized views and cross-invoice matching queries.

    canonicalizeUnit folds the many ways Spanish suppliers (and e-invoice standards) write a unit into one canonical spelling — "Kgs", "KILO" and UN/ECE "KGM" all resolve to "kg". Unknown units return null so callers can flag requiresUnitConversion instead of treating a mystery token as a unit.

    Pure module — no DB imports, safe for the worker and for unit tests.

    ↳ `export function normalizeProductKey(raw: string): string {`

**`const UNIT_GROUPS`**

- canonical spelling → accepted variants (variants are matched after normalizeProductKey + trailing-dot strip, so list them lowercase/unaccented). UN/ECE Rec 20/21 codes (UBL unitCode) are folded in directly: KGM, LTR, C62…

    ↳ `const UNIT_GROUPS: Record<string, string[]> = {`

**`function canonicalizeUnit`**

- Resolve any spelling of a unit to its canonical form, or null when the token is not a recognized unit (→ caller flags requiresUnitConversion). "media caja", "garrafa 5L" and similar sized-container formats are deliberately NOT mapped: they need a conversion factor, not a pass-through.

    ↳ `export function canonicalizeUnit(raw: string | null | undefined): string | null {`

### `src/lib/server/notifications.ts`

**`function saveAlerts`**

- Notifications service — persists alert objects to system_notifications.

    ↳ `import { db } from './db';`

### `src/lib/server/products.ts`

- Consolidated product/unit resolution (issue #351). Merges what used to be six shallow files — `pack-parser.ts`, `product-catalog.ts`, `product-dictionary.ts`, `product-normalizer.ts`, `unit-bridge-pure.ts`, `unit-bridge.ts` — into one deep module: they all implement the same concern (resolving a raw invoice line item into a canonical product + unit) and were never used independently of each other. Pure-computation exports (`parsePack`, `normalizedUnitPrice`, `expandAbbreviations`, `conversionKey`, `resolveUnitFromMap`, prompt/response parsing) stay exported alongside the DB-backed orchestration because the existing unit-test suite exercises them directly; no behavior, schema, or public export changed in the merge.

**Pack/format parsing** (was `pack-parser.ts`)

- Deterministic pack/format parser (issue #299, Phase 3). Extracts pack structure from the free-text description (and, as a fallback, the unit column) of an invoice line — "6x1L", "Garrafa 5L", "caja 12 ud", "500 g", "botella 75 cl" — so a €/kg-L-ud price can be derived and compared across different pack sizes. Container units carry no intrinsic size, so a bare "caja" with no number anywhere yields null (→ no normalized price).
- `SIZE_TO_BASE`: canonical size token → base dimension unit + multiplier to that base.
- `num`: Spanish decimals use a comma; treat comma as the decimal separator.
- `MULTIPACK` / `SINGLE` / `COUNT`: the three shapes tried in order — "6x1L" explicit sub-size, "Garrafa 5L" single size token (scans all matches, takes the first with a real unit so "Aceite 5L caja" picks "5L" not a stray number), "caja 12 ud" a bare count of pieces.
- `normalizedUnitPrice`: €/base-unit for a line, i.e. unit_price divided by the pack's base content. "Garrafa 5L" at 12.50 → 2.50 €/L. Null when price or pack is missing.

**Product catalog resolution** (was `product-catalog.ts`)

- Maps each invoice line's raw description to a per-tenant product, so downstream features can group on a stable product_id instead of the exact string a supplier happened to print (issue #298, Phase 2). Resolution per unique normalized key (mep_norm_key / normalizeProductKey): 1) confirmed alias with the same raw_key → link (status 'exact'); 2) pg_trgm-similar existing product ≥ `FUZZY_THRESHOLD` → link + pending 'fuzzy' alias (status 'fuzzy'); 3) otherwise → create product + confirmed 'exact' alias (status 'created'). A line is therefore always linked to some product; the fuzzy case additionally records a suggestion the review UI can confirm or reject. Runs inside the save transaction so the products/aliases and the line_items.product_id commit atomically with the invoice.
- `FUZZY_THRESHOLD` (0.42): trigram similarity above which two product names are treated as "probably the same product, ask the user" — conservative on purpose. Tunable; keep in sync with tests.
- `resolveLineProducts`: de-dups by normalized key so a repeated description resolves once, then maps every raw line spelling that shares a key to the same result.
- `resolveOne` fuzzy step also tries the dictionary-expanded key (issue #300) so "TERN. AGUJA" / "REF.1042 Merluza" meet "ternera aguja" / "merluza" without the LLM; `GREATEST` takes the better of the raw and expanded similarity.
- `unlinkSupplier`: drops that supplier's product_aliases row(s) for the product and nulls out product_id on that supplier's invoice_line_items; other suppliers' rows are untouched.
- `deleteProduct`: blocked (not cascaded) while any invoice_line_items or product_aliases still reference it — the caller's UI resolves this via `unlinkSupplier()` per supplier, then retries.
- `resolveUnitConversionAlerts`: marks pending 'unit_conversion_needed' notifications resolved once a product's unitsPerPack/baseUnit are filled in via the Products CRUD page; matches by normalized key against the product's own name or any alias's raw text, since the alert payload only carries the raw invoice description.
- `confirmProductAlias` / `rejectProductAlias` / `mergeIntoProduct`: user-facing decisions on a pending fuzzy/LLM suggestion — keep the auto-link, split into a new product and repoint fuzzy-linked line items, or merge into an existing `targetProductId` and delete the throwaway product if nothing else references it.

**Abbreviation dictionary** (was `product-dictionary.ts`)

- Static Spanish food-trade dictionary (issue #300, Phase 4). Cheap, deterministic pre-processing so common cases never reach the LLM: strip leading SKU/reference codes ("REF.1042 TOMATE PERA" → "TOMATE PERA"), expand high-frequency abbreviations ("TERN. AGUJA" → "ternera aguja", "S/H" → "sin hueso"). `expandAbbreviations` returns a cleaned display string; callers still run it through `normalizeProductKey` for matching.
- `SKU_PREFIX` requires a digit in the code part so plain words starting with those letters ("REFRESCO", "ARTESANO") are never stripped. `BARE_CODE` only strips 4+ digit leading codes — 3 or fewer is usually a size ("500 g").
- `ABBREVIATIONS` is matched whole-token, case-insensitively; slash tokens like "s/h" are kept literal. Conservative on purpose: abbreviations only, no risky cross-product synonyms.

**LLM-assisted normalization** (was `product-normalizer.ts`)

- Runs asynchronously (pg-boss) for lines that the deterministic layers — exact alias, pg_trgm fuzzy, and the abbreviation dictionary — could not match to an existing product, so a brand-new product was created (issue #300, Phase 4). Gemini is asked whether that description is really one of the tenant's existing products (slang, abbreviations, SKU noise the regex layers miss). A high-confidence match (`LLM_MATCH_THRESHOLD` = 0.8) becomes a PENDING product_suggestion the user confirms — never a silent merge. Cost is metered through llm-quota (callerContext 'normalize'). `buildNormalizePrompt`/`parseNormalizeResponse` are pure and unit-tested; the LLM provider is injectable via `NormalizeDeps`.
- `processNormalizeJob` is best-effort: any failure (LLM error, quota, parse) is swallowed — a missed suggestion must never break the worker or the invoice. Deduped against an existing pending suggestion for the same normalized description.

**Unit-bridge** (was `unit-bridge.ts` / `unit-bridge-pure.ts`)

- Resolves purchase units (invoices) to canonical units against `unit_conversions` and annotates line items in place. Matching is normalized (issue #296): rules are keyed by `normalizeProductKey(ingredient)` + `normalizeProductKey(unit)`, via `conversionKey`, so casing/accent/spacing differences between invoices don't miss rules.
- `loadConversionMap`: rules per supplier are few, so fetching them all and matching in memory is what lets the lookup be normalization-aware without a normalized column in the table. When `supplierId` is known, matches rules pinned by FK or pre-supplier name-only rules.
- `resolveUnitFromMap`: falls through to any recognized spelling of a canonical unit ("Kgs", "KILO", UN/ECE "KGM" → kg) with factor 1 when no tenant rule exists.

### `src/lib/server/qr-svg.ts`

**`const ERROR_CORRECTION`**

- QR code rendering (issue #319).

    Distinct from `qr.ts`, which *parses* the VERI*FACTU / TicketBAI QR codes found on supplier invoices. This module goes the other way: it renders a string we want a phone to scan.

    Output is an inline `<svg>` element rather than a data-URI image, so it stays crisp when printed — the practical delivery mechanism for the WhatsApp bot number is a sheet of paper stuck to the kitchen wall — and needs no `img-src` allowance in the CSP.

    ↳ `import qrcode from 'qrcode-generator';`
- 'M' (~15% recovery) is the usual choice for a printed code: enough tolerance for a scuffed or greasy print without inflating the module count, which is what actually decides how large the paper version has to be.

    ↳ `const ERROR_CORRECTION = 'M';`

**`function renderQrSvg`**

- Render `text` as a scalable inline SVG QR code.

    The SVG carries a viewBox and no fixed width/height, so the caller sizes it with CSS. Returns null if the string cannot be encoded (too long for the largest symbol) — callers treat the QR as an enhancement and drop it rather than failing the page around it.

    ↳ `export function renderQrSvg(text: string): string | null {`
- Type 0 = pick the smallest symbol version that fits the data.

    ↳ `const qr = qrcode(0, ERROR_CORRECTION);`

### `src/lib/server/qr.ts`

**`interface AeatVerifactuQrData`**

- VERI*FACTU / TicketBAI QR code parsing and field verification.

    AEAT VERI*FACTU QR URL format (Orden HAC/1177/2024): https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR?nif=X&numserie=Y&fecha=DD-MM-AAAA&importe=N.NN https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu (same params, non-verified path)

    TicketBAI (Basque Country) QR formats by territory: Bizkaia: https://batuz.eus/QRTBAI/?id=... Gipuzkoa: https://tbai.gipuzkoa.eus/qr/?id=... Araba: https://www.araba.eus/tbai/qr?id=...

    ↳ `export interface AeatVerifactuQrData {`
- Supplier NIF

    ↳ `numserie: string; // Invoice number / series+number`
- Invoice number / series+number

    ↳ `fecha: string;    // Issue date in DD-MM-AAAA format`
- Issue date in DD-MM-AAAA format

    ↳ `importe: string;  // Total amount (decimal, e.g. "1250.00")`
- Total amount (decimal, e.g. "1250.00")

    ↳ `}`

**`function parseQrUrl`**

- Parses a decoded QR string from an invoice into structured data. Returns null if the URL is not a recognised Spanish e-invoice verification URL.

    ↳ `export function parseQrUrl(rawUrl: string): QrParseResult {`

**`function qrFechaToIso`**

- Converts AEAT QR fecha (DD-MM-AAAA) to ISO date (YYYY-MM-DD). Returns null if the format is not recognised.

    ↳ `export function qrFechaToIso(fecha: string): string | null {`

**`function isoToQrFecha`**

- Converts ISO date (YYYY-MM-DD) to AEAT QR fecha (DD-MM-AAAA).

    ↳ `export function isoToQrFecha(iso: string): string | null {`

**`function detectVerifactuMismatch`**

- Detects mismatches between VERI*FACTU QR-verified fields and AI-extracted fields. Only checks VERI*FACTU QR results — TicketBAI encodes an opaque ID, not raw fields.

    ↳ `export function detectVerifactuMismatch(`
- YYYY-MM-DD

    ↳ `total_amount?: number | null;`

**`function buildAeatVerificationUrl`**

- Returns the AEAT verification URL from a parsed QR result. This is the "Verificar en AEAT" deep link shown on the invoice detail page.

    ↳ `export function buildAeatVerificationUrl(qrResult: QrParseResult): string | null {`

### `src/lib/server/queue.ts`

**`const EXTRACTION_QUEUE`**

- pg-boss queue — web-process side (send-only). Lazy singleton: starts once on first use.

    ↳ `import { PgBoss } from 'pg-boss';`

**`function getBoss`**

- pg-boss v10+ no longer auto-creates queues; send() requires the queue to exist first. createQueue is idempotent.

    ↳ `await b.createQueue(EXTRACTION_QUEUE);`

**`function enqueueExtraction`**

- Returns true if the job was enqueued, false if a job for the same item is already pending/active (pg-boss singletonKey dedup). A deduped send is expected on duplicate submits and must never be treated as a failure.

    ↳ `export async function enqueueExtraction(`

**`function enqueueNormalize`**

- Low-priority async LLM normalization for a freshly-created product (issue #300). Deduped per (restaurant, product) so re-saves don't pile up jobs.

    ↳ `export async function enqueueNormalize(`

### `src/lib/server/quota-warning.ts`

**`const QUOTA_WARNING_THRESHOLD`**

- "Cuota próxima a agotarse" alert (issue #202): when a restaurant's monthly invoice usage crosses QUOTA_WARNING_THRESHOLD of its plan quota, email the owner once per calendar month. Called fire-and-forget after invoice saves — must never throw into the save path.

    ↳ `import { and, eq, isNull, sql } from 'drizzle-orm';`

**`function maybeSendQuotaWarning`**

- YYYY-MM
- Shared quota convention (issue #295) — null means unlimited, and an unlimited plan can never approach its cap.

    ↳ `const limit = await getMonthlyQuota(restaurantId);`
- Send at most once per month per restaurant. Claim the month flag BEFORE sending (guarded upsert, issue #249) — two concurrent invoice saves at the threshold would otherwise both pass a read-then-send check and email the owner twice.

    ↳ `const claimed = await db.insert(settings)`

### `src/lib/server/rate-limiter.ts`

**`type UpstashLimiter`**

- Rate limiter — uses Upstash Redis when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set (distributed / multi-instance safe), otherwise falls back to an in-process token bucket (single-server only — documented constraint).

    ↳ `import { UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN } from '$lib/server/env';`
- ── Upstash path

    ↳ `type UpstashLimiter = { limit(key: string): Promise<{ success: boolean }> };`

**`interface Bucket`**

- ── In-memory fallback

    ↳ `interface Bucket { tokens: number; lastRefill: number; ttlMs: number }`

**`function checkInMemory`**

- Evict on the bucket's own window, not a fixed two minutes: a long cooldown (the WhatsApp unauthorised-sender reply uses hours) would otherwise be swept away and silently reset to "allowed".

    ↳ `if (bucket.lastRefill < now - bucket.ttlMs) buckets.delete(key);`

**`function checkRateLimit`**

- ── Public API

    ↳ `/**`
- Allow at most `max` events per `windowSeconds` for `key`.

    The window defaults to a minute — every caller predating issue #322 is a per-minute budget. Longer windows exist for cooldowns rather than throughput caps: "reply to this unknown number at most once every six hours" is one event per 21 600 s, not a fractional per-minute rate.

    ↳ `export async function checkRateLimit(`

**`const activeExtractions`**

- ── Extraction concurrency semaphore NOTE: this counter is in-process and therefore SINGLE-INSTANCE ONLY. With multiple worker processes the effective concurrency against Gemini is (process count × max). A distributed semaphore (e.g. Upstash Redis) would be required to enforce a global cap across instances.

    ↳ `let activeExtractions = 0;`

### `src/lib/server/safe-redirect.ts`

**`function safeRedirect`**

- Validates a redirect target is a same-origin relative path. Rejects absolute URLs, protocol-relative URLs (//), and backslash variants.

    ↳ `export function safeRedirect(target: string | null | undefined, fallback = '/'): string {`

### `src/lib/server/scheduler.ts`

**`const DIGEST_QUEUE`**

- Scheduled jobs (issue #288).

    Everything here used to depend on somebody opening the app: the weekly digest was generated on a dashboard visit, and the overdue-invoice and trial-expiry templates had no callers at all — which is backwards, because those messages exist precisely for tenants who *stopped* opening the app.

    pg-boss (already in the stack for extraction) provides the cron. The worker process registers these on boot; if the worker is not running, none of them fire — same contract as invoice extraction.

    Every job is tenant-by-tenant best-effort: one restaurant's failure is logged and the loop continues, so a single bad tenant can't stop the run. Each send is claimed through a guarded upsert on `settings` before the email goes out, so a retried job (or a second worker) cannot double-send.

    ↳ `import type { PgBoss } from 'pg-boss';`

**`const DIGEST_CRON`**

- Cron expressions are UTC. Spanish restaurants are UTC+1/+2, so 06:00 UTC lands early morning locally.

    ↳ `const DIGEST_CRON = '0 6 * * 1';    // Mondays, with the week just closed`

**`const REMINDERS_CRON`**

- Mondays, with the week just closed

    ↳ `const REMINDERS_CRON = '30 6 * * *'; // daily`

**`const TRIAL_CRON`**

- daily

    ↳ `const TRIAL_CRON = '0 7 * * *';      // daily`

**`const PURGE_CRON`**

- daily

    ↳ `const PURGE_CRON = '0 3 * * *';      // daily, off-peak`

**`const DELETED_FILE_RETENTION_DAYS`**

- daily, off-peak

    ↳ `/** Days a soft-deleted invoice keeps its uploaded file before it is purged. */`
- Days a soft-deleted invoice keeps its uploaded file before it is purged.

    ↳ `export const DELETED_FILE_RETENTION_DAYS = 30;`

**`const TRIAL_MILESTONES`**

- Trial milestones (days remaining) that get an email. 0 = the day it lapsed.

    ↳ `const TRIAL_MILESTONES = [7, 1, 0] as const;`

**`function claimOnce`**

- ── Shared helpers

    ↳ `/**`
- Claim a one-shot send for this tenant. Returns false when the value was already stored, which is what makes every job in this file safe to retry.

    ↳ `async function claimOnce(restaurantId: string, key: string, value: string): Promise<boo…`

**`function ownerEmail`**

- Owner's email address, or null when the restaurant has no reachable owner.

    ↳ `async function ownerEmail(restaurantId: string): Promise<string | null> {`

**`function allTenants`**

- Every tenant with its plan tier, trial end and name — one query per job run.

    ↳ `async function allTenants(): Promise<Array<{`

**`const rows`**

- Join order avoids the `eq(*.restaurantId, …)` shape the tenant-scope lint bans; this is a deliberate all-tenant scan, not a tenant filter.

    ↳ `.leftJoin(subscriptions, eq(restaurants.id, subscriptions.restaurantId));`

**`function today`**

- YYYY-MM-DD

    ↳ `}`

**`function runWeeklyDigestJob`**

- ── Jobs

    ↳ `/**`
- Weekly digest: generate this week's text (the same claim-then-generate path the dashboard uses, so a Monday visitor and this job never both pay Gemini) and email it to the owner. Only tiers whose plan includes the digest.

    ↳ `export async function runWeeklyDigestJob(): Promise<{ considered: number; sent: number …`
- Claim after generating: a generation failure should not consume the week's email slot.

    ↳ `if (!(await claimOnce(tenant.id, 'weekly_digest_email_week', week))) return false;`

**`function runOverdueRemindersJob`**

- Overdue invoices: one email per tenant per day, only when something is actually overdue.

    ↳ `export async function runOverdueRemindersJob(): Promise<{ considered: number; sent: num…`

**`function trialDaysLeft`**

- Days remaining in a trial, rounded up. Negative once it has lapsed.

    ↳ `export function trialDaysLeft(trialEndsAt: Date, now: Date = new Date()): number {`

**`function trialMilestoneFor`**

- Which milestone a remaining-days count falls into, or null when the trial is still too far out to be worth an email. The bands are deliberately wide so a missed run (worker restart, outage) still sends the notice a day late instead of skipping it: 7 covers 7…2 days out, 1 the final day, 0 the lapse.

    ↳ `export function trialMilestoneFor(daysLeft: number): number | null {`

**`function runTrialNoticesJob`**

- Trial expiry notices at T-7, T-1 and on the day the trial lapses. The milestone is stored, so moving between milestones sends exactly one email each and a re-run sends none.

    ↳ `export async function runTrialNoticesJob(): Promise<{ considered: number; sent: number …`
- Keyed on the trial end date too, so a tenant that starts a fresh trial gets the full sequence again instead of matching the old value.

    ↳ `const claim = '${tenant.trialEndsAt!.toISOString().slice(0, 10)}:${milestone}';`

**`function runFilePurgeJob`**

- Retention purge (issue #289): a soft-deleted invoice keeps its uploaded file for DELETED_FILE_RETENTION_DAYS so a mistaken delete can be undone, then the file — supplier PII and financial data — is removed from storage and the row stops pointing at it. The row itself stays for the audit log.

    ↳ `export async function runFilePurgeJob(): Promise<{ purged: number; failed: number }> {`

**`interface ScheduledJob`**

- ── Registration

    ↳ `interface ScheduledJob {`

**`function registerScheduledJobs`**

- Create the queues, register the cron schedules and start the consumers. `schedule()` is idempotent per queue: re-registering on every worker boot updates the cron rather than stacking duplicates, and pg-boss holds the schedule in the database so exactly one worker fires each occurrence.

    ↳ `export async function registerScheduledJobs(boss: PgBoss): Promise<void> {`

### `src/lib/server/schema.ts`

**`const restaurants`**

- Drizzle schema — PostgreSQL (Supabase). Single source of truth.

    ↳ `import {`
- ── Multi-tenant core

    ↳ `export const restaurants = pgTable('restaurants', {`

**`property parentId`**

- Additional locations of a multi-location account (issue #290). Null for a standalone restaurant. Data stays fully separate per location — this only says which restaurant's subscription pays for this one, so a Business customer's second site inherits the plan instead of starting a new trial.

    ↳ `parentId:  uuid('parent_id').references((): AnyPgColumn => restaurants.id, { onDelete: …`

**`const userRestaurants`**

- 'owner' | 'member'

    ↳ `createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),`
- Composite PK — a double-submit of onboarding (or the same form in two tabs) can no longer write duplicate membership rows, which also kept the "sole member" count in account deletion honest (issue #241).

    ↳ `primaryKey({ columns: [t.userId, t.restaurantId] }),`

**`const suppliers`**

- ── Business tables (all scoped to restaurant_id)

    ↳ `export const suppliers = pgTable('suppliers', {`
- One supplier name per tenant, case-insensitive. The three get-or-create call sites now upsert via ON CONFLICT (restaurant_id, lower(name)), so concurrent saves of a new supplier converge on one row instead of racing to insert clones that would split invoice-number dedup (issue #238).

    ↳ `uniqueIndex('uq_suppliers_rid_name').on(t.restaurantId, sql'lower(${t.name})'),`

**`property status`**

- ── status: 'pending' | 'accepted' | 'rejected' | 'paid' 'pending' = received, awaiting acceptance (legacy behaviour preserved). 'accepted' | 'rejected': RD 238/2026 acceptance statuses. 'paid': full effective payment reported.

    ↳ `status:          text('status').default('pending'),`

**`property eInvoiceFormat`**

- ── e-invoicing extensions (issue #110, #111, #112)

    ↳ `/** Parsed from structured XML — 'facturae_322' | 'ubl_21'. Null for paper/photo. */`
- Parsed from structured XML — 'facturae_322' | 'ubl_21'. Null for paper/photo.

    ↳ `eInvoiceFormat:  text('e_invoice_format'),`

**`property qrUrl`**

- Full AEAT/TicketBAI QR verification URL decoded from the invoice image.

    ↳ `qrUrl:           text('qr_url'),`

**`property qrMismatch`**

- True when QR-decoded fields conflict with AI-extracted fields (blocking review).

    ↳ `qrMismatch:      integer('qr_mismatch').default(0), // 0=no, 1=yes`

**`const invoices`**

- 0=no, 1=yes

    ↳ `/** ISO timestamp when the restaurant accepted this invoice (RD 238/2026). */`

**`property acceptedAt`**

- ISO timestamp when the restaurant accepted this invoice (RD 238/2026).

    ↳ `acceptedAt:      timestamp('accepted_at', { withTimezone: true }),`

**`property rejectedAt`**

- ISO timestamp when the restaurant rejected this invoice.

    ↳ `rejectedAt:      timestamp('rejected_at', { withTimezone: true }),`

**`property paidAt`**

- ISO timestamp of full effective payment (paid date).

    ↳ `paidAt:          timestamp('paid_at', { withTimezone: true }),`

**`property version`**

- Optimistic-concurrency counter — the edit form submits it and the UPDATE is guarded by it, so a stale tab gets a 409 instead of silently clobbering another tab's edit (issue #242).

    ↳ `version:         integer('version').notNull().default(1),`

**`const invoices`**

- UNIQUE (not plain): the content hash is the dedup constraint, not just a pre-check. A concurrent double-click save of a numberless invoice (NULL invoice_number, so uq_invoices_rid_supplier_number does not apply) now loses the race via onConflictDoNothing → empty RETURNING → duplicate (issue #237). Partial on live rows so a soft-deleted invoice can be re-saved.

    ↳ `uniqueIndex('uq_invoices_rid_content_hash')`

**`const invoiceAuditLog`**

- 'soft_delete' | 'restore' | 'hard_delete'

    ↳ `userId:       text('user_id').notNull(),`

**`property productId`**

- Resolved product (issue #298). Nullable during transition: historical line items stay unlinked until backfilled; consumers fall back to the normalized description.

    ↳ `productId:              integer('product_id').references(() => products.id, { onDelete:…`

**`property unitsPerPack`**

- Pack structure parsed from the description/unit (issue #299). All nullable — populated only when a size could be determined. normalizedUnitPrice is unit_price per base unit (€/kg, €/L or €/ud), what price analytics and price-shock compare across different pack sizes.

    ↳ `unitsPerPack:           real('units_per_pack'),`

**`const invoiceLineItems`**

- restaurant_id prefix lets RLS-scoped price-history queries skip the invoice join

    ↳ `index('idx_invoice_line_items_rid_description').on(t.restaurantId, t.description),`

**`const products`**

- ── Product catalog (issue #298) A per-tenant canonical product, plus the many raw invoice descriptions that map to it. Together they turn "the string a supplier printed" into a stable entity so cross-supplier price comparison and analytics have something to group on. name_key / raw_key store normalizeProductKey(...) of the display text; see src/lib/server/normalize.ts and mep_norm_key in Postgres.

    ↳ `export const products = pgTable('products', {`

**`property unitsPerPack`**

- Pack-to-base-unit conversion (e.g. "1 saco = 10 kg"), set via the Products CRUD page. Resolves the 'unit_conversion_needed' alert for this product (src/lib/server/invoice-save.ts) once both are filled in.

    ↳ `unitsPerPack:  real('units_per_pack'),`

**`const products`**

- One product per normalized name within a tenant — concurrent saves of the same new product converge via ON CONFLICT instead of racing to insert.

    ↳ `uniqueIndex('products_restaurant_name_key_unique').on(t.restaurantId, t.nameKey),`

**`property source`**

- How this alias was created: 'exact' (auto, normalized-key match/new product), 'fuzzy' (auto-linked via pg_trgm — needs confirmation), 'user' (confirmed), 'llm' (Phase 4). confirmed_at IS NULL ⇒ a pending suggestion.

    ↳ `source:       text('source').notNull().default('exact'),`

**`const productAliases`**

- A raw invoice description resolves to exactly one product per tenant.

    ↳ `uniqueIndex('product_aliases_restaurant_raw_key_unique').on(t.restaurantId, t.rawKey),`
- Pending suggestions the review UI lists.

    ↳ `index('product_aliases_pending_idx').on(t.restaurantId).where(sql'${t.confirmedAt} IS N…`

**`const llmUsageLog`**

- ── LLM cost tracking

    ↳ `export const llmUsageLog = pgTable('llm_usage_log', {`

**`const monthlyUsage`**

- Atomic monthly extraction counter (issue #244). One row per tenant per month; the worker claims a slot with a single increment-with-cap UPDATE before spending a Gemini call, so N parallel uploads can't all read "remaining = 1" and burst past the plan limit. The page-level invoice count stays advisory UX only.

    ↳ `export const monthlyUsage = pgTable('monthly_usage', {`
- 'YYYY-MM'

    ↳ `used:         integer('used').notNull().default(0),`

**`const processedRequests`**

- Idempotency-key claim table (issue #250). Money-adjacent form actions render a hidden per-submit UUID and claim it here; a replay (double-click, offline-queue replay, proxy retry) finds the key already present and becomes a transparent no-op instead of a second write. Pruned after 48h.

    ↳ `export const processedRequests = pgTable('processed_requests', {`

**`const uploadBatches`**

- ── Batch invoice uploads Replaces the upload_sessions JSON-blob chain. One batch per upload, one item per invoice. Status/error/extracted_data are separate columns so the web and worker processes update only the fields they own — lost updates from whole-blob read-modify-write are structurally impossible.

    ↳ `export const uploadBatches = pgTable('upload_batches', {`

**`property status`**

- pending | queued | extracting | done | failed | confirmed | discarded Web owns: creation, pending→queued, done→confirmed/discarded. Worker owns: queued→extracting→done|failed and extracted_data.

    ↳ `status:          text('status').notNull().default('pending'),`

**`const whatsappContacts`**

- ── WhatsApp bot

    ↳ `export const whatsappContacts = pgTable('whatsapp_contacts', {`

**`property phoneNumber`**

- E.164 without leading '+', e.g. "34612345678"

    ↳ `phoneNumber:  text('phone_number').notNull(),`

**`const whatsappAccountEvents`**

- Account-level WhatsApp webhook events (issue #321).

    We operate one WhatsApp Business number for every tenant, so Meta's per-number quality rating is shared: blocks caused by one restaurant's staff degrade the rating for all of them, and a sufficiently degraded number can be restricted — which stops ingest for every tenant simultaneously. Nothing here is tenant-scoped, because the WABA is not: this is platform state.

    Recording these rather than only alerting on them means a downgrade has a history to read when someone asks "when did this start?".

    ↳ `export const whatsappAccountEvents = pgTable('whatsapp_account_events', {`

**`property field`**

- Meta's webhook field, e.g. 'account_update', 'phone_number_quality_update'.

    ↳ `field:         text('field').notNull(),`

**`property event`**

- The event name inside it, e.g. 'FLAGGED', 'ACCOUNT_RESTRICTION'.

    ↳ `event:         text('event'),`

**`property qualityRating`**

- GREEN | YELLOW | RED, when the payload carries one.

    ↳ `qualityRating: text('quality_rating'),`

**`property messagingLimit`**

- Messaging tier, e.g. 'TIER_1K'.

    ↳ `messagingLimit: text('messaging_limit'),`

**`property severity`**

- info | warning | critical — how loudly this should be read.

    ↳ `severity:      text('severity').notNull().default('info'),`

**`const whatsappPairingCodes`**

- Self-service enrolment codes (issue #320). The owner generates one in Settings and the staff member messages it to the bot from the phone they will actually use, which binds that number — captured from the webhook's `from` field, so it can never be mistyped the way hand-entering it can.

    The code is stored in plaintext on purpose, unlike a credential: the owner has to be able to read it back off the Settings page to relay it, and reloading must not lose it. It is defended by being single-use, short-lived and rate-limited on redemption rather than by being unreadable at rest.

    ↳ `export const whatsappPairingCodes = pgTable('whatsapp_pairing_codes', {`

**`property displayName`**

- Optional label carried onto the contact row when the code is redeemed.

    ↳ `displayName:  text('display_name'),`

**`property redeemedBy`**

- The number that redeemed it — kept for audit, not used for lookup.

    ↳ `redeemedBy:   text('redeemed_by'),`

**`const whatsappPairingCodes`**

- Global, because redemption resolves the tenant *from* the code, exactly as the bot resolves it from the sender's number.

    ↳ `uniqueIndex('whatsapp_pairing_codes_code_unique').on(t.code),`

**`const whatsappProcessedMessages`**

- Message-id dedup for WhatsApp webhooks (issue #245). Meta redelivers on infra hiccups; a claim here (INSERT … ON CONFLICT DO NOTHING RETURNING) makes a redelivered message a no-op instead of a second saved invoice.

    ↳ `export const whatsappProcessedMessages = pgTable('whatsapp_processed_messages', {`

**`property status`**

- awaiting_confirmation | confirmed | discarded

    ↳ `status:        text('status').notNull().default('awaiting_confirmation'),`

**`const userConsents`**

- ── GDPR consent audit trail (issue #201) One row per user per policy version. Written server-side only; keyed by the Supabase Auth user id (not restaurant-scoped — consent precedes onboarding).

    ↳ `export const userConsents = pgTable('user_consents', {`
- 'signup_form' | 'oauth_signup' | 'onboarding'

    ↳ `acceptedAt:    timestamp('accepted_at', { withTimezone: true }).defaultNow(),`

**`const subscriptions`**

- 'trial' | 'starter' | 'pro' | 'business'

    ↳ `status:               text('status').notNull().default('trialing'),`

**`property lastEventAt`**

- Stripe `event.created` of the last lifecycle event applied to this row. The updated/deleted webhook branch skips events older than this so a delayed `updated(past_due)` can't clobber a newer `updated(active)` (out-of-order protection, issue #240).

    ↳ `lastEventAt:          timestamp('last_event_at', { withTimezone: true }),`

**`const stripeWebhookEvents`**

- Stripe webhook event-id dedup (issue #240). Stripe retries deliveries for up to 3 days; the handler claims each event id here (INSERT … ON CONFLICT DO NOTHING RETURNING) and returns early on an empty result so retried events don't re-send emails or re-fire telemetry. Written server-side only.

    ↳ `export const stripeWebhookEvents = pgTable('stripe_webhook_events', {`

### `src/lib/server/sessions.ts`

**`const ALLOWED_EXTENSIONS`**

- Upload file helpers — validation, storage-key generation, and local-path resolution for uploaded invoice files. Batch/queue state lives in batch.ts; the legacy JSON-blob session store this module once held is gone.

    ↳ `import path from 'path';`

**`function uploadsDir`**

- Local uploads directory — used by the local storage driver and for file stat display.

    ↳ `export function uploadsDir(): string {`

**`interface RejectedUpload`**

- Save uploaded files using the configured storage driver.

    @param files Files to save. @param namespace Prefix for storage keys, typically the batch ID. @returns saved Original (display) filenames with a uniqueness suffix. @returns keys Storage keys (`namespace/filename`) parallel to `saved`. @returns errors Validation errors for rejected files. Structured, not prose: the reason is an i18n key the page translates (issue #294), with the filename carried alongside it.

    ↳ `export interface RejectedUpload {`
- i18n key under upload.reject.*

    ↳ `reason: 'unsupportedType' | 'tooLarge' | 'contentMismatch';`

**`function localFilePath`**

- Returns the local filesystem path for a storage key when using the local driver. Used only for file stat display on the batch page.

    ↳ `export function localFilePath(key: string): string {`

### `src/lib/server/storage.ts`

**`method delete`**

- already gone or invalid path — ignore

    ↳ `}`
- ignore errors — object may already be gone

    ↳ `}`

### `src/lib/server/supabase.ts`

**`const resilientFetch`**

- Supabase project paused (Cloudflare 521) returns an HTML body. The SDK treats any non-JSON response as AuthRetryableFetchError and retries 3×, flooding the console. Converting 521 → 503 with a proper JSON error body makes the SDK throw AuthApiError (non-retryable) and stop immediately.

    ↳ `const resilientFetch: typeof globalThis.fetch = async (input, init) => {`

**`property autoRefreshToken`**

- Server-side clients are per-request and short-lived; no background refresh timer needed — the client side handles token refresh.

    ↳ `autoRefreshToken: false,`

**`function createSupabaseAdminClient`**

- Service-role client — bypasses RLS. Only for server-side admin operations.

    ↳ `export function createSupabaseAdminClient() {`

### `src/lib/server/supplier-reliability.ts`

**`function computePriceStability`**

- Coefficient of variation per product, then averaged — not pooled across products (issue #308). Pooling raw prices from different items (e.g. a €1/kg tomato and a €6 jar of olives) reads as huge "instability" purely from their different price levels, even when each one is individually rock-steady.

    ↳ `const byDescription = new Map<string, number[]>();`

### `src/lib/server/supplier.ts`

**`function getOrCreateSupplierId`**

- Atomic supplier get-or-create (issue #238).

    Replaces the select-then-insert pattern that used to live in invoice-save, the invoice edit action, and the WhatsApp bot. Backed by the uq_suppliers_rid_name unique index on (restaurant_id, lower(name)), so two concurrent saves of the same new supplier converge on one row instead of racing to insert clones. The no-op DO UPDATE makes RETURNING yield the existing row on conflict (a bare DO NOTHING returns nothing on conflict).

    ↳ `import { sql } from 'drizzle-orm';`
- Returns the id of the tenant's supplier with this name, creating it if absent. Case-insensitive and whitespace-trimmed to match the unique index. Pass a transaction as `exec` to run inside an enclosing save.

    ↳ `export async function getOrCreateSupplierId(`
- A category is only ever applied at creation. New suppliers default to the 'Other' bucket (issue #307) instead of a null category — without this, every product resolved against a newly-created supplier inherits a null category too (product-catalog.ts reads it at creation time), and Budgets/category analytics have nothing to group on for any tenant that never manually curates supplier categories. Callers may pass a category proposed by extraction (issue #315); it must already have been through `resolveSupplierCategory`, so an unrecognised guess arrives here as the bucket and still triggers the categorisation nudge.

    The no-op DO UPDATE on conflict leaves an *existing* supplier's category untouched — a later invoice never overwrites what a human chose, and never silently reclassifies a supplier behind their back.

    ↳ `const resolved = VALID_CATEGORIES.includes(category) ? category : UNCATEGORIZED_CATEGORY;`

### `src/lib/server/tenant.ts`

**`function forTenant`**

- Tenant-scoped query context — no DB connection dependency. See ARCHITECTURE_DECISIONS.md ADR-001.

    ↳ `import { eq, and, type SQL } from 'drizzle-orm';`
- Returns a tenant-scoped query context. Use in all route handlers instead of building raw `eq(table.restaurantId, rid)` inline.

    @example const tdb = forTenant(locals.restaurantId); const rows = await db.select().from(suppliers).where(tdb.scope(suppliers.restaurantId)); // With extra conditions: const paid = await db.select().from(invoices) .where(tdb.scope(invoices.restaurantId, eq(invoices.status, 'paid')));

    ↳ `export function forTenant(restaurantId: string) {`

**`method scope`**

- Builds a WHERE condition that always scopes to this tenant.

    ↳ `scope(ridCol: AnyPgColumn, extra?: SQL): SQL {`

### `src/lib/server/trend.ts`

**`function addDays`**

- safety cap for pathological range+granularity combos (e.g. daily + all)

    ↳ `function addDays(d: Date, days: number): Date {`

**`function isoDate`**

- Avoid toISOString(): it converts through UTC and silently rolls the calendar date back a day for any timezone ahead of UTC.

    ↳ `const y = d.getFullYear();`

**`function getTrendDataByRange`**

- Postgres date key helpers

    ↳ `const dayKey   = sql<string>'TO_CHAR((${invoices.invoiceDate})::date, 'YYYY-MM-DD')';`
- Build the list of bucket boundary dates spanning [startDate, today] at the requested granularity

    ↳ `let bucketDates: Date[] = [];`
- Group on the raw column and fold NULL into the sentinel in TS below. Doing the COALESCE in SQL meant writing it in both SELECT and GROUP BY, and Drizzle binds the sentinel as a fresh parameter each time — Postgres matches GROUP BY expressions syntactically, saw COALESCE(x,$1) next to COALESCE(x,$4), and rejected the whole query ("column suppliers.category must appear in the GROUP BY clause"), 500ing the dashboard.

    ↳ `const groupedRows = await db`

**`type TrendRow`**

- Uncategorised spend lands in the same 'Other' bucket the budget check and the budgets page use, instead of a third NULL segment (issue #301). NULL and a supplier filed explicitly under 'Other' are separate groups coming out of SQL, so merge them here or the chart renders 'Other' twice.

    ↳ `type TrendRow = { key: string; category: string; amount: number };`

**`function getTrendDataByRange`**

- Nested rather than a composite string key: a category is free text, so any separator would need proving it can never appear inside one.

    ↳ `const byBucket = new Map<string, Map<string, TrendRow>>();`

### `src/lib/server/waitlist-db.ts`

**`function insertWaitlistEmail`**

- Insert an email into the waitlist. Returns true if inserted, false if already registered.

    ↳ `export async function insertWaitlistEmail(email: string): Promise<boolean> {`

### `src/lib/server/weekly-digest.ts`

**`function claimDigestWeek`**

- Atomically claim the week before paying for a Gemini generation (issue #249): the upsert only fires when the stored week differs, so of N concurrent dashboard loads at week rollover exactly one wins the claim and generates — the rest serve the previous digest until the new one lands.

    ↳ `async function claimDigestWeek(restaurantId: string, week: string): Promise<boolean> {`

**`function getOrGenerateWeeklyDigest`**

- Another request is already generating this week's digest — serve whatever text is stored (the fresh one if it just landed, else the previous week's) instead of paying for a duplicate generation.

    ↳ `const text = await getSetting(restaurantId, 'weekly_digest_text');`
- Release the claim so a later load can retry this week's generation.

    ↳ `await upsertSetting(restaurantId, 'weekly_digest_week', storedWeek ?? '');`

### `src/lib/server/whatsapp-bot.ts`

**`const SESSION_TTL_MS`**

- WhatsApp invoice bot — handles incoming messages, runs extraction, asks for confirmation, and persists invoices tagged as pending.

    ↳ `import fs from 'node:fs';`

**`const UNAUTHORIZED_REPLY_COOLDOWN_S`**

- 1 hour

    ↳ `/** How long an unknown number waits before the bot answers it again (#322). */`
- How long an unknown number waits before the bot answers it again (#322).

    ↳ `const UNAUTHORIZED_REPLY_COOLDOWN_S = 6 * 60 * 60; // 6 hours`

**`interface WhatsAppInboundMessage`**

- 6 hours

    ↳ `export interface WhatsAppInboundMessage {`

**`function claimMessageId`**

- Claims a WhatsApp message id so a redelivered webhook is processed once (issue #245). Returns false when the id was already seen. Fails open on a DB error — a rare duplicate is better than silently dropping a real invoice.

    ↳ `async function claimMessageId(messageId: string | undefined): Promise<boolean> {`

**`function handleWhatsAppMessage`**

- Dedup on the WhatsApp message id before any side effect — Meta redelivers webhooks, and a duplicate "SÍ" must not save the invoice twice.

    ↳ `if (!(await claimMessageId(msg.id))) {`
- Resolve which restaurant this number belongs to

    ↳ `const contactRows = await db`
- An enrolling number is by definition not yet authorised, so pairing is handled here rather than before the lookup (issue #320) — that way an already-authorised sender's "SÍ"/"NO" can never be mistaken for a code.

    ↳ `if (msg.type === 'text' && msg.text && normalizeCode(msg.text.body)) {`
- Reply at most once per number per cooldown (issue #322). A wrong number or a spam contact would otherwise get an answer to every message it sends, which is unbounded billable traffic from 1 Oct 2026 and poor anti-abuse behaviour long before that. A staff member who genuinely mistyped still gets told the first time.

    ↳ `if (await checkRateLimit('whatsapp-unauth:${from}', 1, UNAUTHORIZED_REPLY_COOLDOWN_S)) {`

**`function handlePairingAttempt`**

- ── Pairing (issue #320)

    ↳ `/**`
- Redeem a pairing code sent by a not-yet-authorised number.

    Unknown, expired and already-used codes get one identical answer, so a guess never reveals whether a code exists. Exhausting the per-sender attempt budget is answered with silence rather than a "too many attempts" message — telling someone they are being rate-limited is itself a signal, and every reply here goes to an unauthenticated number at our expense.

    ↳ `async function handlePairingAttempt(from: string, body: string): Promise<void> {`

**`function handleMediaUpload`**

- ── Media handler

    ↳ `async function handleMediaUpload(`
- Money gate: reserve a monthly extraction slot BEFORE any Gemini spend (issue #318). Without this WhatsApp was an unmetered lane around the plan quota the web uploader enforces — and under the shared-number model that cost lands on us, not the tenant. Claimed after the pending-session guard above so a rejected duplicate never burns a slot.

    ↳ `const claim = await claimMonthlyExtraction(restaurantId);`
- Same aggregation as the worker (#257) — a tenant hitting the wall must be visible here too, not only discovered from a support ticket.

    ↳ `Sentry.captureMessage('extraction.quota_exhausted', {`
- No "procesando…" ack (issue #322). WhatsApp already shows the photo as delivered and the summary lands in ~10 s, so the ack bought nothing and made a successful invoice cost three outbound messages instead of two — billable from 1 Oct 2026, and on our account under the shared number.

    ↳ `let buffer: Buffer;`
- Nothing was extracted — give the slot back (mirrors extraction-worker).

    ↳ `await releaseMonthlyExtraction(restaurantId);`
- Write to a temp file so the existing extractor can read it from disk

    ↳ `const tmpFile = path.join(os.tmpdir(), 'wa_${randomUUID()}.${extension}');`
- A Gemini failure shouldn't consume the tenant's quota (issue #318).

    ↳ `await releaseMonthlyExtraction(restaurantId);`
- already gone

    ↳ `}`
- Persist the file to storage for later web review

    ↳ `const fileKey = 'whatsapp/${restaurantId}/${randomUUID()}.${extension}';`
- Store session awaiting user confirmation

    ↳ `const expiresAt = new Date(Date.now() + SESSION_TTL_MS);`

**`function handleTextReply`**

- ── Text reply handler

    ↳ `async function handleTextReply(from: string, restaurantId: string, body: string): Promi…`
- Strip accents, lowercase, trim

    ↳ `const normalized = body`
- Claim the session before saving (guarded awaiting_confirmation → confirmed) so two duplicate "SÍ" deliveries can't both save (issue #245). Only the winner proceeds; the content-hash index is the final backstop.

    ↳ `const claim = await db`
- Another delivery already handled this confirmation.

    ↳ `return;`
- Confirm: save to DB

    ↳ `const extracted = session.extractedData as unknown as ExtractedInvoice;`
- Roll the claim back to discarded if the save didn't land, so the session doesn't sit as 'confirmed' with no invoice behind it.

    ↳ `if (result.type !== 'saved') {`

**`function getPendingSession`**

- ── Session helpers

    ↳ `async function getPendingSession(from: string) {`

**`type SaveResult`**

- ── Invoice persistence

    ↳ `type SaveResult =`

**`function saveWhatsAppInvoice`**

- Atomic supplier get-or-create (issue #238), tagged with the category extraction proposed (issue #315). Nothing here is user -reviewed, so an unnamed supplier ('Desconocido') keeps the uncategorised bucket and its nudge rather than inheriting a guess made about a document we couldn't attribute.

    ↳ `const supplierId = await getOrCreateSupplierId(`
- Invoice number duplicate guard

    ↳ `if (invoiceNumber) {`
- Fire-and-forget: warn the owner when monthly usage nears the plan quota.

    ↳ `void maybeSendQuotaWarning(restaurantId);`

**`function buildSummaryMessage`**

- ── Message formatting

    ↳ `function buildSummaryMessage(data: ExtractedInvoice): string {`

### `src/lib/server/whatsapp-contacts.ts`

**`interface WhatsAppContact`**

- Authorised WhatsApp numbers (issue #187 follow-up).

    `whatsapp_contacts` is the allow-list the bot checks before it will process anything: an unknown sender is answered with "no autorizado" and dropped (`whatsapp-bot.ts`). Until this module existed the table could only be populated with hand-written SQL, which made the bot effectively unusable for anyone who wasn't the operator.

    Numbers are stored the way Meta delivers them in the webhook `from` field: E.164 **without** the leading '+', e.g. "34612345678". Anything a user types has to be normalised into that shape or the lookup silently never matches.

    ↳ `import { asc, eq } from 'drizzle-orm';`

**`function addContact`**

- Authorise a number for this restaurant.

    `whatsapp_contacts_phone_unique` is global, not per-tenant: one phone maps to exactly one restaurant, because the bot resolves the tenant *from* the number and a second row would make that ambiguous. A number already claimed by another tenant therefore fails as 'taken' rather than silently rebinding it.

    ↳ `export async function addContact(`
- Conflict: either this tenant already has it (idempotent success) or another tenant holds it (a real error the user needs to see).

    ↳ `const [existing] = await db`

**`function removeContact`**

- De-authorise a number. Tenant-scoped so one restaurant cannot remove another's.

    ↳ `export async function removeContact(restaurantId: string, id: number): Promise<boolean> {`

### `src/lib/server/whatsapp-health.ts`

**`type Severity`**

- WhatsApp number health (issue #321).

    We run one WhatsApp Business number for every tenant. That is the right model for this market — per-tenant numbers would require each restaurant to hold a spare number and pass Meta business verification — but it concentrates a shared reputation risk. Meta tracks a **quality rating** per business phone number, driven largely by user blocks and reports, so blocks caused by one restaurant's staff degrade the rating for all of them, and a sufficiently degraded number can be restricted. When that happens, ingest stops for every tenant simultaneously.

    The exposure is reputational rather than throughput-bound: the bot only ever *replies*, inside the 24-hour service window, so the business-initiated messaging-tier limits are largely not binding.

    Until now the webhook read only `value.messages[]`, so a downgrade would have been discovered from support tickets. These events make it *delivered*.

    ↳ `import * as Sentry from '@sentry/sveltekit';`

**`const CRITICAL_EVENTS`**

- Events that mean the number is (or is about to be) unusable. Meta sends these under `account_update`; any of them stops or threatens ingest for everyone.

    ↳ `const CRITICAL_EVENTS = new Set([`

**`const WARNING_EVENTS`**

- Degraded but still delivering — worth a look before it becomes the above.

    ↳ `const WARNING_EVENTS = new Set([`

**`interface AccountEventInput`**

- Meta's webhook field name, e.g. 'account_update'.

    ↳ `field: string;`
- The `value` object from the change.

    ↳ `value: Record<string, unknown>;`

**`function parseAccountEvent`**

- Reduce a webhook `value` object to the fields worth acting on.

    Meta's account payloads vary by event and change shape between API versions, so this reads defensively and keeps the raw payload alongside: an unrecognised event still lands as a row rather than being dropped.

    ↳ `export function parseAccountEvent({ field, value }: AccountEventInput): ParsedEvent {`
- Quality arrives as `current_quality_rating` on some events and inside a nested object on others; a plain `event` of GREEN/YELLOW/RED also occurs.

    ↳ `const rating = str(value.current_quality_rating)`
- A ban or restriction block is present regardless of the event name.

    ↳ `else if (value.ban_info || value.restriction_info) severity = 'critical';`
- FLAGGED is a warning, but its recovery (UNFLAGGED, back to GREEN) is not.

    ↳ `if (event === 'UNFLAGGED' || rating === 'GREEN') severity = 'info';`

**`function recordAccountEvent`**

- Persist an account event and, when it matters, page Sentry.

    Never throws: this runs inside the webhook handler, which must keep answering Meta within 5 s and must not fail a batch of real messages over a bookkeeping write.

    ↳ `export async function recordAccountEvent(input: AccountEventInput): Promise<void> {`
- Treat a drop as an incident, not a metric — ingest for the entire customer base runs through this one number.

    ↳ `console.warn('[whatsapp-health] ${parsed.severity}: ${parsed.field}/${parsed.event ?? '…`

**`interface NumberHealth`**

- Latest known quality rating, if Meta has ever told us one.

    ↳ `qualityRating: string | null;`
- Latest known messaging tier.

    ↳ `messagingLimit: string | null;`
- Worst severity seen in the recent window.

    ↳ `severity: Severity;`
- The event behind that severity, for the admin detail line.

    ↳ `lastEvent: string | null;`
- Whether we have ever received an account-level event at all.

    ↳ `everReported: boolean;`

**`const HEALTH_WINDOW_DAYS`**

- How far back "current" reaches. A red flag from last quarter is history.

    ↳ `const HEALTH_WINDOW_DAYS = 30;`

**`function getNumberHealth`**

- Current health of the shared number, as far as Meta has told us.

    `everReported: false` is the normal state before the account-level webhook fields are subscribed — the admin page reports that as "not subscribed" rather than "healthy", because silence here is absence of data, not good news.

    ↳ `export async function getNumberHealth(): Promise<NumberHealth> {`
- The most recent event wins on the *current* rating; the window's worst severity drives the badge, so a RED that flipped back an hour ago is still visible rather than papered over by the recovery event.

    ↳ `const rank: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };`
- Ratings are not sent on every event, so fall back through the window.

    ↳ `const qualityRating = latest.qualityRating ?? recent.find(r => r.qualityRating)?.qualit…`

**`function recentAccountEvents`**

- Most recent account events, newest first — the admin timeline.

    ↳ `export async function recentAccountEvents(limit = 20) {`

**`function contactsPerTenant`**

- Authorised senders per tenant.

    If one restaurant ever generates a disproportionate share of blocks we need to find and de-authorise their numbers quickly. Settings can do that per tenant, but only if you already know which tenant — hence this view. Read-only on purpose: removing a number stays an explicit act in the owner's own Settings.

    ↳ `export async function contactsPerTenant(limit = 20) {`

### `src/lib/server/whatsapp-pairing.ts`

**`const CODE_ALPHABET`**

- Self-service WhatsApp enrolment by pairing code (issue #320).

    The manual path — the owner types a staff member's phone number into Settings — stays, because it is still the right way for the owner to authorise their own number. It just isn't the right way to onboard a new hire: a typo there produces the worst failure mode available, where the chef gets "este número no está autorizado" while the authorised row in Settings looks perfectly fine.

    A code inverts the trust direction. The owner generates one, the chef messages it from the phone they will actually use, and the number is taken from the webhook's `from` field — so it cannot be mistyped, and it is proven to be controlled by whoever holds the code.

    Redemption runs before the bot's authorisation gate, since an enrolling number is by definition not yet authorised. That makes it the one unauthenticated write path into `whatsapp_contacts`, so it is deliberately narrow: codes are single-use, short-lived, redeemed by a guarded UPDATE (never a read-then- write), and rate-limited per sender. Failures are indistinguishable from each other, so a wrong code never reveals whether it exists.

    ↳ `import { randomInt } from 'node:crypto';`
- Ambiguity is the enemy here: the code is read off a screen and typed into a phone, often by someone else. 0/O, 1/I/L and 5/S are omitted, which costs a little entropy and saves a lot of support.

    ↳ `const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRTUVWXYZ';`

**`const CODE_TTL_MS`**

- ~15 minutes: long enough to walk a code across a kitchen, short enough that a screenshot left on a phone is not a standing invitation.

    ↳ `export const CODE_TTL_MS = 15 * 60 * 1000;`

**`const REDEEM_ATTEMPTS`**

- Redemption attempts per sender. 30 codes^6 ≈ 7.3e8, so this is far below anything that could brute-force a code inside its TTL.

    ↳ `const REDEEM_ATTEMPTS = 5;`

**`const GENERATE_LIMIT`**

- How many codes an owner may mint per hour — abuse guard, not a UX limit.

    ↳ `const GENERATE_LIMIT = 10;`

**`function normalizeCode`**

- Normalise what the sender typed. People add spaces and dashes, and phone keyboards capitalise unpredictably, so a code is compared case- and separator-insensitively.

    ↳ `export function normalizeCode(input: string): string | null {`
- Anything using a character outside the alphabet cannot be one of ours; not treating it as a code attempt keeps ordinary chat out of the rate limiter.

    ↳ `for (const ch of cleaned) if (!CODE_ALPHABET.includes(ch)) return null;`

**`function generatePairingCode`**

- Mint a code for a restaurant, replacing any it already has outstanding.

    One live code per restaurant at a time: the Settings card shows "the" code, so a second one silently superseding the one already written on a notepad would be worse than reissuing visibly. Expiring the old ones also keeps the number of simultaneously guessable codes at one per tenant.

    ↳ `export async function generatePairingCode(`
- The unique index is global, so a collision with another tenant's live code is possible in principle. Retry rather than surface it — at 7.3e8 values against a handful of live codes this effectively never runs.

    ↳ `for (let attempt = 0; attempt < 5; attempt++) {`

**`function activePairingCode`**

- The restaurant's live, unredeemed code, if any — what Settings displays.

    ↳ `export async function activePairingCode(restaurantId: string): Promise<PairingCode | nu…`

**`function revokePairingCodes`**

- Discard the live code without minting a replacement.

    ↳ `export async function revokePairingCodes(restaurantId: string): Promise<void> {`

**`type RedeemResult`**

- Bound successfully — `restaurantId` is the tenant the number now belongs to.

    ↳ `| { ok: true; restaurantId: string }`
- Unknown, expired or already-used code. Deliberately one outcome, not three.

    ↳ `| { ok: false; reason: 'invalid' }`
- The sender's number is already authorised somewhere else.

    ↳ `| { ok: false; reason: 'taken' }`
- Too many attempts from this sender — answer with nothing at all.

    ↳ `| { ok: false; reason: 'rateLimited' };`

**`function redeemPairingCode`**

- Redeem `rawCode` for `phone` (E.164 without '+', straight from the webhook).

    The claim is a guarded UPDATE — `redeemed_at IS NULL AND expires_at > now()`, RETURNING — so two deliveries of the same message, or two people racing on one code, cannot both win. Only the winner then writes the contact row.

    ↳ `export async function redeemPairingCode(phone: string, rawCode: string): Promise<Redeem…`
- Unknown, expired and already-redeemed all land here, and all look the same from outside — an attacker must not learn that a code exists.

    ↳ `if (!claimed) return { ok: false, reason: 'invalid' };`
- `whatsapp_contacts_phone_unique` is global: this number belongs to another restaurant. Release the code rather than burning the owner's — nothing was enrolled, so nothing should have been spent.

    ↳ `await db`

### `src/lib/server/whatsapp.ts`

**`function maskPhone`**

- Mask a phone number for logs — keep only the last 4 digits (issue #254).

    ↳ `function maskPhone(to: string): string {`

**`function downloadWhatsAppMedia`**

- Step 1: resolve the media download URL

    ↳ `const metaRes = await fetch('${GRAPH_API_BASE}/${mediaId}', {`
- Step 2: download the actual bytes

    ↳ `const fileRes = await fetch(meta.url, {`

### `src/lib/server/working-days.ts`

**`const FIXED_HOLIDAYS`**

- Spanish working-day calculator for the 4-day invoice acceptance clock mandated by RD 238/2026 (Ley Crea y Crece B2B e-invoicing).

    "Días hábiles" = calendar days excluding Saturdays, Sundays, and Spanish national public holidays (fiestas nacionales). Regional and local holidays are NOT included — the legal clock runs on national ones.
- Fixed national holidays (month and day, 1-indexed)

    ↳ `const FIXED_HOLIDAYS: ReadonlyArray<readonly [month: number, day: number]> = [`
- Año Nuevo

    ↳ `[1, 6],   // Epifanía del Señor (Reyes Magos)`
- Epifanía del Señor (Reyes Magos)

    ↳ `[5, 1],   // Fiesta del Trabajo`
- Fiesta del Trabajo

    ↳ `[8, 15],  // Asunción de la Virgen`
- Asunción de la Virgen

    ↳ `[10, 12], // Fiesta Nacional de España`
- Fiesta Nacional de España

    ↳ `[11, 1],  // Todos los Santos`
- Todos los Santos

    ↳ `[12, 6],  // Día de la Constitución Española`
- Día de la Constitución Española

    ↳ `[12, 8],  // Inmaculada Concepción`
- Inmaculada Concepción

    ↳ `[12, 25], // Navidad del Señor`
- Navidad del Señor

    ↳ `];`

**`const GOOD_FRIDAY`**

- Viernes Santo (Good Friday) dates for 2024-2030. Source: calendar calculations (Easter Sunday - 2 days). This is the only moveable national holiday in Spain.

    ↳ `const GOOD_FRIDAY: Readonly<Record<number, string>> = {`

**`function isSpanishWorkingDay`**

- 0=Sun, 6=Sat

    ↳ `if (dow === 0 || dow === 6) return false;`

**`function countSpanishWorkingDaysUntil`**

- Counts Spanish working days strictly between `from` (exclusive) and `to` (inclusive). This matches the legal meaning: a 4-day clock started on a Monday counts Tue, Wed, Thu, Fri as 4 working days (assuming no holidays).

    ↳ `export function countSpanishWorkingDaysUntil(from: Date, to: Date): number {`

**`function addSpanishWorkingDays`**

- Returns the date that is `days` Spanish working days after `from`. The deadline for invoice acceptance under RD 238/2026 is `addSpanishWorkingDays(invoiceReceivedAt, 4)`.

    ↳ `export function addSpanishWorkingDays(from: Date, days: number): Date {`

**`function workingDaysUntilDeadline`**

- Returns the number of Spanish working days remaining until the 4-day acceptance deadline, given when the invoice was received. Negative means the deadline has passed.

    ↳ `export function workingDaysUntilDeadline(receivedAt: Date, today: Date, deadlineDays = …`
- Past deadline — return negative count of overrun working days

    ↳ `return -countSpanishWorkingDaysUntil(deadline, todayMid) || 0;`

## UI components

### `src/lib/components/desktop/DesktopDashboard.svelte`

**`const CAT_DONUT_CIRC`**

- Category donut — fills the empty space below the KPI row on the no-alerts sidebar card (issue: blank space under "Variación mensual").

    ↳ `const CAT_DONUT_CIRC = 2 * Math.PI * 42;`

**`markup`**

- Period picker row

    ↳ `<div style="display:flex;align-items:center;gap:10px;">`
- ── First Invoice Banner

    ↳ `{#if data.firstInvoice && !firstInvoiceDismissed}`
- ── KPI Strip

    ↳ `<div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[560px]:grid-cols-1" dat…`
- ── Spend chart + Alerts panel

    ↳ `<div class="grid gap-3 max-[900px]:grid-cols-1" style="grid-template-columns:2fr 1fr;">`
- Finer boundary: a chart crash (bad trend data) shows a chart-sized fallback instead of blanking the dashboard (issue #255).

    ↳ `<ErrorBoundary>`
- Fallback secondary KPIs when no alerts

    ↳ `<div class="card overflow-hidden flex flex-col h-full">`
- ── "Por revisar" pending invoices

    ↳ `{#if data.pending_invoices.length > 0}`
- ── Suppliers + Recent invoices

    ↳ `<div class="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">`
- ── Budget + projection + Category spend + Price changes

    ↳ `<div class="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">`
- ── Invoice aging

    ↳ `<SectionCard title={$t('dash.aging')} sub={$t('dash.aging.pending')}>`
- ── Missing invoices

    ↳ `{#if data.missing_invoices.length}`

### `src/lib/components/desktop/DesktopSupplierDetail.svelte`

**`const SERIES_COLORS`**

- Product spend donut â€” top 5 + "Other", fixed categorical hue order (never cycled)

    ↳ `const SERIES_COLORS = ['var(--mep-series-1)', 'var(--mep-series-2)', 'var(--mep-series-…`

**`const CL`**

- SVG chart constants

    ↳ `const CL = 40;`

**`markup`**

- Sticky header area

    ↳ `<div style="padding:18px 24px 0;flex-shrink:0;">`
- Breadcrumb

    ↳ `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--mep-fg-3…`
- Supplier header

    ↳ `<div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">`
- Delete confirmation

    ↳ `{#if confirmDelete}`
- Edit form

    ↳ `{#if editing}`
- Tabs

    ↳ `<div style="display:flex;gap:0;border-bottom:1px solid var(--mep-divider);">`
- Tab content

    ↳ `<div style="flex:1;min-height:0;overflow:auto;padding:18px 24px 24px;">`
- â”€â”€ RESUMEN â”€â”€

    ↳ `{#if tab === 'resumen'}`
- Left column

    ↳ `<div style="display:flex;flex-direction:column;gap:14px;">`
- Monthly spend chart

    ↳ `<div class="card" style="padding:16px 16px 12px;">`
- KPI strip

    ↳ `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">`
- Reliability breakdown

    ↳ `{#if m}`
- Right column

    ↳ `<div style="display:flex;flex-direction:column;gap:14px;">`
- Info card

    ↳ `<div class="card" style="padding:16px;">`
- Recent invoices

    ↳ `<div class="card" style="padding:0;overflow:hidden;">`
- â”€â”€ FACTURAS â”€â”€

    ↳ `{:else if tab === 'facturas'}`
- â”€â”€ PRODUCTOS â”€â”€

    ↳ `{:else if tab === 'productos'}`
- Donut

    ↳ `<div style="position:relative;flex-shrink:0;width:180px;height:180px;">`
- Legend + hover detail

    ↳ `<div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:7px;">`
- â”€â”€ CONVERSIONES â”€â”€

    ↳ `{:else if tab === 'conversiones'}`
- Add conversion form

    ↳ `<div class="card" style="padding:16px;">`

### `src/lib/components/desktop/DesktopSuppliersList.svelte`

**`markup`**

- Filter bar

    ↳ `<div class="card" style="padding:10px 12px;display:flex;align-items:center;gap:10px;fle…`
- Summary strip

    ↳ `<div class="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 flex-shrink-0" data-coach="s…`
- Table

    ↳ `<div class="card" style="padding:0;overflow:hidden;flex:1;display:flex;flex-direction:c…`

### `src/lib/components/mep/AuthShell.svelte`

**_module level_**

- Centred logo + card chrome shared by the standalone auth pages (/forgot-password, /reset-password — issue #284). Extracted from the login page so a recovery screen can't drift away from the sign-in look.

    ↳ `import type { Snippet } from 'svelte';`

### `src/lib/components/mep/CoachMark.svelte`

**`const spotTop`**

- Small delay so the page renders first

    ↳ `setTimeout(measure, 80);`

**`const tipLeft`**

- Place tooltip below spotlight; flip above if too close to bottom

    ↳ `const tipLeft  = $derived(Math.max(16, Math.min(spotLeft, vw - TOOLTIP_W - 16)));`

**`const tipTop`**

- approximate card height

    ↳ `);`

**`markup`**

- Full-screen backdrop (click outside = skip)
- svelte-ignore a11y_no_static_element_interactions

    ↳ `<div`
- Spotlight ring (box-shadow punches the dark overlay)

    ↳ `<div`
- Tooltip card
- svelte-ignore a11y_no_static_element_interactions

    ↳ `<div`
- Step counter

    ↳ `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom…`
- Content

    ↳ `<div style="font-size:14px;font-weight:600;color:var(--mep-fg);margin-bottom:6px;line-h…`
- CTA

    ↳ `<button`

### `src/lib/components/mep/ConfirmDialog.svelte`

**`markup`**

- svelte-ignore a11y_no_static_element_interactions

    ↳ `<div`
- svelte-ignore a11y_no_noninteractive_element_interactions

    ↳ `<div`

### `src/lib/components/mep/ErrorBoundary.svelte`

**`markup`**

- Reusable client error boundary (issue #255). SvelteKit's handleError only covers load/navigation; a runtime error thrown during client render or in an effect after hydration (a chart choking on bad data, the batch polling loop) would otherwise tear down the component tree and leave a dead/white UI. This contains the failure to one panel and offers a retry, and still reports to Sentry.

    ↳ `<script lang="ts">`

### `src/lib/components/mep/FieldInput.svelte`

**`type Props`**

- Show empty-field warning (needsReview result).

    ↳ `empty?: boolean;`
- External warning message (e.g. discrepancy).

    ↳ `warnMsg?: string;`
- Apply num class for monospaced numeric style.

    ↳ `num?: boolean;`

### `src/lib/components/mep/FlowSteps.svelte`

**`const STEPS`**

- Upload → Extract → Review progress indicator (issue #232).

    Extracted from UploadPanel so the cue survives the navigation to /batch/[id] — where steps 2 and 3 actually happen, and where it was previously missing at exactly the moment it helps most.

    `active` is the zero-based index of the current step; earlier steps read as done, later ones as pending.

    ↳ `import Check from '@lucide/svelte/icons/check';`

### `src/lib/components/mep/NotificationBell.svelte`

**`const decidingCategory`**

- Suggested supplier category (issue #315): accept in one tap. Declining is the generic X — the supplier stays in the uncategorised bucket, which is a valid answer — and "change" is a link to the supplier's category field.

    ↳ `let decidingCategory = $state<number | null>(null);`

**`function acceptCategory`**

- 404 means the supplier was categorised by hand in the meantime; the server clears the stale suggestion too, so drop it here as well.

    ↳ `if (resp.ok || resp.status === 404) items = items.filter((i) => i.id !== n.id);`
- Offline/server error — leave it in place to retry later.

    ↳ `} finally {`

**`const deciding`**

- Product-catalog suggestion (issues #298/#300): confirm/reject a match. A fuzzy suggestion confirms the auto-link in place; an LLM suggestion (source 'llm') carries a candidate product to merge into on confirm, and just dismisses on decline (the line is already its own product). On success the server also dismisses the notification, so drop it locally.

    ↳ `let deciding = $state<number | null>(null);`

**`function decideProduct`**

- Offline/server error — leave the suggestion in place to retry later.

    ↳ `} finally {`

**`function dismiss`**

- Offline or server error — restore the item at its place instead of silently losing the dismissal and leaving an unhandled rejection (#255).

    ↳ `if (removed && removedIndex >= 0) {`

**`markup`**

- backdrop

    ↳ `<div`
- dropdown

    ↳ `<div`
- Server-raised alerts carry an i18n key + vars in their payload so the text follows the reader's locale; `message` is only the language-neutral fallback for alerts not yet keyed.

    ↳ `{@const msg = n.payload as { messageKey?: string; messageVars?: Record<string, string |…`
- One-tap route to the supplier's category field (issue #301)

    ↳ `{#if n.notificationType === 'supplier_uncategorized'}`
- Suggested category: accept it, or go pick another (issue #315)

    ↳ `{#if n.notificationType === 'supplier_category_suggested'}`

### `src/lib/components/mobile/MobileAlerts.svelte`

**`markup`**

- Summary chips

    ↳ `<div style="display: flex; gap: 8px; flex-wrap: wrap; padding-top: 4px;">`
- Overdue section

    ↳ `{#if overdue.length}`
- Due soon section

    ↳ `{#if due_soon.length}`

### `src/lib/components/mobile/MobileAnalyticsPrices.svelte`

**`markup`**

- Search

    ↳ `<div style="padding: 0 18px 10px; position: relative;">`
- Filter chips

    ↳ `<div style="display: flex; gap: 6px; padding: 0 18px 12px; overflow-x: auto; flex-shrin…`
- Summary 2-col

    ↳ `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">`
- Price items list

    ↳ `{#if filtered.length === 0}`

### `src/lib/components/mobile/MobileAnalyticsSpend.svelte`

**`const SERIES_COLORS`**

- Spend donut — top 5 + "Other", fixed categorical hue order (never cycled)

    ↳ `const SERIES_COLORS = ['var(--mep-series-1)', 'var(--mep-series-2)', 'var(--mep-series-…`

**`markup`**

- Period picker chips

    ↳ `<div style="display: flex; gap: 6px; padding-top: 4px;">`
- KPI 2-col grid

    ↳ `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">`
- Top items

    ↳ `{#if top_items?.length > 0}`
- By category

    ↳ `{#if category_spend?.length > 0}`

### `src/lib/components/mobile/MobileDashboard.svelte`

**`const currentMonthStr`**

- Period picker (self-contained — reads URL, generates prev/next links)

    ↳ `const currentMonthStr = $derived(toMonthStr(new Date()));`

**`markup`**

- Mobile-only wrapper, full height, scroll with bottom clearance

    ↳ `<div style="height: 100%; overflow: auto; padding-bottom: 24px;">`
- Greeting + period picker

    ↳ `<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">`
- Hero spend card

    ↳ `<div class="card" style="padding: 16px;">`
- Alert tile (only when there are high/med alerts)

    ↳ `{#if highAlerts + medAlerts > 0}`
- 2-col KPI row

    ↳ `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">`
- Top suppliers

    ↳ `{#if topSuppliers.length > 0}`
- Recent invoices

    ↳ `{#if recentInvoices.length > 0}`

### `src/lib/components/mobile/MobileInvoiceDetail.svelte`

**`markup`**

- Sticky header

    ↳ `<div style="`
- Scrollable content

    ↳ `<div style="flex: 1; overflow: auto; padding: 14px 14px 100px; display: flex; flex-dire…`
- Hero total card

    ↳ `<div class="card" style="padding: 16px;">`
- Doc preview card

    ↳ `{#if invoice.source_file}`
- Line items

    ↳ `{#if lineItems.length > 0}`
- Action grid

    ↳ `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">`

### `src/lib/components/mobile/MobileInvoiceList.svelte`

**`const grouped`**

- Group by date label

    ↳ `const grouped = $derived.by(() => {`

**`markup`**

- Search

    ↳ `<div style="padding: 0 18px 10px; position: relative;">`
- Filter chips

    ↳ `<div style="display: flex; gap: 6px; padding: 0 18px 12px; overflow-x: auto; flex-shrin…`
- Grouped invoice list

    ↳ `<div style="flex: 1; overflow: auto; padding-bottom: 24px;">`

### `src/lib/components/mobile/MobileSuppliersList.svelte`

**`markup`**

- Search

    ↳ `<div style="padding: 0 18px 10px; position: relative;">`
- Category chips

    ↳ `<div style="display: flex; gap: 6px; padding: 0 18px 12px; overflow-x: auto; flex-shrin…`
- Summary strip

    ↳ `<div class="card" style="margin: 0 18px 12px; padding: 10px 14px; flex-shrink: 0; displ…`
- List

    ↳ `<div style="flex: 1; overflow: auto; padding: 0 18px 24px; display: flex; flex-directio…`

### `src/lib/components/mobile/MobileTabBar.svelte`

**`markup`**

- Raised upload button

    ↳ `<a href="/" style="`

### `src/lib/components/PriceTrendSparkline.svelte`

**`const color`**

- Rising price trend = green per spec (issue #26)

    ↳ `if (diff > 0) return '#22c55e';`

**`const risingStreak`**

- Consistent upward trend: every month higher than previous

    ↳ `const risingStreak = $derived.by(() => {`

### `src/lib/components/TrendChart.svelte`

**`const buckets`**

- SSR'd by the dashboard load (issue: dashboard chart flashed "Loading…" on every visit because it fetched client-side in onMount instead of using data already computed server-side). Only re-fetches when a range/granularity toggle is used — the initial render is fully server-rendered.

**`function fetchData`**

- Don't leave stale buckets on screen mismatched against the newly selected range/granularity

    ↳ `buckets    = [];`

**`const SVG_W`**

- SVG layout (pixel-based, viewBox width=500 for easy math)

    ↳ `const SVG_W    = 500;`

**`const PAD_R`**

- wider left padding for Y-axis labels

    ↳ `const PAD_R    = 8;`

**`const maxTotal`**

- fraction of slot used as gap

    ↳ `const maxTotal = $derived(buckets.length ? Math.max(...buckets.map(b => b.total), 1) : 1);`

**`markup`**

- Chart area

    ↳ `<div style="padding:4px 0 0;position:relative;">`
- Gridlines + Y-axis labels

    ↳ `{#each gridLines as gl}`
- Bars

    ↳ `{#each barRects.segs as seg}`
- X-axis labels

    ↳ `{#each barRects.labels as lbl}`
- Legend

    ↳ `{#if categories.length > 0}`

### `src/lib/components/UploadPanel.svelte`

**`const localError`**

- Client-side problems (oversized file, offline queue full, failed upload) used to go through native alert(): modal, unstyled, wrong locale, and invisible to the page. They now feed the same banner as server errors (issue #233). Transient ones clear themselves.

    ↳ `let localError = $state<string | null>(null);`

**`const serverError`**

- Server actions return i18n keys, not prose (issue #294); `$t` falls back to the key itself, so an unexpected string still renders rather than vanishing.

    ↳ `const serverError = $derived.by(() => {`

**`const DB_NAME`**

- ── IndexedDB helpers

    ↳ `const DB_NAME = 'mise-offline-queue';`

**`function removeFromOfflineQueue`**

- ignore

    ↳ `}`

**`function addFiles`**

- ── File helpers

    ↳ `function addFiles(newFiles: FileList | null) {`

**`function openCamera`**

- ── Camera capture flow The camera opens straight away: the framing tip used to be a blocking bottom sheet *before* the first capture, which is the worst moment to read it. It now rides along as a caption on the photo-confirm overlay, where the user can act on it by retaking (issue #230).

    ↳ `function openCamera() {`

**`function uploadWithProgress`**

- ── Upload with progress and offline fallback

    ↳ `function uploadWithProgress(fd: FormData): Promise<string | null> {`
- The action's payload carries an i18n key + vars (issue #294).

    ↳ `if (result.data?.error) {`

**`function doUpload`**

- Client-side navigation keeps the app shell (and the user's momentum) intact — a hard reload here re-runs every layout query for nothing.

    ↳ `await goto(loc, { invalidateAll: true });`

**`const onOnline`**

- ── Lifecycle

    ↳ `$effect(() => {`

**`markup`**

- ── Mobile upload

    ↳ `<div class="md:hidden flex flex-col" style="height:100%;overflow:hidden;">`
- Compact step indicator (shared with /batch/[id] — issue #232)

    ↳ `<div style="padding:0 18px 10px;flex-shrink:0;">`
- Alerts

    ↳ `{#if data.saved || data.duplicate || errorMsg}`
- Offline banner

    ↳ `{#if offlineBanner}`
- Scrollable body

    ↳ `<div style="flex:1;overflow-y:auto;padding:0 18px 0;display:flex;flex-direction:column;…`
- Upload zone

    ↳ `<div class="card" data-coach="upload-zone" style="padding:16px;">`
- svelte-ignore a11y_no_static_element_interactions

    ↳ `<div`
- Camera + Browse buttons

    ↳ `<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">`
- Hidden file input

    ↳ `<input`
- File queue

    ↳ `<div class="card" style="padding:14px 14px 10px;">`
- Sticky extract button

    ↳ `<div style="padding:12px 18px 24px;border-top:1px solid var(--mep-divider);background:v…`
- ── Desktop upload

    ↳ `<div class="hidden md:flex flex-col" style="height:100%;overflow:hidden;">`
- 3-step indicator (shared with /batch/[id] — issue #232)

    ↳ `<div style="padding:20px 32px 0;flex-shrink:0;">`
- Alerts

    ↳ `{#if data.saved || data.duplicate || errorMsg}`
- Two-column grid

    ↳ `<div style="flex:1;min-height:0;padding:16px 32px 24px;display:grid;grid-template-colum…`
- Left: Drop zone

    ↳ `<div class="card" data-coach="upload-zone" style="padding:20px;display:flex;flex-direct…`
- svelte-ignore a11y_no_static_element_interactions

    ↳ `<div`
- Right: Queue

    ↳ `<div class="card" style="padding:16px 16px 12px;display:flex;flex-direction:column;">`
- Extract button

    ↳ `<div style="padding-top:12px;border-top:1px solid var(--mep-divider);margin-top:12px;">`
- Camera input — always in DOM, shared by both layouts

    ↳ `<input`
- ── Mobile overlays
- Image preview overlay (mobile only)

    ↳ `{#if previewUrl}`
- Framing tip, folded in here from the old pre-capture sheet (#230): at this point the photo exists, so "retake" is a real option.

    ↳ `<div style="display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--me…`

## Client stores

### `src/lib/stores/tutorial.ts`

**`function setTutorialStep`**

- fire-and-forget — UI already updated

    ↳ `}`

## Shared library

### `src/lib/constants.ts`

**`const UNCATEGORIZED_CATEGORY`**

- Canonical category taxonomy — single source of truth for the whole app. Suppliers (suppliers.category) and budgets (category_budgets.category) MUST store one of these exact strings. The synth seed generators and a guard test (tests/category-taxonomy.test.ts) enforce this; do not diverge.

    ↳ `/**`
- Bucket for suppliers nobody has categorised (issue #301). Stored, not fabricated per query: `getOrCreateSupplierId` writes it on creation, the budget check and analytics coalesce legacy NULLs into it, and the UI renders it as "Sin categoría" / "Uncategorised" rather than as a literal category.

    ↳ `export const UNCATEGORIZED_CATEGORY = 'Other';`

**`const MIN_CATEGORY_CONFIDENCE`**

- Confidence floor for a machine-proposed category (issue #315). Matches the "below 0.60 = poor quality, missing, or illegible" band the extraction prompt already defines: under it the model is telling us the document was barely readable, and a coin-flip category is worse than an honest "Other".

    ↳ `export const MIN_CATEGORY_CONFIDENCE = 0.6;`

**`function categoryKey`**

- Case- and accent-insensitive lookup key, so 'lacteos' finds 'Lácteos'.

    ↳ `function categoryKey(value: string): string {`

**`function resolveSupplierCategory`**

- The only door into `suppliers.category` for a machine-proposed value (issue #315).

    Extraction asks Gemini for one exact string from VALID_CATEGORIES, but a model will also return a translation, an invented category, or an unaccented lower-cased variant. This maps a recognisable spelling back onto its canonical string and turns *everything* else — including a guess the model itself reports as low-confidence — into the uncategorised bucket, so a bad guess degrades into "Other" plus the existing categorisation nudge instead of poisoning the taxonomy the budgets page groups on.

    Always returns a member of VALID_CATEGORIES; never null, never a new string.

    @param confidence Model-reported confidence. Absent or non-numeric means the model didn't report one (older prompt cache, dropped field) — that falls back to trusting the taxonomy match rather than discarding a good category.

    ↳ `export function resolveSupplierCategory(raw: unknown, confidence?: number | null): stri…`

**`function categorySlug`**

- i18n-key suffix for a canonical category (issue #338): accent-stripped, lower-cased, non-alphanumerics collapsed to hyphens, so 'Café y Bebidas Calientes' → 'cafe-y-bebidas-calientes'.

    Storage still uses the canonical Spanish string; this only builds the `category.*` lookup key used at display time by `tcat`.

    ↳ `export function categorySlug(value: string): string {`

### `src/lib/formatters.ts`

**`function fmtEur`**

- Full precision EUR: 1234.56 → "1.234,56 €"

    ↳ `export function fmtEur(n: number): string {`

**`function fmtEurCompact`**

- Rounded EUR: 1234.56 → "1.235 €"

    ↳ `export function fmtEurCompact(n: number): string {`

**`const BUDGET_WARN_PCT`**

- Matches the budget_warning_threshold default in the settings table (80 %).

    ↳ `const BUDGET_WARN_PCT = 80;`

**`function semColor`**

- Traffic-light color for a budget percentage (0-100+).

    ↳ `export function semColor(pct: number): string {`

**`function fmtDate`**

- Full date with year: "19 may 2024"

    ↳ `export function fmtDate(d: string | null, locale = 'es-ES'): string {`

**`function fmtDateShort`**

- Short date without year: "19 may"

    ↳ `export function fmtDateShort(d: string | null, locale = 'es-ES'): string {`

**`function initials`**

- "AB" initials from a name

    ↳ `export function initials(name: string): string {`

**`function toMonthStr`**

- "2024-05" from a Date

    ↳ `export function toMonthStr(d: Date): string {`

**`function shiftMonth`**

- Shift a "YYYY-MM" string by delta months

    ↳ `export function shiftMonth(ym: string, delta: number): string {`

**`function parseMonthParam`**

- Validate a "?month=YYYY-MM" query param, clamped to not-future

    ↳ `export function parseMonthParam(param: string | null, currentMonth: string): string {`

### `src/lib/i18n.ts`

**`property es`**

- Error boundary

    ↳ `'boundary.failed':       'Este panel no se pudo mostrar.',`
- Navigation

    ↳ `'nav.dashboard':         'Resumen',`
- Actions

    ↳ `'action.upload':         'Subir factura',`
- Shell

    ↳ `'shell.quota':           'facturas este mes',`
- Dashboard page

    ↳ `'dashboard.title':       'Resumen',`
- Invoice list page

    ↳ `'inv.title':           'Facturas',`
- Table headers

    ↳ `'tbl.supplier':    'Proveedor',`
- Status labels

    ↳ `'status.pending':   'Por revisar',`
- Chat widget

    ↳ `'chat.title':          'Consulta tus datos',`
- Suppliers page

    ↳ `'sup.empty':        'Sin proveedores todavía. Sube una factura para añadir uno.',`
- Budgets page

    ↳ `'bud.monthlyTitle':  'Presupuestos mensuales por categoría',`
- Reminders page

    ↳ `'rem.empty':        'Sin facturas pendientes en los próximos 7 días.',`
- Analytics / spend

    ↳ `'spend.pageTitle':      'Análisis de gasto',`
- Analytics / prices

    ↳ `'prices.pageTitle':       'Seguimiento de precios',`
- Settings Multi-location (issue #290)

    ↳ `'nav.location':               'Local',`
- WhatsApp bot — números autorizados

    ↳ `'set.whatsapp.title':            'Facturas por WhatsApp',`
- WhatsApp bot — cómo contactar con el bot (issue #319)

    ↳ `'set.whatsapp.numberLabel':      'Envía las facturas a este número:',`
- WhatsApp bot — alta por código de emparejamiento (issue #320)

    ↳ `'set.whatsapp.pairDesc':         'O genera un código: quien lo envíe al bot desde su mó…`
- Profile management (issue #293)

    ↳ `'set.profile.title':          'Perfil',`
- Upload page

    ↳ `'upload.title':     'Subir factura',`
- Confirm / review files

    ↳ `'confirm.title':     'Revisar archivos',`
- Confidence levels

    ↳ `'conf.high':   'alta',`
- Extract / review extraction

    ↳ `'extract.confidence':  'confianza',`
- Edit invoice

    ↳ `'edit.pageTitle':  'Editar factura',`
- Export

    ↳ `'export.title':       'Exportar facturas',`
- Save confirmation

    ↳ `'saved.title':         'Factura guardada correctamente',`
- Form field labels (shared across upload flow / edit)

    ↳ `'field.supplier':      'Proveedor',`
- Login page

    ↳ `'login.welcome':     'Bienvenido de nuevo',`
- Password recovery (issue #284)

    ↳ `'forgot.title':         'Recuperar contraseña',`
- Invoice detail page

    ↳ `'inv.detail.noFile':        'Sin documento adjunto',`
- Pending review page

    ↳ `'pend.processing':     'Procesando factura con IA…',`
- Misc

    ↳ `'misc.invoices':   'facturas',`
- Upload flow — 3-step wizard

    ↳ `'steps.upload':            'Subir',`
- Upload page — drop zone & queue

    ↳ `'upload.dropHeadline':     'Suelta tus facturas aquí',`
- Mobile camera capture

    ↳ `'upload.cameraBtn':        'Tomar foto',`
- Confirm page — extraction stages

    ↳ `'confirm.stage.read':      'Leyendo documento',`
- Confirm page — queue & actions

    ↳ `'confirm.addFile':         'Añadir archivos',`
- Extract page — confidence badges

    ↳ `'extract.badge.high':      'alta confianza',`
- Extract page — header / actions

    ↳ `'extract.error':                 'Error de extracción',`
- Upload action errors — returned as keys by the server (issue #294)

    ↳ `'upload.err.formParse':      'No se pudieron leer los datos del formulario. Inténtalo d…`
- Extract page — form

    ↳ `'extract.header':          'Cabecera',`
- Extract page — totals / validation

    ↳ `'extract.discrepancy':     'Discrepancia',`
- Coach mark

    ↳ `'coach.next':              'Entendido →',`
- Notification bell

    ↳ `'notif.title':             'Alertas',`
- Settings — tour & privacy

    ↳ `'set.tourTitle':           'Tour guiado',`
- Dashboard

    ↳ `'dash.firstInvoice':       'Procesa tu primera factura',`
- Pending review page

    ↳ `'pending.processing':      'Procesando factura con IA…',`
- Onboarding page

    ↳ `'onboard.title':           'Bienvenido',`
- Supplier detail

    ↳ `'action.delete':           'Eliminar',`
- Guided tour (coach marks in app layout)

    ↳ `'tour.step1.title':        'Sube tu primera factura',`
- App-wide tour nudge + steps 3-11 (dashboard through settings)

    ↳ `'tour.nudge.title':        '¿Seguimos?',`
- Pluralized / interpolated forms (issue #146)

    ↳ `'misc.invoice.zero':            'Sin facturas',`
- Batch / multi-invoice review page

    ↳ `'batch.queue.ready':            'Lista para revisar',`
- Footer / accessibility labels / errors

    ↳ `'footer.privacy':               'Privacidad',`
- Billing page

    ↳ `'billing.title':                'Facturación',`
- Login / onboarding meta

    ↳ `'login.metaDesc':               'Inicia sesión en Mise en Place para gestionar las fact…`
- Signup page

    ↳ `'signup.metaTitle':             'Crear cuenta',`
- Analytics / spend — desktop & mobile (i18n completion)

    ↳ `'spend.period.allShort':        'Todo',`
- Analytics / prices — desktop & mobile

    ↳ `'prices.question':              '¿Qué precios están cambiando?',`
- Analytics / extraction

    ↳ `'extract.pageTitle':            'Extracción IA',`
- Budgets page

    ↳ `'bud.tableTitle':               'Presupuesto por categoría',`
- Supplier detail (mobile page)

    ↳ `'sup.back':                     'Proveedores',`
- Suppliers list (desktop & mobile)

    ↳ `'sup.searchPlaceholder':        'Buscar proveedor o categoría…',`
- Mobile invoice detail

    ↳ `'mid.totalVat':                 'Total con IVA',`
- Mobile invoice list

    ↳ `'mil.searchPlaceholder':        'Buscar N.º, proveedor…',`
- Mobile dashboard

    ↳ `'mdash.morning':                'Buenos días',`
- Desktop dashboard

    ↳ `'ddash.firstInvoiceTitle':      'Tu primera factura está guardada',`
- Sparkline tooltip

    ↳ `'spark.risingTrend':            'Los precios llevan subiendo 3+ meses — considera una c…`
- Remaining UI chrome (suppliers, invoice viewer, chat, a11y)

    ↳ `'common.search':                'Buscar',`
- Internal admin area

    ↳ `'admin.banner':                 'Admin',`
- Mobile alerts list

    ↳ `'malert.overdueCount':          'vencidas',`
- Products (CRUD, catalog)

    ↳ `'prod.title':                    'Catálogo de productos',`

**`property en`**

- Error boundary

    ↳ `'boundary.failed':       'This panel failed to load.',`
- Navigation

    ↳ `'nav.dashboard':         'Dashboard',`
- Actions

    ↳ `'action.upload':         'Upload invoice',`
- Shell

    ↳ `'shell.quota':           'invoices this month',`
- Dashboard page

    ↳ `'dashboard.title':       'Dashboard',`
- Invoice list page

    ↳ `'inv.title':           'Invoices',`
- Table headers

    ↳ `'tbl.supplier':    'Supplier',`
- Status labels

    ↳ `'status.pending':   'To review',`
- Chat widget

    ↳ `'chat.title':          'Ask your data',`
- Suppliers page

    ↳ `'sup.empty':        'No suppliers yet. Upload an invoice to add one.',`
- Budgets page

    ↳ `'bud.monthlyTitle':  'Monthly Category Budgets',`
- Reminders page

    ↳ `'rem.empty':        'No pending invoices due in the next 7 days.',`
- Analytics / spend

    ↳ `'spend.pageTitle':      'Spend Analysis',`
- Analytics / prices

    ↳ `'prices.pageTitle':       'Price Tracking',`
- Settings Multi-location (issue #290)

    ↳ `'nav.location':               'Location',`
- WhatsApp bot — authorised numbers

    ↳ `'set.whatsapp.title':            'Invoices by WhatsApp',`
- WhatsApp bot — how to reach it (issue #319)

    ↳ `'set.whatsapp.numberLabel':      'Send invoices to this number:',`
- WhatsApp bot — enrolment by pairing code (issue #320)

    ↳ `'set.whatsapp.pairDesc':         'Or generate a code: whoever sends it to the bot from …`
- Profile management (issue #293)

    ↳ `'set.profile.title':          'Profile',`
- Upload page

    ↳ `'upload.title':     'Upload Invoice',`
- Confirm / review files

    ↳ `'confirm.title':     'Review Files',`
- Confidence levels

    ↳ `'conf.high':   'high',`
- Extract / review extraction

    ↳ `'extract.confidence':  'confidence',`
- Edit invoice

    ↳ `'edit.pageTitle':  'Edit Invoice',`
- Export

    ↳ `'export.title':       'Export Invoices',`
- Save confirmation

    ↳ `'saved.title':         'Invoice saved successfully',`
- Form field labels (shared across upload flow / edit)

    ↳ `'field.supplier':      'Supplier',`
- Login page

    ↳ `'login.welcome':     'Welcome back',`
- Password recovery (issue #284)

    ↳ `'forgot.title':         'Reset your password',`
- Invoice detail page

    ↳ `'inv.detail.noFile':        'No document attached',`
- Pending review page

    ↳ `'pend.processing':     'Processing invoice with AI…',`
- Misc

    ↳ `'misc.invoices':   'invoices',`
- Upload flow — 3-step wizard

    ↳ `'steps.upload':            'Upload',`
- Upload page — drop zone & queue

    ↳ `'upload.dropHeadline':     'Drop your invoices here',`
- Mobile camera capture

    ↳ `'upload.cameraBtn':        'Take Photo',`
- Confirm page — extraction stages

    ↳ `'confirm.stage.read':      'Reading document',`
- Confirm page — queue & actions

    ↳ `'confirm.addFile':         'Add files',`
- Extract page — confidence badges

    ↳ `'extract.badge.high':      'high confidence',`
- Extract page — header / actions

    ↳ `'extract.error':                 'Extraction error',`
- Upload action errors — returned as keys by the server (issue #294)

    ↳ `'upload.err.formParse':      'Could not read the form data. Please try again.',`
- Extract page — form

    ↳ `'extract.header':          'Header',`
- Extract page — totals / validation

    ↳ `'extract.discrepancy':     'Discrepancy',`
- Coach mark

    ↳ `'coach.next':              'Got it →',`
- Notification bell

    ↳ `'notif.title':             'Alerts',`
- Settings — tour & privacy

    ↳ `'set.tourTitle':           'Guided tour',`
- Dashboard

    ↳ `'dash.firstInvoice':       'Process your first invoice',`
- Pending review page

    ↳ `'pending.processing':      'Processing invoice with AI…',`
- Onboarding page

    ↳ `'onboard.title':           'Welcome',`
- Supplier detail

    ↳ `'action.delete':           'Delete',`
- Guided tour (coach marks in app layout)

    ↳ `'tour.step1.title':        'Upload your first invoice',`
- App-wide tour nudge + steps 3-11 (dashboard through settings)

    ↳ `'tour.nudge.title':        'Want the full tour?',`
- Pluralized / interpolated forms (issue #146)

    ↳ `'misc.invoice.zero':            'No invoices',`
- Batch / multi-invoice review page

    ↳ `'batch.queue.ready':            'Ready to review',`
- Footer / accessibility labels / errors

    ↳ `'footer.privacy':               'Privacy',`
- Billing page

    ↳ `'billing.title':                'Billing',`
- Login / onboarding meta

    ↳ `'login.metaDesc':               'Sign in to Mise en Place to manage your supplier invoi…`
- Signup page

    ↳ `'signup.metaTitle':             'Create account',`
- Analytics / spend — desktop & mobile (i18n completion)

    ↳ `'spend.period.allShort':        'All',`
- Analytics / prices — desktop & mobile

    ↳ `'prices.question':              'Which prices are changing?',`
- Analytics / extraction

    ↳ `'extract.pageTitle':            'AI Extraction',`
- Budgets page

    ↳ `'bud.tableTitle':               'Budget by category',`
- Supplier detail (mobile page)

    ↳ `'sup.back':                     'Suppliers',`
- Suppliers list (desktop & mobile)

    ↳ `'sup.searchPlaceholder':        'Search supplier or category…',`
- Mobile invoice detail

    ↳ `'mid.totalVat':                 'Total with VAT',`
- Mobile invoice list

    ↳ `'mil.searchPlaceholder':        'Search no., supplier…',`
- Mobile dashboard

    ↳ `'mdash.morning':                'Good morning',`
- Desktop dashboard

    ↳ `'ddash.firstInvoiceTitle':      'Your first invoice is saved',`
- Sparkline tooltip

    ↳ `'spark.risingTrend':            'Prices have been rising for 3+ months — consider a pri…`
- Remaining UI chrome (suppliers, invoice viewer, chat, a11y)

    ↳ `'common.search':                'Search',`
- Internal admin area

    ↳ `'admin.banner':                 'Admin',`
- Mobile alerts list

    ↳ `'malert.overdueCount':          'overdue',`
- Products (CRUD, catalog)

    ↳ `'prod.title':                    'Product catalog',`

**`const ti`**

- Interpolating translator: resolves a key and substitutes named placeholders written as `{name}` in the translation table.

    $ti('saved.desc', { id: 42 }) → 'Invoice #42 has been stored…' $ti('upload.imageTooLarge', { mb: 20 }) → 'Image exceeds the 20 MB limit'

    Reactive — use as `$ti(...)` in components so it follows locale changes.

    ↳ `export const ti = derived(`

**`const tcat`**

- Display-time translator for canonical category values (issue #338).

    VALID_CATEGORIES is a Spanish-language taxonomy that doubles as stored data and as the grouping key for budgets and analytics, so it must never be translated on the way *in*. This resolves `category.<slug>` at render time instead, which is the only place the taxonomy is allowed to change language.

    $tcat('Bebidas') → 'Bebidas' (es) / 'Beverages' (en) $tcat('Other') → 'Sin categoría' / 'No category' $tcat(null) → same as 'Other'

    An unknown value — a custom budget category, or a taxonomy entry added before its translations — falls back to the canonical string, never to a raw i18n key.

    ↳ `export const tcat = derived(t, ($t) => (canonical: string | null | undefined): string =>…`

**`const tiv`**

- `ti` plus category awareness: interpolates as usual, but routes a var named `category` through `tcat` first.

    Notification and alert payloads (`messageVars`) carry the canonical category so the stored row stays language-neutral; every message that renders one — catSuggested, budgetExceeded, budgetWarning, the dashboard budget alert — needs it translated at display time. Rendering sites (NotificationBell, AlertRow) use `$tiv` instead of `$ti` so this cannot be forgotten per message type.

    ↳ `export const tiv = derived(`

**`const tp`**

- Pluralizing translator: picks the right plural form for `count` and interpolates the count as `{n}`.

    $tp('misc.invoice', 0) → 'misc.invoice.zero' (only if that form exists) $tp('misc.invoice', 1) → 'misc.invoice.one' → '1 invoice' $tp('misc.invoice', 3) → 'misc.invoice.other' → '3 invoices'

    The optional `.zero` form lets a language phrase the empty case naturally ("No invoices" / "Sin facturas"); when absent, count 0 falls back to the `.other` form.

    ↳ `export const tp = derived(`

### `src/lib/index.ts`

**_module level_**

- place files you want to import through the `$lib` alias in this folder.

### `src/lib/phone.ts`

**`const DEFAULT_COUNTRY_CODE`**

- Phone-number normalisation for the WhatsApp bot allow-list.

    Shared (not `$lib/server/`) because the settings UI formats numbers for display while the server normalises them for storage — both need the same rules or a number shown as valid would fail to match on the way in.

    Storage format is the one Meta delivers in the webhook `from` field: E.164 **without** the leading '+', e.g. "34612345678".

    ↳ `/**`
- Default country code applied to bare national numbers. The product is Spain-first and staff type "612 345 678", not "+34 612 345 678"; a 9-digit Spanish number is unambiguous, so we complete it rather than reject it.

    ↳ `export const DEFAULT_COUNTRY_CODE = '34';`

**`const MIN_DIGITS`**

- E.164 allows at most 15 digits; below ~8 nothing is a real mobile number.

    ↳ `const MIN_DIGITS = 8;`

**`function normalizePhoneNumber`**

- Normalise user input to Meta's wire format: digits only, no '+', country code included. Accepts "+34 612 345 678", "0034-612345678", "612 345 678".

    ↳ `export function normalizePhoneNumber(input: string): NormalizeResult {`
- "0034…" is the international prefix written out; strip it before the length checks so it isn't mistaken for extra significant digits.

    ↳ `if (digits.startsWith('00')) digits = digits.slice(2);`
- A bare national number gets the default country code. Done before the minimum-length check so a valid 9-digit Spanish mobile isn't rejected.

    ↳ `if (digits.length === SPANISH_NATIONAL_LENGTH) digits = DEFAULT_COUNTRY_CODE + digits;`

**`function waMeLink`**

- Click-to-chat URL for a stored number (issue #319).

    wa.me wants digits only and rejects a leading '+', which is exactly the shape we already store — so this is deliberately the same value the bot matches on, and a link that opens the wrong chat would mean the allow-list is wrong too.

    ↳ `export function waMeLink(phone: string): string {`

**`function formatPhoneNumber`**

- Format for display: "+34 612 345 678" — storage stays digits-only.

    ↳ `export function formatPhoneNumber(phone: string): string {`

### `src/lib/pwa.ts`

**`function registerPWA`**

- Registers the Workbox-generated service worker produced by vite-plugin-pwa. Called from +layout.svelte onMount so it runs only in the browser.

    We avoid injectRegister:'auto' from the plugin because SvelteKit's mode:'hash' CSP computes hashes at SSR time and won't cover a script injected post-build by Vite. Registering here from a compiled module is CSP-safe — no inline script needed.

    ↳ `export function registerPWA(): void {`
- vite-plugin-pwa only emits sw.js during production builds.

    ↳ `if (import.meta.env.DEV) return;`
- When a new SW version is waiting, send SKIP_WAITING so it activates immediately. vite-plugin-pwa's generateSW includes a SKIP_WAITING message listener when registerType:'autoUpdate'.

    ↳ `reg.addEventListener('updatefound', () => {`
- Non-fatal — app works normally without a SW.

    ↳ `console.warn('[pwa] Service worker registration failed:', err);`

### `src/lib/sentry-scrub.ts`

**`const SENSITIVE_PARAMS`**

- Sentry PII scrubbing shared by the server and client inits (issue #254).

    Sentry attaches the request URL to events. Auth flows put short-lived secrets in the query string — `/auth/callback?code=…` (a live OAuth code), password-reset `token`s, and `email` — so an error during callback processing would ship them to a third party. Redact those params in place before the event leaves the process.

    ↳ `const SENSITIVE_PARAMS = ['code', 'token', 'access_token', 'refresh_token', 'email'];`

**`function scrubUrl`**

- Redacts sensitive query params from a URL string. Returns it unchanged on parse failure.

    ↳ `export function scrubUrl(rawUrl: string): string {`
- Support relative URLs by resolving against a dummy origin.

    ↳ `const url = new URL(rawUrl, 'http://scrub.local');`

**`function scrubSentryEvent`**

- Scrubs the request URL on a Sentry event (mutates and returns it).

    ↳ `export function scrubSentryEvent<T extends { request?: { url?: string } }>(event: T): T {`

### `src/lib/status.ts`

**`function confColor`**

- Confidence score → CSS colour variable.

    ↳ `export function confColor(c: number | undefined | null): string {`

### `src/lib/utils.ts`

**`type WithElementRef`**

- Re-exported for shadcn-svelte components (bits-ui internal types)

    ↳ `export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | nu…`

## App shell, hooks, workers

### `src/app.d.ts`

**_module level_**

- interface Error {} interface PageData {} interface PageState {} interface Platform {}

    ↳ `}`

### `src/backfill-products.ts`

**`const all`**

- One-off backfill: link products + compute pack fields on existing line items (follow-up to #298/#299). Run once after deploying the catalog/pack features:

    pnpm db:backfill-products

    Deterministic and idempotent — safe to re-run. Uses the same env as the web process / worker (DATABASE_URL etc.); dotenv loads .env in dev.

    ↳ `import 'dotenv/config';`

### `src/hooks.client.ts`

**`property beforeSend`**

- Strip live OAuth codes / tokens / emails from attached request URLs (#254).

    ↳ `beforeSend: (event) => scrubSentryEvent(event),`

### `src/hooks.server.ts`

**`method beforeSend`**

- Drop intentional SvelteKit redirects — not errors

    ↳ `if (event.exception?.values?.some(v => v.type === 'Redirect')) return null;`
- Strip live OAuth codes / tokens / emails from attached request URLs.

    ↳ `return scrubSentryEvent(event);`

**`const handle`**

- adapter-node resolves getClientAddress() from the socket peer unless ADDRESS_HEADER names the header the proxy sets. Behind nginx/Caddy that means every visitor shares one rate-limit bucket, so the IP-keyed limits on login/signup/waitlist collapse into a global one (issue #223).

    ↳ `if (process.env['NODE_ENV'] === 'production' && !process.env['ADDRESS_HEADER']) {`
- Attach Supabase server client (handles cookie-based session)

    ↳ `event.locals.supabase = createSupabaseServerClient(event.cookies);`
- Resolve authenticated user (validates JWT, not just cookie). Wrap in try-catch: Supabase auth-js retries on network failure and each retry attempt surfaces as a TypeError; catching here silences the flood in local dev when the remote Supabase project is unreachable.

    ↳ `let user: App.Locals['user'] = null;`
- Network unreachable — treat as unauthenticated

    ↳ `}`
- Resolve active restaurant for this request

    ↳ `if (user) {`
- Use cookie preference if valid, else first restaurant

    ↳ `event.locals.restaurantId = (activeCookie && ids.includes(activeCookie))`
- Request-level admin guard — defence in depth for the (admin) layout load, which does not rerun on every child navigation.

    ↳ `if ((path === '/admin' || path.startsWith('/admin/')) && !isAdminUser(event.locals.user…`
- Anonymous hit on the apex goes to the landing page, not the login wall (issue #291). Deep links keep the redirectTo round-trip below.

    ↳ `if (path === '/' && !event.locals.user) {`

**`property filterSerializedResponseHeaders`**

- Required for Supabase to propagate Set-Cookie headers

    ↳ `filterSerializedResponseHeaders: (name) =>`

**`const handle`**

- Two routes are embedded in a same-origin <iframe> by the app itself — the batch review PDF preview (/api/upload/[id]/[file]) and the saved invoice detail PDF preview (/invoice/[id]/file). DENY would block the browser from rendering the app's own preview on both.

    ↳ `const isFramedByApp = path.startsWith('/api/upload/') || /^\/invoice\/[^/]+\/file$/.tes…`

**`function isPublicPath`**

- Password recovery (issue #284) — /reset-password is reached with a recovery session, but a used/expired link must render its own "request a new one" page rather than bounce to the login form.

    ↳ `path === '/forgot-password'             ||`

### `src/worker.ts`

**`property dsn`**

- Worker entry point — run alongside the web process.

    Dev: pnpm worker (vite-node with vite.worker.config.ts) Prod: node build/worker.js (built via pnpm build:worker)

    Requires all the same env vars as the web process (DATABASE_URL, GEMINI_API_KEY, etc.). In dev, dotenv/config loads .env automatically (first import below). In prod, the deployment platform injects env vars.
- Must be the first import — populates process.env from .env before any other module (db.ts etc.) is evaluated. ESM evaluates imports depth-first in source order, so this runs before queue.ts / sessions.ts / db.ts.

    ↳ `import 'dotenv/config';`
- The worker runs the core product loop (Gemini extraction) on a box nobody watches. Without Sentry a crash or every-job-failing state is invisible until a customer complains (issue #252). Same config as hooks.server.ts.

    ↳ `Sentry.init({`

**`function fatal`**

- An unexpected throw or rejection would otherwise kill the process silently. Report it, flush, then exit non-zero so the platform restarts the worker.

    ↳ `function fatal(kind: string): (err: unknown) => void {`

**`property ssl`**

- Same TLS policy as the web pool (issue #295) — this used to skip certificate verification unconditionally while the web process did not.

    ↳ `ssl: pgSslConfig(),`

**`property batchSize`**

- pg-boss v10+ no longer auto-creates queues; work() requires the queue to exist first. createQueue is idempotent.

    ↳ `await boss.createQueue(EXTRACTION_QUEUE);`
- batchSize 1 — extractions run strictly one-by-one. Parallel extraction multiplies Gemini rate-limit pressure and contradicts the sequential design.

    ↳ `await boss.work<ExtractionJobData>(`
- Low-priority LLM product normalization (issue #300). Best-effort — the handler swallows its own errors, so a failed suggestion never retries noisily.

    ↳ `await boss.work<NormalizeJobData>(`

**`function shutdown`**

- Cron-driven work — weekly digest, overdue reminders, trial notices and the deleted-file purge (issues #288/#289). Registered here because pg-boss holds the schedule in the database: whichever worker is up fires the occurrence.

    ↳ `await registerScheduledJobs(boss);`

---

## Appendix — directives kept in source

These comments were deliberately left in the code because a tool reads them.

| File | Line | Directive |
| --- | --- | --- |
| `src/lib/components/TrendChart.svelte` | 14 | `// svelte-ignore state_referenced_locally — intentional: seed once from prop defaults` |
| `src/lib/components/TrendChart.svelte` | 16 | `// svelte-ignore state_referenced_locally — intentional: seed once from prop defaults` |
| `src/lib/components/TrendChart.svelte` | 22 | `// svelte-ignore state_referenced_locally — intentional: seed once from props` |
| `src/lib/components/TrendChart.svelte` | 24 | `// svelte-ignore state_referenced_locally — intentional: seed once from props` |
| `src/lib/components/TrendChart.svelte` | 26 | `// svelte-ignore state_referenced_locally — intentional: seed once from props` |
| `src/lib/components/mep/NotificationBell.svelte` | 21 | `// svelte-ignore state_referenced_locally — intentional: seed once from prop` |
| `src/lib/server/rate-limiter.ts` | 12 | `// eslint-disable-next-line @typescript-eslint/no-explicit-any` |
| `src/lib/server/rate-limiter.ts` | 14 | `// eslint-disable-next-line @typescript-eslint/no-explicit-any` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 85 | `// svelte-ignore state_referenced_locally — reading the initial value is the point` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 93 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 95 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 97 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 99 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/batch/[id]/+page.svelte` | 101 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/chat/+page.svelte` | 17 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
| `src/routes/(app)/chat/+page.svelte` | 19 | `// svelte-ignore state_referenced_locally — intentional: seed from server-loaded data once` |
