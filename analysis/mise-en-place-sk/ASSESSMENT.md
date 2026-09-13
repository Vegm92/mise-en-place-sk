# Modernization Assessment — Mise en Place SK

- **Revision assessed:** `70d066d6` (main, 2026-09-11)
- **Produced by:** `/modernize-assess` (code-modernization plugin), 2026-09-13
- **Tooling note:** `scc`, `cloc` and `lizard` are not installed on this machine. LOC figures come from the plugin's documented fallback (`find` + `wc -l` grouped by extension) and file complexity is ranked by decision-keyword density, so the COCOMO index below is computed by hand from KSLOC rather than read off a tool. Figures are reproducible with the commands in *Method*.
- **Live telemetry:** included. Sentry org `victorgranda`, project `mise-en-place`, 30–90 day windows.

---

## Executive Summary

Mise en Place SK is a **Spanish-first, multi-tenant SaaS** that turns photographed supplier invoices into spend analytics for independent restaurants — SvelteKit 2 / Svelte 5 (runes), Drizzle over Postgres, a second pg-boss worker process, Gemini for document extraction, live at `mise-place.com`. It is **~127k lines** across app code, tests, migrations and docs, built in **five months and 1,664 commits** (1,363 of them in the last 30 days).

**This is not a legacy system and it does not need a modernization.** Every dependency is current (Svelte 5.56, SvelteKit 2.70, Vite 7.3, TypeScript 5.9, Tailwind 4.3); the Svelte 4→5 runes migration is verifiably 100% complete (zero `export let`, zero `$:`, zero `createEventDispatcher` across 130 components); CI enforces **12 bespoke invariant linters** plus gitleaks, type checking, migrations, tests and an AI-extraction golden-set eval gate. The engineering governance here is stronger than most teams of any size achieve.

The risk profile is therefore not "old code" but **velocity debt and one-layer-deep safety**. Three concrete patterns: (1) the same business quantity is computed by two-to-four divergent implementations in money-handling code, so month-boundary reports and price-shock alerts can disagree with each other on identical data; (2) tenant isolation rests on a **single** application-level layer because the RLS policies that exist in the migrations are inert in production, pending the `mep_runtime` role cutover (#464); (3) production is emitting a clear, fixable error signal that nobody is reading — `GET /(app)` runs 1.3 ms at p50 and **5,155 ms at p99**, and the top error by volume is the health endpoint failing on itself.

**Headline recommendation: Refactor-in-place.** No rehost, no replatform, no rewrite. The highest-value work is a *convergence pass* — collapse the duplicated money/date helpers, close the two security gaps below, and land #464 — not any architectural migration. See *Recommended Modernization Pattern*.

---

## Method

```bash
# inventory (no scc/cloc available)
find src tests scripts drizzle -type f | sed 's/.*\.//' | sort | uniq -c | sort -rn
find src -name '*.ts'     -exec cat {} + | wc -l
find src -name '*.svelte' -exec cat {} + | wc -l
find tests -type f        -exec cat {} + | wc -l

# complexity ranking
find src -name '*.ts' -o -name '*.svelte' | while read f; do
  c=$(grep -cE '\b(if|for|while|case|catch|\?\?|&&|\|\||#if|#each)\b|\?\.' "$f")
  echo "$c $(wc -l < "$f") $f"
done | sort -rn | head -22
```

Three analysis agents ran in parallel (structural map, technical debt, security audit). **Every headline finding in this document was independently re-verified against source by the lead session** before inclusion; two agent findings were rejected on verification and are recorded in *Rejected Findings* rather than silently dropped.

---

## System Inventory

| Group | Files | Lines |
|---|---:|---:|
| `src/**/*.ts` (app + server) | 310 | 42,059 |
| `src/**/*.svelte` (components + routes) | 130 | 25,264 |
| `tests/**/*.ts` | 320 | 51,301 |
| `drizzle/**/*.sql` (85 migrations) | 85 | 3,297 |
| `scripts/**/*.mjs` | 30 | 5,619 |
| `docs/**` | — | 42,723 |
| **Total (excl. docs)** | **875** | **127,540** |

**Test-to-app ratio is 0.76:1** (51k test lines against 67k app lines) — unusually high, and a genuine asset.

### Technology fingerprint

| Concern | Choice | Evidence |
|---|---|---|
| Framework | SvelteKit 2.70 + Svelte 5.56 (runes) | `package.json`, `svelte.config.js` |
| Runtime / deploy | `@sveltejs/adapter-node`, two Railway services (web + worker) | `railway.json`, `railway.worker.json`, `Dockerfile` |
| Build | Vite 7.3, separate worker config | `vite.config.ts`, `vite.worker.config.ts` |
| Data store | Postgres via Drizzle 0.45 (`postgres-js`, SSL required), **50 tables**, 85 committed migrations as canonical schema (ADR-003) | `src/lib/server/schema.ts`, `drizzle/` |
| Queue / scheduler | pg-boss 12.25 in the same Postgres | `src/lib/server/queue.ts`, `scheduler.ts`, `src/worker.ts` |
| Auth | Auth.js (`@auth/sveltekit`) — credentials (bcrypt cost 12) + Google OAuth, JWT sessions | `src/lib/server/auth.ts`, `auth-credentials.ts` |
| Document AI | `@google/genai`, model from env; `unpdf` read / `pdf-lib` write; Facturae + UBL parsed **without** AI | `extract.ts`, `einvoice-parser.ts`, `qr.ts` |
| Billing | Stripe 22.3, signature-verified + idempotency-claimed webhooks | `billing.ts:689`, `api/stripe-webhook/+server.ts` |
| Storage | local disk or S3-compatible (`STORAGE_DRIVER`) | `storage.ts` |
| Rate limiting | Upstash Redis token bucket, in-memory fallback | `rate-limiter.ts` |
| Observability | Sentry (client + server), request IDs, worker heartbeat, `metric_samples` | `hooks.server.ts`, `metrics.ts` |
| Messaging | `@whiskeysockets/baileys` 7.0.0-**rc14** (unofficial WhatsApp, ADR-025 stopgap) | `integrations/whatsapp/` |
| i18n | es/en, enforced by `lint:i18n` — no hardcoded reader-visible strings | `src/lib/messages/{es,en}.ts` |
| Tests | Vitest 3.2, auto-split isolated/shared pools, 75% line floor | `vite.config.ts` |

### CI gates (`.github/workflows/ci.yml`)

12 invariant linters — `no-sql-raw`, `tenant-scope`, `unscoped-tenant-query`, `action-authz`, `form-get-cast`, `json-body-schema`, `inline-token-style`, `migration-expand-contract`, `i18n`, `no-comments`, duplication (jscpd), drizzle-schema-sync — plus gitleaks, `svelte-check`, migrations, tests and build, and a conditional Gemini golden-set eval gate. **All 8 runnable invariant linters pass clean at this revision.**

---

## Architecture-at-a-Glance

12 domains, 42 dependency edges. Diagram: **`analysis/mise-en-place-sk/ARCHITECTURE.mmd`**.

| # | Domain | Responsibility | Anchor files |
|---|---|---|---|
| 1 | Platform & Request Pipeline | Sentry, session→locals, access/tenant/flag gates, rate limit, locale, headers | `src/hooks.server.ts` |
| 2 | Tenancy & Data Layer | Schema, connection, `restaurant_id` scoping, per-tenant export/delete | `schema.ts`, `db.ts`, `tenant-context.ts` |
| 3 | Identity, Access & Acquisition | Auth.js, verification, approval gate, consent, onboarding, waitlist | `auth*.ts`, `access-gate.ts`, `routes/{login,signup,waitlist}` |
| 4 | Billing & Entitlements | Stripe subscriptions, plan/trial state, LLM quota, revenue metrics | `billing.ts`, `entitlements.ts`, `llm-quota.ts` |
| 5 | Ingestion & Batch Upload | Uploads (incl. offline queue + ZIP), persist bytes, enqueue extraction | `batch.ts`, `storage.ts`, `UploadPanel.svelte` |
| 6 | Extraction & Document AI | PDF split, e-invoice/QR fast path, Gemini fallback, quality + self-improvement | `extract.ts`, `extraction-workflow.ts`, `einvoice-parser.ts` |
| 7 | Invoices & Suppliers | Transactional save, dedup, supplier identity/merge/reliability, export | `invoice-save.ts`, `supplier*.ts` |
| 8 | Catalog | Products, aliases, categories, unit conversions, stock, recipes | `products.ts`, `categories.ts`, `recipes.ts` |
| 9 | Insights & Engagement (flag-gated) | Analytics, alert engine, budgets, reminders, reports, digest, chat | `alerts.ts`, `reports/`, `chat-context.ts` |
| 10 | WhatsApp Channel (optional) | Inbound invoice photos, pairing, contacts, health | `integrations/whatsapp/` |
| 11 | Worker, Queue, Scheduler & Ops/Admin | pg-boss, cron, dead letters, heartbeats, flags, `/admin` | `src/worker.ts`, `scheduler.ts`, `system-health.ts` |
| 12 | UI Shell, Design System & i18n | `mep/*` library, mobile/desktop variants, theming, es/en strings | `components/mep/`, `i18n.ts`, `messages/` |

**Three structural facts that matter more than the table:**

1. **One funnel owns everything.** `hooks.server.ts:343` composes `sequence(sentryHandle, authHandle, appHandle, entitlementHandle)` and reaches into Identity, Tenancy, Billing and Ops *before any `load` runs*. Feature gating for the Insights umbrella lives at `hooks.server.ts:215-219` — in Platform, not in the features. Cheap to change globally; hard to reason about per-feature.
2. **The write path is a one-way chain:** Ingestion → Extraction → Invoices → Catalog + Insights. The widest module in the codebase is `extraction-workflow.ts`, importing 14 others *including* `invoice-save`. So Extraction depends on Invoices, never the reverse.
3. **Digest and chat share the extraction LLM budget.** Both call `llm-quota`. A chatty tenant can consume extraction capacity — a product-level coupling, not visible in the dependency graph.

---

## Production Runtime Profile

Sentry `is_transaction:true` spans, 30 days, sorted by volume. **This data is not available inside the app**: `docs/05_operations/monitoring.md:56` records that the built-in route-latency metric stores "count/sum/min/max, **no exact percentiles**". Everything below is therefore new information.

| Transaction | Count | p50 | p95 | p99 | p99/p50 |
|---|---:|---:|---:|---:|---:|
| `pg-pool.connect` | 13,414 | 0.11 ms | 0.28 ms | **38.5 ms** | **350×** |
| `GET /login` | 9,240 | 5.1 ms | 25.5 ms | 49.9 ms | 10× |
| pg-boss `send-it` poll | 3,762 | 5.6 ms | 22.9 ms | 31.6 ms | 6× |
| **`GET /(app)`** | 1,523 | **1.3 ms** | 204.6 ms | **5,155 ms** | **🔴 3,868×** |
| `GET /waitlist` | 1,390 | 10.6 ms | 96.9 ms | **2,103 ms** | 198× |
| `GET /api/batch-status/[id]` | 695 | 41.7 ms | 84.6 ms | 811 ms | 19× |
| `GET /(app)/batch/[id]` | 393 | 121.0 ms | 445.9 ms | 531.9 ms | 4× |
| `GET /(app)/dashboard` | 331 | 83.5 ms | 664.0 ms | 1,304 ms | 16× |
| `GET /(app)/invoices` | 287 | 97.4 ms | 361.1 ms | 1,056 ms | 11× |
| `pg.connect` | 255 | 38.1 ms | 68.6 ms | 141.6 ms | 4× |

**Highest operational risk: domain 1/2 via `GET /(app)`** — a 3,868× p50→p99 spread. A 1.3 ms median with a 5.2 s tail is the signature of a **connection-pool stall, not slow SQL**, and `pg-pool.connect`'s own 350× spread (0.11 ms → 38.5 ms) corroborates it. Contributing factor: the worker process holds the same pool and issues 13,414 connects + 3,762 queue polls per 30 days against it.

**Two observability gaps this exposed:**

- **App queries are not traced.** Every `span.op:db` row returned is pg-boss housekeeping; the slowest is `pg.connect` at **p99 1,233 ms**. Drizzle queries emit no spans, so a slow application query is currently *invisible* in tracing — which is why the `GET /(app)` tail has no attributable cause yet.
- The `GET /(app)` tail matches a live error: `Failed query: select COUNT(*) from "invoices" where … due_date < CURRENT_DATE` on `GET /(app)`, 16 events. That is the overdue-invoice count on the app root loader.

### Unresolved production errors (90 days, by volume)

| Events | Error | Culprit | Domain |
|---:|---|---|---|
| 70 | `ADDRESS_HEADER=x-forwarded-for but is absent from request` | `GET /api/health` | 1 |
| 16 + 15 | `No such customer: 'cus_…'` | `GET /(app)/billing` | 4 |
| 16 | `Failed query: select COUNT(*) from "invoices" …` | `GET /(app)` | 2/7 |
| 16 | `Failed to fetch dynamically imported module` | `/waitlist` | 12 |
| 14 | Stripe price ID matches no configured tier, falling back to `starter` | `GET /(app)/billing` | 4 |
| 10 | `No such price: 'price_…'` | `POST /(app)/billing` | 4 |
| 8 | `StaleCustomerError: Stripe customer not found` | `POST /(app)/billing` | 4 |
| 5 | `auth.login_failed` | `POST /login` | 3 |
| 1 | `TypeError: this.client.begin is not a function` | `POST /(app)/batch/[id]` | 5 |

**Billing is empirically the least stable domain: 63 of ~160 events**, every one Stripe object drift (customer/price IDs that no longer resolve) rather than a code defect. This is config/environment divergence between Stripe modes or deleted Stripe objects — and it lines up exactly with debt finding D4 below.

---

## Technical Debt — top 10, ranked by remediation value

Value = impact ÷ effort. Every item below was re-verified against source.

| # | Finding | Evidence | Fix |
|---|---|---|---|
| **D1** | **`/api/health` returns 500 to the liveness prober.** The route is exempt from the *global* rate limit (`hooks.server.ts:39`) but implements its **own** per-IP limit with `getClientAddress()` as the first statement, unguarded. Railway's internal probe sends no `x-forwarded-for` while `ADDRESS_HEADER` is set, so SvelteKit throws before any check runs. **Top error by volume (70 events/8 days)** and the health signal is dead on those hits. | `src/routes/api/health/+server.ts:117-121`; `src/lib/server/config.ts:45` | Default `ip` defensively: `let ip = 'unknown'; try { ip = getClientAddress(); } catch {}`. ~2 lines. |
| **D2** | **Month bucketing splits four ways — three local-time, one UTC.** On a Europe/Madrid deploy an invoice at 00:30 on the 1st buckets into a *different month* depending on which helper ran, so revenue metrics and monthly spend reports disagree at every boundary. Also violates the project's own UTC-only rule. | UTC: `src/lib/revenue-math.ts:218`. Local: `src/lib/formatters.ts:178`, `src/lib/server/reports/index.ts:17`, `src/lib/server/dates.ts:47` | Keep the UTC version, re-export from `dates.ts`, delete the other three, repoint callers. |
| **D3** | **`median()` three times, two definitions — on the money path.** `alerts.ts` takes the **lower median**; `price-deviations.ts` **averages the two middles**. Both compute the same baseline price, so on an even number of observations the "you're overpaying" alert and the deviation engine disagree on identical data. | `src/lib/server/alerts.ts:30-33` vs `src/lib/server/price-deviations.ts:74-78`; third copy `supplier-cadence.ts:43` | One `median()` in `money.ts` using the averaging definition; delete all three. Confirm with an SME whether the lower median was ever deliberate. |
| **D4** | **`STRIPE_PRICE_ID_*` read twice, only one trimmed.** `billing.ts` trims; `env.ts` does not — and `external-probes.ts` imports the untrimmed copy. A value pasted into a deploy console with a trailing newline makes checkout work while the admin Stripe probe reports the integration broken. `tests/billing-price-config.test.ts` documents this as a real past incident. Directly implicated in the 63 live billing errors. | `src/lib/server/billing.ts:10-12` (trimmed) vs `src/lib/server/env.ts:32-34` (not) | Add `.trim()` in `env.ts`; have `billing.ts` import from `env.ts` instead of re-reading `process.env`. |
| **D5** | **All 25k lines of Svelte are outside coverage measurement.** `coverage.include` is `['src/**/*.ts']` only, and there is no component-test infrastructure. 232 functions live in `.svelte` files that no test can reach; the 75% line floor is measured against ~62% of shipped code. Worst concentrations: `batch/[id]/+page.svelte` (45 functions), `invoices/+page.svelte` (20), `UploadPanel.svelte` (20). | `vite.config.ts:136` | Don't add a component-test framework. Make "no pure business logic in `.svelte`" a new rule in the existing `scripts/lint-invariants.mjs` harness, and extract the ~10 pure functions out of `batch/[id]` first. |
| **D6** | **Dead coverage threshold.** `vite.config.ts:144` sets an 80% floor for `src/lib/server/alert-engine.ts` — **that file does not exist** (renamed to `alerts.ts`; the re-export barrel was deleted). The threshold silently enforces nothing. 6 of the 7 per-file thresholds are valid; only this one is a ghost. *Mitigating:* the module is well tested in practice — 4 dedicated `alert-engine*.test.ts` suites, one guarding an N+1 regression. | `vite.config.ts:144`; `ls src/lib/server/alert-engine.ts` → absent | Rename the key to `alerts.ts`. One word. |
| **D7** | **The CI extraction eval gate runs against an empty corpus.** `tests/golden/index.json` is `[]` and `inbox/` holds 0 files, so `pnpm eval:gate` always passes in CI — with a real `GEMINI_API_KEY` spent. *Deliberate tradeoff, fairly noted:* the fixtures are gitignored (`.gitignore:105-113`) because they are real supplier invoices. The gate is meaningful only when run locally against a populated corpus. | `tests/golden/index.json`; `.github/workflows/ci.yml:195` | Commit a small set of **synthetic/redacted** invoices so CI has teeth, or make the gate fail loudly on a 0-case corpus rather than passing silently. |
| **D8** | **108 of 320 test files use `vi.mock`, forcing the isolated pool** — 85 of those mock the same module (`lib/server/db`) under two different specifiers. This is the slow-suite root cause. The cheap levers are already pulled: `vite.config.ts:10-15` auto-splits pools by regex, and the DI pattern already exists (`products.ts:1297` `NormalizeDeps`, `billing.ts:474` `EntitlementSource`). `tests/helpers/mock-db.ts` exists with only 4 adopters while 5 files hand-roll the same stub. | `vite.config.ts:10-15`; `tests/helpers/mock-db.ts` | Normalize on the `$lib/` specifier first (mechanical), then extend the existing DI pattern to `db` on the hottest modules so they leave the isolated pool. |
| **D9** | **34 unchecked `as unknown as` casts on raw SQL rows**, densest on the analytics/health paths that render straight into admin dashboards. A column rename in `drizzle/` surfaces as `Number(undefined)` → `NaN` on a dashboard rather than a typed failure. valibot is already a production dependency but appears in only 6 server files. | `extraction-quality.ts:78,138,186,216`; `admin/events/+page.server.ts:63,68,82,120`; `api/health/+server.ts:44,54,89`; `system-health.ts:455,797` | One shared `rows<T>(result, schema)` helper wrapping `db.execute` with a valibot parse; adopt on analytics/health first. |
| **D10** | **God modules with existing seams.** `batch/[id]/+page.svelte` is 1,861 lines / 45 functions / 8 unrelated concerns (794-line `<script>`, 34 `$state`, 53 `$derived`) and even re-implements payment-terms date math (`addDays` at `:332`) already present in `dates.ts:50`. `products.ts` (1,467) and `billing.ts` (1,022) each bundle ~5 concerns but already expose injectable deps, so the seams exist. | as cited | Extract pure functions from `batch/[id]` into `src/lib/batch-form.ts`; split `products.ts` at the `:546` and `:1210` boundaries — its pure parsing half is already side-effect-free with an 80% threshold, so it moves with no test churn. |

### Verified dead code (small, safe deletions)

`src/lib/index.ts` (1 byte, no importers — yet `docs/04_engineering/app_shell.md:443` documents it as having content) · the `integrations/whatsapp/index.ts` barrel (unused; `worker.ts` imports members directly) · `src/lib/server/working-days.ts` (imported only by a test) · `routes/(app)/confirm/[id]/+page.server.ts` and `extract/[id]/+page.server.ts` (**byte-identical** 8-line redirect shims — one shared handler would do) · `mep/AlertRow.svelte`, `mep/SupplierRow.svelte`, `admin/AdminKpiCard.svelte` (no importers; they survive because a linter line-budget table lists them and one test reads `AlertRow` as *text*).

### Rejected findings (agent claims that did not survive verification)

Recorded so they are not re-raised:

- **"`supplier_aliases` has no reader or writer."** False. `src/lib/server/supplier.ts:57` inserts and `:85` selects from it — via raw SQL, which the agent's identifier scan could not see.
- **"`acquisition_costs` / `revenue_assumptions` are populated out-of-band."** False. `revenue-metrics.ts:264` inserts (admin CRUD) and `scripts/admin-mobile-audit-seed.mjs:269` seeds them.
- **"RLS was dropped in the Railway migration"** (repeated from `README.md:63`). Misleading — see SEC-003; policies were **re-added** in `drizzle/0055`, `0057`, `0063`, `0078` and are present but inert.

Both rejected findings failed the same way: raw-SQL blindness in static scanning. Treat any "no reader/writer" claim about this codebase as unproven until checked against `db.execute(sql\`…\`)`.

---

## Security Findings

**Hardcoded credentials: none.** Independently confirmed by the audit agent and by the lead session. Every secret is read from `process.env`; the only literals are `.env.example` placeholders and test fixtures. CI runs gitleaks. **No `SECRETS.local.md` was produced** — the quarantine ignore rules were pre-armed at `analysis/.gitignore` and verified, but there is nothing to quarantine.

| ID | CWE | Sev | Location | Description | Fix |
|---|---|---|---|---|---|
| **SEC-001** | CWE-640 / CWE-644 | **High** | `routes/forgot-password/+page.server.ts:42`; `verification-email.ts:6`; `(app)/settings/+page.server.ts:221` | **Password-reset links are built from the request `Host`.** All three preconditions verified: the URL comes from `event.url.origin`, `auth.ts:18` sets `trustHost: true`, and `ORIGIN` is set in **no** deploy file (`railway.json`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `DEPLOYMENT.md`). Under `adapter-node` with `ORIGIN` unset, `url.origin` derives from the `Host` header — so a `POST /forgot-password` carrying `Host: attacker.tld` for a victim's address emails *the victim* a reset link on the attacker's domain; one click hands over a valid single-use token. **Caveat (verify before assigning final severity):** a managed edge normally routes *by* Host, so reaching the app with an arbitrary `Host`/`X-Forwarded-Host` may not be possible on Railway. A 5-minute `curl -H 'Host: …'` test against production settles it. The fix is cheap regardless. | Use the helper the repo **already has** — `siteOrigin()`/`canonicalUrl()` in `src/lib/server/site-origin.ts`, backed by `APP_BASE_URL` — for every emailed absolute URL. Set `ORIGIN` in the deploy env so SvelteKit pins it. Add `ORIGIN`/`APP_BASE_URL` to `REQUIRED_IN_PRODUCTION` in `config.ts`. |
| **SEC-002** | CWE-613 | Medium | `auth-session.ts:12-17`; `token-version.ts:11-12` | **Password reset may not evict a stolen session.** Revocation depends on a `tokenVersion` JWT claim, but the cookie minted at credential login omits it and `checkTokenVersion` treats a claimless token as *valid* (`tests/token-version.test.ts:32` asserts this as intended). Any session never re-encoded with the claim survives a `users.tokenVersion` bump. | Read the current `tokenVersion` in `issueSessionCookie` so the claim exists from mint time, then make `checkTokenVersion` **reject** `claimed === undefined`. |
| **SEC-003** | CWE-1188 / CWE-284 | Medium (defense-in-depth) | `db-role.ts:49-56`; `drizzle/0055`, `0078` | **Tenant isolation is one layer deep, not two.** RLS policies exist on the tenant tables but are **inert** — the app connects as the table owner and there is no `FORCE ROW LEVEL SECURITY` in any of the 85 migrations, so the owner bypasses them. The code says so itself: *"RLS inert — runtime-role cutover pending (#464)"*. Everything therefore rests on `forTenant().scope()` plus two text-based linters that are deliberately shallow (`unscoped-tenant-query` accepts *any* `.where()` mentioning `.restaurantId`) and honour **48 `tenant-scope-ok` escape comments**. One missed `forTenant()` is a full cross-tenant read with no second line of defence. **In fairness:** both tenant linters pass clean, all 48 exemptions were reviewed and only one overstates its guarantee (SEC-004), the spot-checks held (`invoices/+page.server.ts:50` really does put `tdb.scope(...)` at `conditions[0]`), and the app surfaces the unscoped role as a **warn** on its own admin health dashboard (`system-health.ts:156`). This is a known, tracked, monitored gap — not a hidden one. | Land the `mep_runtime` cutover (#464/#975) so `DATABASE_URL` uses a non-owner, non-`BYPASSRLS` role. Promote `readDbRole().scoped === false` from a health-page string to a **failing production boot check**. |
| **SEC-004** | CWE-639 | Medium | `integrations/whatsapp/jobs.ts:67, :86, :109` | **Cross-tenant read/write after a WhatsApp re-pair.** `findJobByCode` / `pendingJobsFor` / `setReviewStatus` key on the sender's phone and item UUID with **no tenant predicate**. The escape comment at `:70` is true about the *sender* but silent about the *tenant* — and phone→tenant binding is mutable (`whatsapp-contacts.ts:66`, `:88` release, then re-pair elsewhere). After a re-pair the sender still enumerates the **former** tenant's supplier names and job codes, and can flip their `review_status` and raise alerts in that tenant. | Thread the resolved `restaurantId` from `routeMessage` (the caller already has it at `message-handler.ts:180`) into all three, scope with `forTenant(rid).scope(batchItems.restaurantId, …)`, and correct the comment. |
| **SEC-005** | CWE-1236 | Medium | `src/lib/reports.ts:88-93`; XLSX sinks at `invoices/export/download/+server.ts:120`, `inventory-template.ts` | **CSV/XLSX formula injection.** `csvField` quotes only `"`, `\r`, `\n`, `;` — it does not neutralise a leading `=`, `+`, `-`, `@` or tab. Exported cells carry attacker-influenced text (supplier names, line descriptions) that entered via an uploaded or WhatsApp-delivered invoice through LLM extraction. A supplier ships an invoice whose description is a DDE payload; the restaurant's accountant exports and opens it in Excel. | Prefix any field starting with `=+-@\t\r` with `'` inside `csvField`, and apply the same to ExcelJS string cells. One helper, both sinks. |
| **SEC-012** | CWE-1104 | Medium | `package.json:64` → `pnpm-lock.yaml:56` | **`sharp@0.35.3` is in the runtime tree** (peer of Baileys) and bundles a vulnerable libheif — heap corruption, possible RCE. Currently *latent*: the Baileys driver only sends text and buffers media without invoking sharp, so it is one `sendMessage({ image })` away from reachable. `pnpm audit`: 3 high, 3 moderate, 1,117 deps — the `vitest` (CWE-22), `browserslist` and `baseline-browser-mapping` rows are build/test-time only. | Add `"sharp": "^0.35.4"` to the **existing** `pnpm.overrides` block; bump `vitest` ≥ 4.1.11, `browserslist` ≥ 4.28.7. Pin Baileys to a stable release and keep it out of the web process. |
| **SEC-006** | CWE-532 | Low–Med | `(app)/billing/confirm/+page.server.ts:23-31`; `whatsapp-contacts.ts:75-80`, `:102-107`; `storage.ts:56/95/101/107` | PII in `console.*`, which (unlike Sentry) is **not** scrubbed: the billing-confirm load logs the Stripe customer email plus full session metadata on every visit; contact release writes the **full phone number** into `system_notifications.payload` while the rest of the WhatsApp code carefully uses `maskPhone`. | Log `sessionId` + `payment_status` only; store `maskPhone(...)`; log a hash/suffix of storage keys. |
| **SEC-007** | CWE-703 | Low | `turnstile.ts:18-27` | **CAPTCHA fails open.** Verification returns `true` on any non-2xx or network error, so signup/waitlist bot protection vanishes whenever Cloudflare is unreachable — a state an attacker can help along or simply wait for. | Fail closed in production; keep fail-open only for `NODE_ENV !== 'production'`. |
| **SEC-008** | CWE-770 | Low | `rate-limiter.ts:91-101`, `:32-37`; `config.ts:55` | Limits silently degrade to a **per-process** in-memory bucket when Upstash is unset or erroring, so the real ceiling is `max × replicas` and an attacker who can make Upstash fail restores near-unlimited login attempts. Separately, `ADDRESS_HEADER` set without a trusted proxy only **warns** — in that state `getClientAddress()` trusts a client-supplied `X-Forwarded-For`, making every `ip:`-keyed limit spoofable. | Fail closed for auth-critical limits when Upstash is configured-but-failing; make the `ADDRESS_HEADER` misconfiguration a boot-time hard failure in production. |
| **SEC-009** | CWE-639 | Low | `(app)/billing/confirm/+page.server.ts:21-40` | The tenant check `metaRid && metaRid !== locals.restaurantId` is **skipped entirely** when a Stripe session carries no `restaurantId` metadata (portal-created or legacy), so any authenticated user supplying such a `cs_…` id sees another customer's billing email and plan. Only id unguessability stands in the way. | Require the match: `if (session.metadata?.restaurantId !== locals.restaurantId) return base;` |
| **SEC-010** | CWE-208 / CWE-307 | Low | `api/whatsapp/webhook/+server.ts:33`; `whatsapp-pairing.ts:151` | The `hub.verify_token` GET check uses `===` (non-constant-time) while the POST path correctly uses `timingSafeEqual`. Pairing-code redemption is throttled per *sender phone* (5/h) with no global ceiling, so the throttle — not entropy — is the only barrier to a distributed guess over a 30⁶ space with a 15-minute TTL. | `timingSafeEqual` for the verify token; add a global redeem limit. |
| **SEC-011** | CWE-1341 / CWE-459 | Low now, **Medium after #464** | `tenant-context.ts:36-62` | Fire-and-forget work started inside `runWithTenantContext` keeps the ALS store and can query a connection **already released to the pool** (`recordAccountEvent(...).catch()` at `api/whatsapp/webhook/+server.ts:65`; un-awaited `trackEvent` at `events.ts:26`). Today explicit `forTenant()` predicates make it a stability bug; **once RLS is live it becomes a cross-tenant one**, since the query runs under whichever tenant's GUCs now own that connection. | `await` the detached calls or run them via `runAsSystem` outside the request scope; assert in `withReservedContext` that no query is issued after release. **Fix this before landing #464, not after.** |
| **SEC-013** | CWE-611 / CWE-776 | Low | `einvoice-parser.ts:24-33` | Uploaded `.xml` e-invoices parse with `fast-xml-parser` default entity handling and no DTD limits; the only control is the 20 MB cap. No external-entity resolution (so no file read/SSRF), but internal-entity expansion is attacker-controlled CPU/memory. | `processEntities: false` and reject documents containing `<!DOCTYPE` before parsing. |
| **SEC-014** | CWE-1427 | Informational | `extract.ts:51-97`; `api/chat/+server.ts:130-137` | Prompt injection via invoice content can steer *field values*. Impact is well contained by design and **no fix is required** — noted so the controls are not removed: `responseSchema` structured output, IBAN checksum validation, a mandatory human confirm step, an explicit delimiter and an href allowlist on chat actions. | Keep as-is. Consider flagging low-confidence numeric fields more loudly in review. |

One further nit found by the lead session, below the agent's threshold: **`hashIp` is an unsalted SHA-256** truncated to 12 hex chars (`auth-events.ts:15`). The IPv4 space is 2³², so an unsalted hash is brute-forceable in seconds — GDPR-wise that is pseudonymization, not anonymization. Use an HMAC with a server secret.

### What held up under attack

Stated deliberately, because it bounds the report. Stripe **and** WhatsApp webhooks verify signatures over the raw body, refuse unverified payloads in production and are idempotency-claimed (`billing.ts:689-731`). Every JSON endpoint parses through a valibot schema with both ratchet allowlists empty. All 28 endpoints traced scope through `forTenant().scope()` or an explicit membership check. `api/upload/[id]/[file]` is textbook: auth → tenant-ownership → `path.basename` equality → filename must equal `item.displayName` → **and the real storage key comes from the DB, never from user input**, so traversal is structurally impossible. Zip handling flattens names and caps entries/bytes; uploads are magic-byte checked; redirects go through `safeRedirect`; CSP is hash-mode with no `script-src 'unsafe-inline'`; only 3 `{@html}` sinks exist and all take server-generated input; `sql.raw`/`sql.unsafe` appear **zero** times; bcrypt cost 12 at all 4 hash sites; reset tokens are SHA-256-at-rest, 1-hour TTL, single-use delete-returning; and `pnpm.overrides` already carries **8 deliberate CVE pins**.

---

## Documentation Gaps

Documentation volume is exceptional — **42,723 lines** across 9 numbered sections plus per-feature ADR folders, and `docs/00_system/architectural_invariants.md` describes the RLS/`mep_runtime` situation *accurately*. The gaps are drift, not absence.

1. **`README.md:63` is wrong about the most important security property in the system.** It states RLS policies "were dropped in the Railway migration". They were **re-added** (`drizzle/0055`, `0057`, `0063`, `0078`) and are present-but-inert pending #464. This misled one analysis agent during this very assessment. A new engineer reading the README will form a false model of the tenant boundary in either direction.
2. **A deleted module is still documented as live in 3 places.** `alert-engine.ts` (the barrel re-exporting `alerts.ts`) no longer exists, but `docs/00_system/system_manifest.md:165`, `docs/01_architecture/architecture_overview.md:77` and `docs/03_features/notifications.md:211` still describe it — and `vite.config.ts:144` still sets a coverage threshold on it (D6).
3. **The existing audit overstates DB-enforced isolation.** `docs/08_audits/global_codebase_architecture_audit_2026-09-09.md` (4 days old, otherwise excellent) diagrams the store as "PostgreSQL (Drizzle + **RLS** + pg-boss)", lists "RLS context exists" under Data ownership and scores Security boundaries 7/10 citing "RLS context". Since RLS is inert, that audit's most reassuring line is its least accurate.
4. **`/digest` is advertised but gone.** `README.md:20` lists `/digest` as the weekly-digest surface; `routes/(app)/digest/+page.server.ts` is a bare `redirect(308, '/reports')` with no page.
5. **Undocumented operational truth: the app cannot see its own latency distribution.** `monitoring.md:56` honestly records min/max-only metrics, but nothing tells an operator that the real percentiles live in Sentry — so the 5.2 s `GET /(app)` tail has gone unexamined. Also undocumented: that the CI eval gate runs against an empty corpus (D7), and that `docs/08_audits/.../architecture.graph.json` has no Svelte coverage, so component-level orphans are invisible to it.

---

## Relative Scale

- **KSLOC (excl. docs, incl. tests):** 127.5 · **excl. tests:** 76.2
- **COCOMO-II basic index** = `2.94 × KSLOC^1.10`, nominal scale factors:
  - full tree: `2.94 × 127.5^1.10` ≈ **`2.94 × 218.6` ≈ 643**
  - app code only: `2.94 × 76.2^1.10` ≈ **`2.94 × 123.4` ≈ 363**

**This is a relative size index for ranking this system against others in a portfolio. It is not a timeline, a schedule, a cost, or a headcount.** The COCOMO figure assumes traditional human-team productivity curves, which agentic development does not follow — demonstrated by this repo itself: 1,664 commits and ~127k lines in five months, with 773 of those commits authored by an agent. Do not convert this number into person-months, a delivery date, or a budget.

A more honest scale signal for planning here: **50 tables · 85 migrations · 140 server modules · 12 domains · 28 API endpoints · 320 test files**.

---

## Recommended Modernization Pattern

# → **Refactor** (in place)

Not Rehost, Replatform, Rearchitect, Rebuild or Replace.

The assessment found **no modernization trigger**. Every dependency is current to within a minor version; the framework migration that would normally *be* the project (Svelte 4→5 runes) is already 100% complete and verified; the deployment topology (modular monolith + separately deployable worker on Railway Postgres) is the correct shape for this workload and no domain in the service-candidate matrix justifies extraction; governance exceeds the norm (12 invariant linters, ADRs per decision, gitleaks, expand/contract migration ordering). Recommending Rearchitect or Rebuild here would be destroying working software to satisfy a process.

What the evidence *does* support is a **convergence-and-hardening pass**: the debt is the predictable byproduct of 1,363 commits in 30 days landing faster than consolidation runs. Four duplicate month-key helpers and three medians are not carelessness, they are unreconciled parallel work — and two of them are quietly wrong about money.

**This routes to no plugin command.** `/modernize-uplift` (same-stack version bump), `/modernize-transform` (cross-stack) and `/modernize-reimagine` (rebuild) all assume a gap this codebase does not have. Use the ordinary issue-and-PR workflow the repo already runs well.

### Suggested sequence

**Now — hours, highest value per line changed**
1. **SEC-001** — reset links off the `Host` header (run the `curl -H 'Host:'` test first to fix severity; use the existing `siteOrigin()` either way, set `ORIGIN`).
2. **D1** — guard `getClientAddress()` in `/api/health`. ~2 lines; kills your top error and restores the liveness signal.
3. **SEC-012** — `sharp ≥ 0.35.4` into the `pnpm.overrides` block that already exists.
4. **D6** — rename one coverage-threshold key.
5. **README.md:63** — correct the RLS sentence. It is the highest-leverage doc fix in the repo.

**Next — days, correctness of money**
6. **D2 + D3** — one UTC month-key, one `median()`. Land with tests pinning the previously-divergent values so the behaviour change is explicit and reviewed, not silent.
7. **D4** — single trimmed source for Stripe price IDs, then reconcile the drifted Stripe objects behind the 63 live billing errors.
8. **SEC-005** — CSV/XLSX formula-injection guard, one helper for both sinks.
9. **SEC-004** — tenant-scope the three WhatsApp job functions; fix the comment that overstates its guarantee.
10. **SEC-002** — mint `tokenVersion` into the session cookie; make a claimless token invalid.

**Then — the two structural items**
11. **SEC-011 before SEC-003.** Fix the detached-async escape from tenant context *first*; landing RLS (#464) on top of it converts a stability bug into a cross-tenant one.
12. **SEC-003 / #464** — the `mep_runtime` cutover. This is the single largest risk reduction available: it turns a one-layer boundary into two, and makes the 48 `tenant-scope-ok` exemptions survivable rather than load-bearing.
13. **Trace Drizzle queries.** Until app queries emit spans, the 5.2 s `GET /(app)` tail has no attributable cause. Pair with pool sizing across web + worker.
14. **D5 + D10** — a lint rule keeping business logic out of `.svelte`, then extract pure functions from the three god modules along their existing seams.

**Explicitly not recommended:** extracting any microservice, replacing pg-boss, adding a component-test framework (a linter rule is the lazier and more durable fix for D5), or a broad refactor of `hooks.server.ts` — its wide fan-out is a deliberate, documented request-pipeline design and it works.

---

## Confidence & Gaps

- **Independently re-verified by the lead session:** the LOC/file inventory, the complexity ranking, all 10 debt findings, SEC-001's three preconditions, SEC-003's inert-RLS mechanism (including the absence of `FORCE ROW LEVEL SECURITY` across all 85 migrations), the dead-code list, the empty golden corpus, the dead coverage threshold, and the CI gate list.
- **Taken on the agents' evidence, not re-derived:** SEC-002, SEC-004 through SEC-014 (each carries `file:line`), and the domain-membership table.
- **Could not run:** `knip` (dead *exports*) and `jscpd` (duplication %) — no `node_modules` in this worktree, and nothing was installed. So the duplication inventory is from function-name collision analysis: it catches same-named clones and **misses renamed copy-paste**. `jscpd` also does not tokenize `.svelte` (`scripts/check-duplication.mjs:14`), so 25k Svelte lines are unmeasured for duplication — likely relevant to the `mobile/` vs `desktop/` component split, which was not diffed.
- **Not assessed:** whether `mobile/*` and `desktop/*` pairs duplicate business logic or only presentation; the internals of `alerts.ts` (1,141 lines) and `system-health.ts` (802) beyond the median issue; test pass rate and actual coverage percentage (suites were not executed).
- **Ask an SME:** (a) Is `alerts.ts:31`'s lower median deliberate — was the baseline ever specified as a percentile? (b) Which WhatsApp transport is live in production — the Meta Graph API path or Baileys? One may be dead weight. (c) Is any deploy environment currently missing `APP_BASE_URL`, i.e. is the D-adjacent email-link issue live or latent? (d) Was `coverage.include: ['src/**/*.ts']` deliberate scoping or an artifact of never having component tests?
- **Telemetry caveat:** volumes are small (1,523 `GET /(app)` transactions in 30 days), so p99 rests on a modest sample. The *direction* of the pool-stall signal is corroborated by `pg-pool.connect`'s independent 350× spread; the exact 5,155 ms figure should not be treated as stable.

---

*Diagram: `analysis/mise-en-place-sk/ARCHITECTURE.mmd`. Sentry dashboards for the runtime tables are linked in the session transcript.*
