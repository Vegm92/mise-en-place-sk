# Technical Audit — Mise en Place (invoice/supplier SaaS)

> Audit date: 2026-06-10. Stack: SvelteKit 2 / Svelte 5, Supabase Auth, Drizzle ORM + Postgres (direct `postgres` driver), Gemini (`@google/genai`), Sentry, adapter-node. ~17.4k LOC in `src/`, ~3.2k LOC synth tool, 18 DB tables, ~30 routes.

The codebase is **better than typical for its stage** — clean Svelte 5 idioms, real multi-tenancy via `restaurantId`, RLS policies authored, parameterized Drizzle in most places. But it has **shipped-blocking cross-tenant data leaks**, **production-incompatible in-memory state**, a **non-durable extraction pipeline**, and **~14% of the repo is a dead duplicate tool**. Below is the full audit.

---

## 1. Architecture Audit

**Shape:** SvelteKit fullstack monolith. Route groups `(app)` (auth-gated tenant app), `(admin)`, plus public `login`/`waitlist`/`auth`. Server logic split between `+page.server.ts` form actions and `src/lib/server/*`. Data access is **direct Postgres via Drizzle** (not the Supabase data API), with Supabase used only for auth/JWT.

### F-A1 — RLS is authored but **not the enforcement layer** (HIGH)
- **Problem:** `drizzle/0002_rls_policies.sql` enables RLS on 17 tables scoped to `auth.uid()`. But the app connects with a **direct Postgres connection** (`src/lib/server/db.ts`) using `DATABASE_URL`, which connects as the table owner / a role that **bypasses RLS**. RLS therefore protects nothing in the request path; the only real tenant boundary is `WHERE restaurantId = locals.restaurantId` written by hand in each query.
- **Root cause:** Two enforcement models (RLS + app-code scoping) were both built; only app-code is live. RLS gives a false sense of safety.
- **Business impact:** Every missed `restaurantId` filter is a cross-tenant breach (see §7) — and three already exist. RLS would have caught all of them.
- **Technical impact:** Defense-in-depth is absent; correctness depends on developer discipline on every query forever.
- **Recommendation:** Either (a) route tenant queries through a connection that sets `request.jwt.claims`/`SET LOCAL role` so RLS actually applies, or (b) **delete the RLS migration** and stop pretending it's a control — then enforce scoping with a single query-builder helper (`scoped(table, locals)`), not ad-hoc `and(eq(...restaurantId))` in 30 files.
- **Complexity reduction:** Removing dead RLS = −288 LOC + −1 mental model. A `scoped()` helper removes the per-call boilerplate across ~40 sites.

### F-A2 — Extraction runs **synchronously inside the request** with no durable job model (HIGH)
- **Problem:** `extract/[id]/+page.server.ts` calls Gemini (15–45s) in the page `load`. Concurrency is gated by a module-level counter (`activeExtractions`). State lives in **on-disk JSON session files** (`src/lib/server/sessions.ts`). There is a *parallel* unused durable model (`pending_processed_invoices` + `/api/inference-status` polling) that nobody writes to.
- **Root cause:** An async/queue design was started (`pending_*` tables, polling endpoint, `/pending/[id]` page) then abandoned mid-migration in favor of inline extraction; both halves remain.
- **Business impact:** Long requests, gateway timeouts at scale, lost work on container recycle, Gemini cost spikes (the cap is per-process). Two competing flows = double the bugs.
- **Recommendation:** Pick **one**. The right one is the durable `pending_processed_invoices` model + a worker (or `waitUntil`/queue). Delete the in-memory sessions + inline extraction, or delete the pending tables/route/polling endpoint. Do not keep both.
- **Complexity reduction:** Deleting the dead half removes a table pair, a route, an API endpoint, RLS policies, and admin queries (~250 LOC + 2 tables).

### F-A3 — Mixed data-access patterns: Drizzle query builder **and** `sql.raw()` string-building (MEDIUM)
- **Problem:** 10 sites use `db.execute(sql.raw(\`...\`))` with interpolated values (`src/lib/server/supplier-reliability.ts:36`, `suppliers/+page.server.ts:42`, all of `analytics/extraction` and `analytics/spend`). Escaping is hand-rolled (`.replace(/'/g, "''")`).
- **Impact:** Inconsistent, harder to maintain, and an injection surface (§7 F-S5). Drizzle's typed builder or `sql\`\`` (parameterized) does the same job safely.
- **Recommendation:** Convert all `sql.raw` to parameterized `sql\`\`` template tags. Ban `sql.raw` via lint rule.

### F-A4 — Module boundaries are reasonable; coupling is low. (POSITIVE)
No circular deps found. `lib/server` is cleanly server-only. The genuine architectural debt is the **two unfinished migrations running simultaneously** (RLS vs app-scoping; inline vs durable extraction), not layering.

---

## 2. Simplification Audit

### Deletion Candidate List

| Item | Reason | Risk | Est. savings |
|---|---|---|---|
| `synth/js/` (entire dir, ~934 LOC, 14 files) | Dead JS port of the Python synth tool; no tests, no script/CI reference. Python is the live one. | Low | −934 LOC, removes a whole toolchain |
| `synth/package.json` | Declares a `bin` for the dead JS CLI | Low | cleanup |
| `chart.js` dependency | Zero imports; charts are hand-rolled SVG (TODO.md even says "remove Chart.js") | Low | −1 dep, smaller lockfile |
| `@sveltejs/adapter-auto` dependency | Not used; `svelte.config.js` uses `adapter-node` | Low | −1 dep |
| `@lucide/svelte` **or** `lucide-svelte` | **Both** icon packages are installed. (Verify: lucide-svelte ~44 imports; @lucide/svelte used by a couple of shadcn ui files.) Standardize on one. | Low–Med | −1 dep, ~consistency |
| `static/cehf-ejc.png`, `static/invoice-extract.png`, `static/taking-pic.png` | 5.6 MB of images, zero references | Low | −5.6 MB |
| `dev-server.log`, `dev-server-test.log` | Committed runtime logs | Low | git hygiene |
| `coverage/`, `data/db.sqlite` (0 B) | Generated artifacts committed | Low | git hygiene |
| `pending_processed_invoices` + `pending_line_items` tables, `/pending/[id]`, `/api/inference-status/[id]`, admin pending stats | Dead async flow (see F-A2) **— OR** delete the inline flow instead. One must go. | Med | −2 tables, −1 route, −1 endpoint, ~250 LOC |
| Second `Sparkline.svelte` | Two same-named, semantically different components (§4 F-F1) | Med | −1 footgun |
| `TODO.md` (fully checked off), `mise-en-place/` design exports (3.3 MB) | Stale; belongs in a wiki not the app repo | Low | clarity, −3.3 MB |

**Replace with native platform functionality:**
- Hand-rolled i18n (710 LOC, 624 keys) is fine for 2 locales — keep, don't add a lib.
- In-memory rate limiter / semaphore / disk sessions → replace with Postgres or Redis (you already have a DB).

**80% simplifications:** the upload page (`(app)/+page.svelte`, 782 LOC) duplicates ~70% of its logic across inline mobile/desktop branches — extract shared upload logic into one component, branch only on layout (§4 F-F2).

---

## 3. Data Flow Audit

**Critical journey: upload → confirm → extract → save invoice.**
`(app)/+page.server.ts` saves files to `uploads/` + writes a disk session → `confirm/[id]` lists files → `extract/[id]` load() calls Gemini synchronously, writes result back to session → save action inserts invoice + line items + runs alert engines.

### F-D1 — Invoice save is **not transactional** (HIGH)
`extract/[id]/+page.server.ts` (and the `pending` commit at `pending/[id]/+page.server.ts:116-153`): supplier upsert → invoice insert → line-item insert → alert generation are **separate awaits**. A failure mid-sequence leaves an invoice with no line items, or items with no alerts. **Fix:** wrap in `db.transaction()`.

### F-D2 — Duplicate-invoice check is **check-then-insert** (race) (HIGH)
`extract/[id]` and `pending/[id]:103-113` SELECT for an existing `(supplierId, invoiceNumber)` then INSERT. Two concurrent submits both pass. **Fix:** add `UNIQUE(restaurantId, supplierId, invoiceNumber)` and handle the conflict; drop the SELECT.

### F-D3 — N+1 in the alert engine and unit bridge (MEDIUM, perf)
- `alert-engine.ts:35-73` (price shock): one query **per line item** for prior price.
- `alert-engine.ts:78-122` (stock forecast): one query per item.
- `unit-bridge.ts:70-78` (`resolveUnit`): one query per item.
A 30-line invoice = ~90 queries on save. **Fix:** batch with a single `IN (...)` / join per concern.

### F-D4 — Extraction failures are **swallowed to console**, not surfaced or persisted (MEDIUM)
`extract/[id]` catches Gemini errors, sets a local `extractError` string, `console.error`s, and moves on. If the user navigates away, the failure is lost; no retry record, no DB state. Re-entering re-runs extraction (re-billing Gemini). **Fix:** persist extraction status/error on the invoice/pending row.

### F-D5 — Client polling vs durable state mismatch (LOW)
`/pending/[id]` polls `/api/inference-status/[id]` every 2s, but the inline flow never populates those tables, so the durable status the client polls is never written by the live path. Symptom of F-A2.

---

## 4. State Management Audit

### F-F1 — Two `Sparkline.svelte`, same name, different contracts (HIGH, maintainability)
`src/lib/components/Sparkline.svelte` (props `values`, price-trend red/green semantics) vs `src/lib/components/mep/Sparkline.svelte` (props `data`, generic gradient). Importing the wrong one silently renders wrong/empty. **Fix:** rename root → `PriceTrendSparkline`, or merge with a `variant` prop.

### F-F2 — Mobile/desktop duplication in the upload page (MEDIUM)
`(app)/+page.svelte` (782 LOC) renders near-identical upload UI twice via `class="md:hidden"` / `hidden md:flex`, duplicating drop-zone, file handling, offline IndexedDB queue (~70% overlap). Dashboard splits into `MobileDashboard` (89 LOC) vs `DesktopDashboard` (553 LOC) — acceptable since they genuinely differ. The upload page is the one to consolidate.

### F-F3 — Otherwise healthy (POSITIVE)
Stores are minimal (`tutorial`, `locale`), runes used idiomatically, intervals/listeners cleaned up in `onDestroy`/`onMount` returns, no memory leaks or redundant state syncing found. IndexedDB `openDb()` is re-opened per interaction (LOW; cache the handle).

### F-F4 — Hardcoded Spanish bypassing i18n (LOW)
e.g. `(app)/+page.svelte:376,573`, dashboard greeting strings. Inconsistent localization.

---

## 5. Performance Audit

| Bottleneck | Where | Impact | Fix | Gain |
|---|---|---|---|---|
| N+1 on invoice save | alert-engine, unit-bridge | ~90 queries / 30-line invoice; slow save, DB load | Batch (`IN`/join) | ~90→~3 queries |
| Synchronous Gemini in request | extract load | 15–45s blocking req, timeout risk | Durable async job | unblocks request thread |
| Dashboard fan-out | `dashboard/+page.server.ts` | 20+ parallel queries/load | Materialized view / cached aggregates | fewer round-trips |
| Per-process extraction cap | rate-limiter semaphore | Cap is per-instance; over-calls Gemini at scale | Shared counter (DB/Redis) | cost control |
| Unused 5.6 MB static images | `static/` | Repo bloat, slower clones/deploys | Delete | −5.6 MB |
| `sql.raw` aggregates without indexes verified | analytics pages | Full scans as data grows | Verify indexes on `invoice_line_items(description)`, `invoices(invoiceDate, restaurantId)` | scan→index |

i18n loads all 624 keys client-side — negligible at 2 locales; ignore.

---

## 6. Scalability Audit (what breaks first)

- **10 users:** Fine. Single node, disk sessions OK.
- **1,000 users:** **In-memory rate limiter + extraction semaphore + disk sessions break the moment you run >1 instance or deploy serverless.** Each instance has its own limits → AI cost abuse, inconsistent throttling, sessions invisible across nodes. This is the **first thing to break** and it breaks on the *second instance*, not at a user count.
- **10,000 users:** Synchronous extraction saturates the request pool; dashboard fan-out + N+1 + unindexed analytics scans degrade. Need a worker queue and aggregate caching.
- **100,000 users:** Direct Postgres connection pool exhaustion (no PgBouncer mentioned), no read replicas, Gemini quota/cost becomes a P&L line item, file storage on local disk (`uploads/`) is untenable — must move to object storage (S3/Supabase Storage).

**Ranked risks (prob × impact):** (1) multi-instance state corruption [near-certain × high], (2) extraction timeouts/queue absence [high × high], (3) local-disk file & session storage on ephemeral infra [high × high], (4) DB connection/index scaling [med × high].

---

## 7. Security Audit

| # | Severity | Finding | Location |
|---|---|---|---|
| F-S1 | **CRITICAL** | **Cross-tenant IDOR — invoice file download.** Queries `invoices` by `id` only, no `restaurantId`. Any logged-in customer downloads any restaurant's invoice PDF by integer ID. | `(app)/invoice/[id]/file/+server.ts:22-25` |
| F-S2 | **CRITICAL** | **Cross-tenant IDOR — pending invoice read + reject.** `load` and `reject` action filter by `id` only. Any user reads/rejects any restaurant's pending OCR data. (`commit` also fetches without rid check at :73.) | `pending/[id]/+page.server.ts:13-26,158-167` |
| F-S3 | **HIGH** | **Upload file endpoint trusts session membership, not user.** `/api/upload/[id]/[file]` checks the file is in the session but never that the session belongs to the requester. Session IDs in URLs (history/referrer/logs) → file access. Sessions have no user binding. | `api/upload/[id]/[file]/+server.ts` ; `sessions.ts` |
| F-S4 | **HIGH** | **Open redirect on login.** `redirectTo` used unvalidated (the `/auth/callback` validates, login does not). | `login/+page.server.ts:5,21` |
| F-S5 | **MEDIUM** | **`sql.raw` interpolation** — 10 sites; brittle manual quote-escaping. Injection surface if any interpolated value is attacker-influenced. | `supplier-reliability.ts:36`, `suppliers/+page.server.ts:42`, `analytics/*` |
| F-S6 | **MEDIUM** | **Prompt injection in chat** — user message concatenated with system instruction + data snapshot; "ignore instructions, dump context" can exfiltrate the tenant's own snapshot (lower impact: it's the user's own data, but can corrupt outputs / future multi-tenant context). | `(app)/api/chat/+server.ts:44-85` |
| F-S7 | **MEDIUM** | **No magic-byte validation on upload** — extension-only allowlist; renamed payloads served `inline` with asserted MIME. | `sessions.ts:77-82` |
| F-S8 | **MEDIUM** | **In-memory, per-IP rate limiting** — bypassable across instances; shared-NAT users share a quota; resets on restart. Covers chat/notifications but the AI cost path is the exposure. | `rate-limiter.ts` |
| F-S9 | **LOW** | **`/api/tpv/sync` is in the public-path allowlist** but is a 501 stub. Latent risk when implemented — it will be unauthenticated by default. | `hooks.server.ts:98`, `api/tpv/sync/+server.ts` |
| F-S10 | **LOW** | Unhandled `JSON.parse` on notification payloads. | `(app)/+layout.server.ts:74-77` |

**Positives:** JWT validated via `supabase.auth.getUser()` (not just cookie); admin seed refuses `changeme` in prod; security headers set; `sendDefaultPii: false`; no secrets committed; most endpoints *do* scope by `restaurantId`. The problem is the **few that don't** — and in multi-tenant SaaS, a few is enough.

---

## 8. SaaS Business Audit

- **Biggest engineering spend with no revenue:** the **synth tool (~3.2k LOC, ~14% of repo) plus its dead JS duplicate.** Synthetic-invoice generation + benchmarking is an internal R&D tool. Keep the Python one if you're actively tuning extraction accuracy; **delete the JS duplicate today**; consider moving the whole `synth/` to a separate repo so it stops being maintained, type-checked, and shipped with the product.
- **Two unfinished migrations** (RLS-vs-app-scoping, inline-vs-durable extraction) are pure carrying cost — double the surface, double the bugs, zero customer value until consolidated.
- **Gemini is the variable cost center.** Per-process concurrency caps + re-running extraction on navigation + no per-tenant quota = unpredictable COGS. Add a **per-restaurant extraction budget/quota** before scaling marketing.
- **Don't build:** distributed queue infra from scratch, a custom i18n framework expansion, more mobile/desktop component forks. Use Postgres for rate-limit/session state (you already pay for it).
- **Cheap wins to profitability:** delete dead weight (−6 deps/files/tool), fix the 3 IDOR + transactions before any paid launch (a breach is existential for a B2B finance tool).

---

## 9. Technical Debt Report

**Critical — must fix before launch:**
1. F-S1/F-S2/F-S3 cross-tenant IDOR (invoice file, pending invoice, upload file).
2. F-D1 transactional invoice save; F-D2 unique constraint on invoice number.
3. F-S4 open redirect.
4. Decide RLS-or-app-scoping (F-A1) and add the missing scopes.

**High — within 30 days:**
5. F-A2 collapse to one extraction model (durable, off-request).
6. F-S8 / scalability: move rate-limiter + semaphore + sessions out of process memory/disk.
7. F-D3 N+1 batching.
8. F-S5 kill `sql.raw`.

**Medium — within 90 days:**
9. F-F1 Sparkline rename/merge; F-F2 upload-page consolidation.
10. F-S6 chat prompt isolation; F-S7 magic-byte validation; F-D4 persist extraction errors.
11. README rewrite (it documents a *recipe app on SQLite* — wrong product, wrong DB).
12. Move files to object storage; add PgBouncer.

**Acceptable debt (leave it):**
- Hand-rolled i18n at 2 locales.
- Mobile/desktop dashboard split (genuinely different UIs).
- 18 tables, 2 migrations via `drizzle-kit push` — fine for now, but adopt migration files before prod data accumulates.

---

## 10. CTO Verdict

| Dimension | Score /100 |
|---|---|
| Architecture | 62 |
| Maintainability | 65 |
| Scalability | 40 |
| Reliability | 50 |
| Security | 38 |
| Simplicity | 60 |
| **Launch readiness** | **45** |

Security and scalability are dragged down by concrete, exploitable issues (cross-tenant IDOR; multi-instance state). Maintainability is decent because the code itself is clean — the debt is *structural duplication of half-finished migrations*, not spaghetti.

1. **Rewrite completely:** the extraction pipeline — one durable, off-request job with persisted status/errors and a per-tenant quota. Today it's two half-built flows sharing one product.
2. **Delete immediately:** `synth/js/` (dead duplicate), `chart.js` + `@sveltejs/adapter-auto` deps, the 5.6 MB unused PNGs, committed logs/coverage, and one of the two `Sparkline`s. Then delete *either* the `pending_*` flow or the inline flow.
3. **Biggest hidden risk:** RLS exists and reads as "we have row-level security," but the direct-Postgres connection bypasses it — so the actual control is hand-written `restaurantId` filters, and **three are already missing.** The safety net everyone will assume exists, doesn't.
4. **Biggest waste of engineering effort:** maintaining the synth tool twice, and carrying two unfinished architecture migrations (RLS+app-scoping, inline+durable extraction) in parallel.
5. **What a world-class team would do differently:** enforce tenancy in exactly one place (a `scoped()` builder or live RLS), make extraction a durable job from day one, push rate-limit/session state to Postgres, and never let a second implementation of the same tool merge.
6. **First 10 actions if I inherited this tomorrow:**
   1. Add `restaurantId` checks to invoice-file, pending load/reject/commit, and bind upload sessions to the user (F-S1/2/3).
   2. Validate `redirectTo` on login (F-S4).
   3. Wrap invoice save in a transaction + add the unique constraint (F-D1/2).
   4. Decide RLS vs app-scoping; if keeping app-scoping, build `scoped()` and audit all 18 tables' queries (F-A1).
   5. Move rate-limiter + extraction semaphore + sessions to Postgres (F-S8, scalability).
   6. Collapse to one extraction flow; delete the other; persist extraction errors (F-A2, F-D4).
   7. Batch the N+1 queries in the alert engine/unit bridge (F-D3).
   8. Replace all `sql.raw` with parameterized `sql\`\`` (F-S5).
   9. Delete the dead weight: `synth/js/`, unused deps, big PNGs, logs; move `synth/` out of the product repo.
   10. Rewrite the README to describe the actual product, and adopt migration files.

**Bottom line:** This is a salvageable, well-built MVP that is **not launch-ready for paying B2B customers** until the cross-tenant leaks, transactional integrity, and multi-instance state are fixed. None of those are large; they're a focused 1–2 week hardening pass. The structural win — and the thing that will keep the small team sane for 5 years — is **deleting the duplicated tool and consolidating the two half-finished migrations into one of each.**
