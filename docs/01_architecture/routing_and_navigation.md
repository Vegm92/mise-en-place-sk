# Routing and Navigation

All SvelteKit routes under `src/routes/`. The `(app)` and `(admin)` route groups
provide their shells via `+layout.server.ts` / `+layout.svelte`. Public pages sit
at the top level. A stale legacy page is noted where applicable.

## Route tree (abridged to real files)

```
src/routes/
├── +layout.svelte                     # root layout (CSP/theme)
├── +error.svelte
├── (app)/                             # authenticated app shell
│   ├── +layout.server.ts              # tenancy, badges, quota, sentry tag
│   ├── +layout.svelte                 # sidebar + header (nav, bell, chat FAB, locale)
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
│   ├── budgets/                       # monthly category budgets
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
│   └── api/
│       ├── active-restaurant/+server.ts  # switch restaurant (validates membership)
│       ├── chat/+server.ts               # chat endpoint
│       ├── notifications/+server.ts      # GET pending / POST mark-sent
│       ├── product-aliases/+server.ts    # confirm/reject alias + dismiss
│       ├── stock-levels/+server.ts       # GET/PUT (gated: stockTracking)
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
│       └── dead-letters/            # DLQ list, status, replay extraction jobs
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
  (plan name + quota used/limit), settings, privacy/terms, user + logout.
- **Header**: mobile menu, ChatFab, ES/EN toggle, NotificationBell (top-5),
  theme toggle.
- **Nav badge** (`+layout.server.ts`): overdue invoices (status
  `pending`/`accepted`, `due_date < CURRENT_DATE`) + pending `budget_overage`
  with payload `level='exceeded'` — deliberately not the full pending count.
- **Onboarding gate**: supplier/product/analytics/budgets/digest/chat are hidden
  until `settings.has_completed_onboarding` (set on first confirmed invoice).

## Auth rules

- Public whitelist: `login`, `signup`, `waitlist`, `api/auth`, webhooks,
  `api/health`, `privacy`, `terms`, `robots.txt`, `sitemap.xml`.
- `/api/*` unauthenticated → 401 JSON; page unauthenticated → redirect
  `/login?redirectTo=...`.
- `/admin*` → `isAdminUser` (`AUTH_ADMIN_EMAIL`) else redirect `/`.

## Page → subsystem mapping

| Page | Feature spec | Data source |
|---|---|---|
| `batch/[id]` | `invoice_ingestion`, `invoice_confirmation` | `batch-core.ts` + `invoice-save.ts` |
| `invoices*`, `invoice/[id]*` | invoice management (see `invoice_confirmation.md`) | `invoices` + line items |
| `suppliers*` | `suppliers` | `suppliers` + `mv_supplier_monthly_spend` |
| `products*` | `products` | `products` + aliases + `mv_price_snapshots` |
| `budgets` | `budgets` | `category_budgets` + live aggregation |
| `reminders` | `notifications` | `system_notifications` + invoices |
| `analytics/*` | `analytics` | `mv_*` views |
| `digest` | `digest` | `settings.weekly_digest_*` |
| `chat` | `chat` | `chat_sessions`/`chat_messages` |
| `billing` | `billing` | `subscriptions` + `billing-plans.ts` |
| `settings` | `whatsapp`, `billing`, auth | settings + `whatsapp_contacts` |
| `admin/*` | ops (see `docs/05_operations/`) | various |

## Conventions

- Forms are SvelteKit `actions` (`+page.server.ts`), not separate API endpoints,
  except where a client API is required.
- Server endpoints return `fail(...)` statuses the page turns into modals/errors.
- `safe()` (`load-guard.ts`) wraps admin/revenue loads so a degraded backend
  renders instead of 500.
- All routes inherit the auth hook; never re-implement auth inside a route.
