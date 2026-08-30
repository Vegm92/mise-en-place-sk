# Routing and Navigation

All SvelteKit routes under `src/routes/`. The `(app)` and `(admin)` route groups
provide their shells via `+layout.server.ts` / `+layout.svelte`. Public pages sit
at the top level. A stale legacy page is noted where applicable.

## Route tree (abridged to real files)

```
src/routes/
├── +layout.server.ts                  # resolves the rendered locale from url + cookie
├── +layout.svelte                     # root layout (CSP/theme, locale context)
├── +error.svelte
├── (app)/                             # authenticated app shell
│   ├── +layout.server.ts              # tenancy, badges, quota, onboarding flag, sentry tag
│   ├── +layout.svelte                 # sidebar + header (nav, bell, chat FAB, locale)
│   ├── +error.svelte
│   ├── +page.server.ts                # upload action + landing redirect
│   ├── dashboard/                     # KPIs, trend, top suppliers, aging, alerts
│   ├── invoices/                      # list/filter/search; export subroute
│   │   └── export/                    # +page + download/+server.ts (.xlsx via exceljs)
│   ├── invoice/[id]/                  # detail (+ file/+server.ts preview PDF)
│   │   ├── edit/                      # edit + status actions (version-optimistic-locked)
│   ├── batch/[id]/                    # review/confirm; save/discard/queue actions
│   ├── confirm/[id]/                  # legacy redirect stub → /batch/[batchId]
│   ├── extract/[id]/                  # legacy redirect stub → /batch/[batchId]
│   ├── suppliers/                     # list + detail [id] (spend, reliability)
│   ├── products/                      # list + detail [id] (aliases, merge, conversions)
│   ├── recipes/                       # escandallos: list, sheet editor, A4 sheet, CSV, email (beta flag: recipes)
│   │   └── [id]/{,sheet/,cocina/,csv/} # editor · A4 costing sheet · kitchen sheet · CSV
│   ├── budgets/                       # limits + current-month spend (progress bars) (beta flag: budgets)
│   ├── reminders/                     # overdue/due-soon + alerts hub (mark-paid, accept/reject)
│   ├── analytics/
│   │   ├── spend/                     # MV-based spend analytics
│   │   ├── prices/                    # price evolution (gated: supplierScores)
│   │   └── extraction/                # extraction-quality dashboard
│   ├── digest/                        # weekly digest page (gated: weeklyDigest)
│   ├── chat/                          # chat history + sessions
│   ├── billing/                       # plans, checkout, portal (provisional prices)
│   ├── settings/                      # profile, restaurant, locations, WhatsApp pairing
│   │   └── confirm-email/             # change-email verification
│   ├── help/                          # static help centre: getting started, tips, FAQ, tour launcher
│   │                                  #   its tip list is also the guided tour's script (help-content.ts)
│   └── api/
│       ├── active-restaurant/+server.ts  # switch restaurant (validates membership)
│       ├── chat/+server.ts               # chat endpoint
│       ├── notifications/+server.ts      # GET pending / POST mark-sent
│       ├── product-aliases/+server.ts    # confirm/reject alias + dismiss
│       ├── stock-levels/+server.ts       # GET/PUT (gated: stockTracking; beta flag: stock)
│       ├── supplier-category/+server.ts  # set supplier category
│       ├── trend/+server.ts              # trend buckets (client refetch)
│       ├── tutorial/+server.ts           # persist tutorial step
│       └── unit-conversions/+server.ts   # upsert conversion factors
├── (admin)/                         # ops shell (gated by AUTH_ADMIN_EMAIL)
│   ├── +layout.server.ts            # isAdminUser gate → redirect '/'
│   └── admin/
│       ├── +page.server.ts          # overview: health, counts, recent events
│       ├── events/                  # system_notifications browser
│       ├── errors/                  # Sentry unresolved issues (REST)
│       ├── health/                  # system checks + row counts
│       ├── revenue/                 # MRR/ARPA/LTV/cohorts + cost tracking
│       ├── dead-letters/            # DLQ list, status, replay extraction jobs
│       └── feature-flags/           # toggle beta feature flags (recipes/stock/budgets/multiLocation)
├── api/
│   ├── auth/[...all]/+server.ts     # Auth.js catch-all (mounted at /auth)
│   ├── batch-status/[id]/+server.ts # extraction status polling (2.5 s poll)
│   ├── health/+server.ts            # liveness
│   ├── stripe-webhook/+server.ts    # signature-verified, deduped
│   ├── upload/[id]/[file]/+server.ts# serve upload session file (iframe preview)
│   ├── user/delete/+server.ts       # GDPR account deletion
│   ├── user/export/+server.ts       # GDPR JSON export
│   └── whatsapp/webhook/+server.ts  # Meta webhook (GET verify / POST HMAC)
├── login/ signup/ logout/ forgot-password/ reset-password/ verify-email/
├── onboarding/                      # first-run setup
├── waitlist/                        # public landing (es/en)
├── privacy/ terms/
└── robots.txt/ sitemap.xml/         # +server.ts
```

## Navigation model (authenticated shell)

- **Sidebar** (`(app)/+layout.svelte`): location switcher (multi-location),
  upload CTA, nav (dashboard, invoices+badge, suppliers, products,
  analytics submenu, budgets, reminders+badge, digest, chat), billing quota card
  (plan name + quota used/limit), settings, help, privacy/terms, user + logout.
- **Header**: mobile menu, ChatFab, ES/EN toggle, NotificationBell (top-5),
  theme toggle.
- **Nav badge** (`+layout.server.ts`): overdue invoices (status
  `pending`/`accepted`, `due_date < CURRENT_DATE`) + pending `budget_overage`
  with payload `level='exceeded'` — deliberately not the full pending count.
- **Onboarding gate**: supplier/product/analytics/budgets/digest/chat are hidden
  until `settings.has_completed_onboarding` (default `false`). The extract-save
  action checks the flag on every invoice save; while `false` it flips it to
  `true` and redirects to `/dashboard?first_invoice=1` instead of the normal
  save-confirmation route. The dashboard reads the query param for a one-time
  congratulations banner; upload and extract-review pages show tailored copy
  while the flag is `false`. The flag is server-side (DB), not session-based,
  so it persists across browsers; `(app)/+layout.server.ts` exposes it as
  `hasCompletedOnboarding` to every child page via layout data.

## Auth rules

- Public whitelist (`isPublicPath()` in `hooks.server.ts`): `/login`,
  `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`,
  `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`, `/api/health`,
  `/auth/*`, `/waitlist`, `/api/stripe-webhook`, `/api/whatsapp/webhook`.
- `/api/*` unauthenticated → 401 JSON; page unauthenticated → redirect
  `/login?redirectTo=...`.
- `/admin*` → `isAdminUser` (`AUTH_ADMIN_EMAIL`) else redirect `/`.

## Locale

The locale a page **renders** is resolved per request; the locale a user
**prefers** lives in the browser. They are separate mechanisms
([ADR-033](../06_decisions/experience/ADR-033-the-rendered-locale-is-request-state.md)).

- Precedence: `?lang=` → `mep-locale` cookie → `es`. No `Accept-Language`
  negotiation — it makes crawling nondeterministic.
- `hooks.server.ts` sets `event.locals.locale` and substitutes it into the
  `%mep.lang%` placeholder in `src/app.html`, so `<html lang>` is correct on
  every route including the app shell. An explicit `?lang=` is persisted to the
  cookie.
- `+layout.server.ts` (root) resolves again from `url` + `cookies` rather than
  reading `locals`, because SvelteKit only re-runs a load whose *tracked* inputs
  changed and `locals` is not one. The root `+layout.svelte` publishes the
  result as a Svelte context.
- Public pages (`waitlist/`, `l/[variant]/`) read that context. The
  authenticated app still reads the `locale` writable in `$lib/i18n.ts`; it is
  single-session and `noindex`, and `locale.set()` must never be called on the
  server.
- `?lang=` is provisional. GEO phase 2b gives English its own path
  (`/en/waitlist`) and `localeHref()` in `src/lib/locale-url.ts` is the one
  function that changes.

## Page → subsystem mapping

| Page | Feature spec | Data source |
|---|---|---|
| `batch/[id]` | `invoice_ingestion`, `invoice_confirmation` | `batch-core.ts` + `invoice-save.ts` |
| `invoices*`, `invoice/[id]*` | invoice management (see `invoice_confirmation.md`) | `invoices` + line items |
| `suppliers*` | `suppliers` | `suppliers` + `mv_supplier_monthly_spend` |
| `products*` | `products` | `products` + aliases + `mv_price_snapshots` |
| `recipes` | `recipes` | `recipes` + `recipe_items`, costed against `invoice_line_items` / `mv_price_snapshots` |
| `budgets` | `budgets` | `category_budgets` + live aggregation |
| `reminders` | `notifications` | `system_notifications` + invoices |
| `analytics/*` | `analytics` | `mv_*` views |
| `digest` | `digest` | `settings.weekly_digest_*` |
| `chat` | `chat` | `chat_sessions`/`chat_messages` |
| `billing` | `billing` | `subscriptions` + `billing-plans.ts` |
| `settings` | `whatsapp`, `billing`, auth | settings + `whatsapp_contacts` |
| `help` | — (documentation page) | static: `src/lib/help-content.ts` + `i18n.ts` |
| guided tour (shell overlay) | — | `src/lib/tour-gating.ts` + the same `help.tip.*` copy |
| `admin/*` | ops (see `docs/05_operations/`) | various |

## Conventions

- Forms are SvelteKit `actions` (`+page.server.ts`), not separate API endpoints,
  except where a client API is required.
- Server endpoints return `fail(...)` statuses the page turns into modals/errors.
- `safe()` (`load-guard.ts`) wraps admin/revenue loads so a degraded backend
  renders instead of 500.
- All routes inherit the auth hook; never re-implement auth inside a route.

## Route-level notes

- **`recipes/`**: `/recipes` lists every sheet costed by one `recipeCosts(rid)`
  pass; `/recipes/[id]` is the editor (one form per ingredient row);
  `/recipes/[id]/sheet` is the print-first A4 page and `/recipes/[id]/csv` the
  export. All three render one `RecipeSheetDoc` from
  `src/lib/server/recipes-sheet.ts`, as does the `sendSheet` email. Routes are
  `'open'` in `ROUTE_POLICY`; the 3-sheet limit on trial/starter is a count
  checked in `create`. Gated additionally by the `recipes` beta flag
  (`docs/03_features/feature_flags.md`) ahead of any entitlement check.
  `/recipes/[id]/cocina` renders the same document for the pass — net weights,
  large steps, allergens up top — while `/sheet` keeps the money.

- **`budgets/+page.server.ts`**: loads both the budget limits (`categoryBudgets`)
  and the current-month category spend (aggregated from
  `invoiceLineItems + invoices + suppliers` via a raw SQL join), and passes
  `category_spend` + `colors` to the page so the UI renders progress bars and
  projections without a separate API call.
- **`invoices/export/download/+server.ts`**: exports the invoice list as a styled
  `.xlsx` via `exceljs` (not CSV) — header row, banded rows, autofilter, amber
  accent to match the dashboard.
- **`billing/`**: lives inside the `(app)` group so it renders in the
  authenticated shell/sidebar (it used to be a standalone top-level route with
  its own bare layout). Renders tiered plan cards (Starter/Pro/Business) + a
  feature matrix sourced from `TIERS`/`getTierFeatures()` in `billing.ts`.
- **`api/chat/+server.ts`**: POST chatbot endpoint (Gemini + DB context);
  persists messages to `chat_sessions`/`chat_messages`, parses an optional
  `ACTIONS:[...]` block from the Gemini response and returns
  `{ reply, actions, sessionId }` (up to 2 action buttons); creates a new
  session when none is supplied.
- **`chat/+page.svelte` + `+page.server.ts`**: chat history page listing all
  sessions ordered by `updatedAt`; `?session=<id>` loads a specific session;
  `deleteSession` form action cascade-deletes its messages.
- **`api/upload/[id]/[file]/+server.ts`**: serves the uploaded invoice file
  (PDF/image) for the in-app preview iframe; path-traversal guarded,
  session-scoped, `Cache-Control: private, no-store`.
- **`invoice/[id]/file/+server.ts`**: serves a saved invoice's source file via
  `getStorage().read(key)`; tenant-scoped by `restaurantId`,
  `Cache-Control: private, no-store`. Backs the invoice detail page's `<iframe>`
  preview and its "Download PDF" link.
- **`reminders/`**: single hub for everything needing attention — overdue and
  due-soon invoices plus `systemNotifications` (price shocks, low stock, budget
  overage, uncategorized suppliers, product/conversion suggestions), grouped
  into fixed sections by type. `NotificationItem.svelte` +
  `notification-display.ts` (icon/color/`groupNotifications()`) hold the shared
  per-notification render + grouping logic, reused by the reminders page,
  `MobileAlerts.svelte` and the header `NotificationBell.svelte` (a lightweight
  top-5 preview linking to `/reminders`, not a second full implementation). The
  nav badge (`reminderBadge` in `+layout.server.ts`) counts only
  urgent/actionable items — overdue invoices + budget-`exceeded` — not the full
  pending count.
- **Extraction review flow**: upload creates one `upload_batches` row + one
  `batch_items` row per file (`batch-core.ts`), then `enqueueBatchExtraction()`
  (`extract-batch.ts`) fans out a pg-boss job per pending/failed item.
  `src/worker.ts` runs a separate process with `batchSize: 1` (strictly
  sequential); `extraction-worker.ts` claims each item (`queued→extracting`),
  calls Gemini, and writes `extracted_data`/`conversion_notes` via a guarded
  `markDone`. All status transitions are guarded
  `UPDATE ... WHERE status IN (...)` (`batch-core.ts`), so races between the
  web process and the worker degrade to safe no-ops. `/batch/[id]` is the
  review/confirm UI — `pickActiveItem()` surfaces the first `done` item (else
  the first `failed`) and the page polls `api/batch-status/[id]` every 2.5 s as
  its one feedback channel; `invoice-save.ts`'s `saveReviewedInvoice()` owns
  the low-confidence save gate and the `done→confirmed` transition. The batch
  load also runs a coarse same-supplier + same-invoice-number pre-check
  (`duplicateOfId`) as an earlier, cheaper signal than the exact content-hash
  gate on submit — surfaced as an inline warning before review, with a discard
  action on the block modal. `/pending/` is gone and `/extract/[id]` is now a
  legacy 303-redirect stub to `/batch/[batchId]`.
- **`waitlist/`**: pre-launch landing page. Two-column hero on desktop (copy
  left, an `AppDashboardMock` styled after the real
  `DesktopDashboard`/`KpiCard` on the right, hidden on phone); "how it works"
  steps use scroll-reactive mock components (`src/lib/components/waitlist/`)
  driven by `src/lib/waitlist/reveal.ts`'s scroll-into-view progress action. Its
  light/dark theme toggle stays independent of the app theme system (its own
  `localStorage` key, `mep-theme`), but copy and language now go through the
  `waitlist.*` key namespace (issue #407) — reusing `billing.*` keys for
  pricing-tier names/taglines/bullets that are byte-identical to `/billing`'s.
  Its mock components still carry fixture-like demo copy and stay exempted from
  `scripts/check-i18n-strings.mjs`; the page itself is no longer exempt. Its
  translators come from `$lib/i18n-context.ts` rather than the module store in
  `$lib/i18n.ts`, so the locale it renders is request state
  ([ADR-033](../06_decisions/experience/ADR-033-the-rendered-locale-is-request-state.md)).

## Code notes

### `src/lib/locale-url.ts`, `src/lib/server/locale.ts`, `src/lib/i18n-context.ts`

- The split is deliberate. `locale-url.ts` is pure and importable from
  anywhere; `server/locale.ts` owns the cookie; `i18n-context.ts` owns the
  Svelte plumbing. Nothing in the trio holds module-level mutable state, which
  is the whole point — under `adapter-node` a module is shared by every
  concurrent request.
- `resolveLocale` returns `{ locale, explicit }`. `explicit` is false only for
  the bare default, and it is what tells the client whether the server had a
  real signal or was guessing: a stale `localStorage` value wins over a guess
  and loses to a signal.
- `getLocale()` throws when no parent called `setLocaleContext`. A fallback to
  Spanish would turn a missing provider into a silently wrong-language page,
  which is the failure this whole seam exists to remove.
- `localeHref()` always writes the parameter, in both directions. Dropping it
  for the default locale looks tidier and is wrong: with a remembered cookie,
  a bare path would render the *other* language, so the "ES" link would not
  switch back.

### `src/lib/server/idempotency.ts`

**`const UUID_RE`**

- The one claim-once ledger for the whole app (issue #389). Began as the form-submit helper of issue #250; #389 folded in the two dedup tables built separately for the same job — WhatsApp redelivery (#245) and Stripe redelivery (#240) — after a knowledge-graph pass flagged all three as the same shape. Without consolidation a fourth webhook would have meant a fourth bespoke table, and only one of the three was ever swept.
- Claim inside the mutation's transaction where one exists, so a rolled-back save releases the key automatically. For a handled conflict that commits, call `releaseIdempotencyKey`/`releaseRequest` in the same transaction so a corrected resubmit isn't wrongly skipped.

**`const FORM_SUBMIT_SCOPE` / `WHATSAPP_SCOPE` / `STRIPE_WEBHOOK_SCOPE`**

- Scope is what keeps the callers from colliding now that they share a table: keys are only unique within a scope, so a Meta message id and a Stripe event id can never suppress one another. Exported constants rather than inline strings because migration 0032 backfilled the old rows under exactly these names — renaming one silently orphans that scope's history.

**`const RETENTION_HOURS`**

- Retention is per scope because the replay windows genuinely differ. Stripe retries a failed delivery for up to 3 days, so its claims must outlive that — 96h, with a margin. Meta's redelivery window is minutes and a form replay is a double-click, so 48h is already far beyond either. An unlisted scope falls back to 48h, so a new caller is swept from day one instead of growing unbounded.

**`function isValidKey`**

- True for a well-formed UUID key — anything else is ignored (best-effort). Guards the form-submit scope only; webhook scopes key off provider-issued ids, which are not UUIDs.

**`function claimIdempotencyKey`**

- Atomically claims a (scope, key). Returns true on the first claim, false when already claimed (a replay). Runs on the passed executor so it can join an enclosing transaction. restaurantId is optional because the webhook scopes claim before any tenant is resolved — the column exists so tenant-scoped claims still die with the tenant, as under `processed_requests`.

**`function releaseIdempotencyKey`**

- Releases a claimed key (e.g. a handled conflict that still commits, or a webhook handler that threw). Scoped delete: releasing a WhatsApp claim must not free the identically-named key in another scope.

**`function claimRequest`**

- The form-submit scope bound into the old two-argument signature. Kept because the five call sites in routes and invoice-save.ts pass an enclosing transaction and read as claim/release pairs; ADR-008's retry flow depends on that pairing, so the refactor deliberately left it alone.

**`function releaseRequest`**

- Releases a claimed form-submit key (e.g. a handled conflict that still commits).

**`function sweepIdempotencyKeys`**

- One sweep for every scope, run from the worker's JOBS table rather than at web-process boot. The old placement in `hooks.server.ts` ran the cleanup on every deploy and never on a long-lived process — backwards for a retention job. The trailing `notInArray` pass catches scopes with no declared retention, so adding a caller without touching `RETENTION_HOURS` still can't leak rows forever.

### `src/lib/server/public-form-action.ts`

**`function publicFormAction`**

- Issue #391: `login`, `signup`, `forgot-password`, and `waitlist` each reimplemented the same honeypot-check-then-rate-limit-then-handle shape, with the rate-limit policy (which keys, which caps) buried in each route. This wraps that shape: reject a filled `_hp` field before touching any limiter, then run every configured rule — not just until the first failure — so a route keying on both IP and email (login, forgot-password) always consumes both buckets per attempt, matching the pre-refactor behaviour the tests pin. `onboarding` deliberately stays out: it is session-gated, not public, and has neither a honeypot nor a rate limit to share.
- The rule that actually blocked (not just "any rule failed") decides the `scope` reported to auth telemetry, so a per-IP block and a per-email block are distinguishable in the event stream.
