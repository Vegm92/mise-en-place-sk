---
tags: [mep, architecture, audit, dependency-graph]
related: "[[CONTEXT]]"
---

# Global Codebase Architecture & Dependency Graph Audit

Audit date: 2026-09-09 (UTC)  
Scope: repository source, configuration, migrations, tests, and generated TypeScript import graph.  
Evidence labels: **OBSERVED** comes from the listed source; **INFERRED** is a conclusion from that evidence; **UNKNOWN** was not verifiable from the repository.

## Method and evidence limits

- `node scripts/madge-report.mjs` was run on 2026-09-09T11:31:55.168Z. It parsed 296 TypeScript/JavaScript files and 1,020 import edges. Its full machine-readable output is [madge-out/graph.json](../../madge-out/graph.json) and the reproducible summary is [madge-out/MADGE_REPORT.md](../../madge-out/MADGE_REPORT.md).
- Madge deliberately does not parse Svelte component scripts; router convention files are runtime entry points rather than imported files. Its orphan list is therefore a candidate list, not a dead-code verdict.
- The audit inspected the request entry point (`src/hooks.server.ts`), worker entry point (`src/worker.ts`), schema, queues, central services, deployment files, and all import graph cycles. It does not prove production traffic, ownership, deployment configuration values, or runtime health.

---

## 01 — Executive summary

### Current architecture

**OBSERVED:** Mise en Place SK is a SvelteKit modular monolith: Svelte pages and server routes share a `src/lib/server` application layer, PostgreSQL/Drizzle is the system of record, and a second process consumes `pg-boss` jobs from the same PostgreSQL database. `docker-compose.yml`, `railway.json`, and `railway.worker.json` deploy one image as web and worker processes. S3-compatible storage, Gemini, Stripe, Resend, Upstash Redis, Sentry, and WhatsApp are optional external boundaries configured by environment variables.

```text
Browser / WhatsApp / Stripe
          │ HTTP / webhook
          ▼
SvelteKit web process ──── PostgreSQL (Drizzle + RLS + pg-boss)
          │                         ▲
          │ enqueue jobs            │ reads/writes
          ▼                         │
     pg-boss queues ───────────── Worker process
          │                         │
          └── Gemini / S3 / Resend / Stripe / WhatsApp / Sentry
```

### Top structural problems

1. **P0 — Database and schema are global hubs.** `db.ts` has fan-in 115 and `schema.ts` 101; feature modules can directly couple to shared persistence.
2. **P0 — The worker scheduling/alerts/products/WhatsApp area contains six detected import cycles**, rooted through `queue.ts` and `alerts.ts`.
3. **P1 — `alerts.ts` is a god module**: fan-out 26, alert calculation, scheduling, queue monitoring, tenant fan-out, and multiple maintenance jobs.
4. **P1 — `invoice-save.ts` (fan-out 24) and `extraction-worker.ts` (19) coordinate several domains**, making invoice ingestion change-prone.
5. **P1 — `hooks.server.ts` (fan-out 24) owns many cross-cutting concerns**: authentication, tenancy, access, rate limiting, feature flags, locale, Sentry, metrics, cache and headers.
6. **P1 — Queue contracts are scattered.** Queue names and payload types live in `queue.ts`, while consumers and scheduled jobs are split among `worker.ts`, `alerts.ts`, products, and WhatsApp modules.
7. **P1 — Database-as-integration risk.** Web and worker correctly share PostgreSQL/pg-boss by design, but both also share application schema and storage configuration; a storage mismatch can break extraction.
8. **P2 — Billing is a high-fan-in multi-responsibility module** (fan-in 26): entitlement lookup, Stripe customer/session lifecycle, subscription reconciliation, scheduled repair, and tier propagation.
9. **P2 — Current RLS/tenant context is a critical implicit boundary.** Most request handling wraps resolution in `runWithTenantContext`, but privileged `runAsSystem` calls require especially careful review.
10. **P3 — No production dependency/route graph that includes `.svelte` exists.** Current import graph usefully covers server code but cannot establish component-to-route reachability.

### Top opportunities

1. Split alerts/scheduler/operations into explicit modules without extracting a service.
2. Replace circular type/value dependencies with leaf contract modules.
3. Establish domain-owned persistence facades for the highest-change domains before reducing direct `db`/`schema` imports.
4. Make queue contracts first-class and one-directional.
5. Split invoice processing into ingestion, extraction orchestration, invoice persistence, and product enrichment boundaries.
6. Define a narrow request-policy pipeline around the existing hook rather than moving functionality to a new service.
7. Centralize external integration adapters under explicit contracts; preserve S3/Gemini/Stripe/Resend/WhatsApp anti-corruption boundaries.
8. Generate a combined route/component/server graph in CI and use it to verify orphan candidates.
9. Add contract tests for queues, Stripe webhooks, storage portability, and privileged tenancy transitions.
10. Keep the deployment as a modular monolith plus worker; no currently observed boundary justifies a network microservice.

### Missing nodes and links of highest value

- **Missing node: application job-contract boundary.** Queue names, payloads, retries, and consumer ownership need one dependency-light contract module.
- **Missing node: scheduled operations boundary.** `alerts.ts` owns unrelated scheduled work and infrastructure monitoring.
- **Missing link: explicit domain persistence interfaces.** Feature services directly import `db.ts`/`schema.ts`; data ownership is technically enforced by tenant context but not structurally expressed.
- **Missing link: a route/component-aware dependency graph.** The existing graph cannot validate Svelte-only consumers.

### Recommendation

Evolve to a **modular monolith with a separately deployable worker process**, retaining PostgreSQL and pg-boss. First remove cycles and isolate contracts; then modularize high-value domains. Do not extract a microservice until a domain owns data, has an independent failure/scaling need, and can operate without synchronous shared-schema coupling.

---

## 02 — System inventory

| ID | Type | Name / path | Domain | Responsibility | Dependencies / data | Runtime | Criticality | Complexity | Status |
|---|---|---|---|---|---|---|---|---|---|
| N1 | application | `src/hooks.server.ts` | platform | Request policy and context | Auth, DB/RLS, access, billing, flags, rate limit, Sentry, metrics | web | critical | high | observed |
| N2 | application | `src/routes/**` (147 files) | UI/API | SvelteKit SSR, forms, APIs, webhooks | server modules, SvelteKit | web | critical | high | observed |
| N3 | worker | `src/worker.ts` | operations | pg-boss consumers and scheduler startup | queue, extraction, products, WhatsApp, PostgreSQL | worker | critical | high | observed |
| N4 | persistence | `lib/server/db.ts` + `schema.ts` | platform | Drizzle connection, RLS context, 50+ tables | PostgreSQL | web + worker | critical | very high | observed |
| N5 | tenancy | `tenant-context.ts`, `tenant.ts`, `tenant-gate.ts` | identity | PostgreSQL tenant context and route gate | DB, `restaurantId` local | web + worker | critical | medium | observed |
| N6 | ingestion | `batch.ts`, `extract-batch.ts`, `extraction-worker.ts` | invoices | Batch lifecycle and extraction orchestration | storage, queue, Gemini, invoice/product modules | both | critical | high | observed |
| N7 | invoice | `invoice-save.ts`, `invoice-status.ts` | invoices | Persist and update invoices/line items | DB/schema, alerts, products | both | critical | high | observed |
| N8 | product | `products.ts`, `categories.ts`, `normalize.ts` | catalog | Product normalization, categorization, prices | DB/schema, queue, Gemini | both | high | high | observed |
| N9 | billing | `billing.ts`, `entitlements.ts` | billing | Plans, Stripe, access/quotas, reconciliation | Stripe, DB, notifications | web + worker | high | high | observed |
| N10 | operations | `alerts.ts`, `metrics.ts`, `system-health.ts` | operations | Alerts, cron registration, health, metrics | pg-boss, DB, Sentry | worker + web | high | very high | observed |
| N11 | messaging | `integrations/whatsapp/**`, `whatsapp-bot.ts` | integrations | WhatsApp transport, inbound and notification flows | Baileys/Cloud API, queue, DB | worker + webhook | medium | high | observed |
| N12 | integrations | `storage.ts`, `email.ts`, `llm-provider.ts` | infrastructure | S3/local files, Resend, Gemini adapter | AWS/S3, Resend, Gemini | both | high | medium | observed |
| N13 | database | `schema.ts` | data | Restaurants, invoices, products, usage, auth, billing, operational data | PostgreSQL/RLS | both | critical | very high | observed |
| N14 | tests | `tests/**` | quality | Unit/integration/route coverage | Vitest, test DB fixtures | CI/local | high | high | observed |

**OBSERVED inventory counts:** 145 `src/lib/server` files, 147 route files, 294 test/spec files and 4,013 test declarations by textual count, 139 Drizzle files (including migrations and metadata). These are inventory counts, not coverage or passing-test claims.

---

## 03 — Dependency graph

### Graph facts

- **Nodes:** 296 TypeScript/JavaScript files.
- **Edges:** 1,020 static imports.
- **Cycles:** 8 detected; see below.
- **Graph artifact:** [madge-out/graph.json](../../madge-out/graph.json) is the complete file-level node/edge list.

### High fan-in nodes

| Node | Fan-in | Consequence |
|---|---:|---|
| `lib/server/db.ts` | 115 | Persistence/tenant-context change propagates broadly. |
| `lib/server/schema.ts` | 101 | Shared data model is an architectural hub. |
| `lib/server/env.ts` | 33 | Configuration is widely coupled. |
| `lib/server/load-guard.ts` | 28 | Request helper is a common dependency. |
| `lib/server/billing.ts` | 26 | Billing crosses many UI and platform paths. |
| `lib/constants.ts`, `rate-limit-scope.ts` | 25 each | Shared policy and constants are broad dependencies. |

### High fan-out nodes

| Node | Fan-out | Interpretation |
|---|---:|---|
| `lib/server/alerts.ts` | 26 | God-module candidate. |
| `hooks.server.ts` | 24 | Cross-cutting request policy coordinator. |
| `lib/server/invoice-save.ts` | 24 | Invoice persistence orchestrator. |
| `routes/(app)/settings/+page.server.ts` | 22 | Route-level aggregation hotspot. |
| `lib/server/extraction-worker.ts` | 19 | Worker orchestration hotspot. |

### Cycles

| Cycle | Classification | Evidence and smallest break |
|---|---|---|
| `db.ts ↔ tenant-context.ts` | technical | `db.ts` imports/re-exports tenant context while `tenant-context.ts` imports DB client. Move shared DB types/client capability to a leaf module; let context depend on it, not the facade. |
| `extract.ts ↔ einvoice-parser.ts` | technical/type | Parser imports `ExtractedInvoice` from extraction while extraction imports parser. Move extraction result types to `extraction-contract.ts`. |
| `extract.ts → einvoice-parser.ts → invoice-save.ts → …` | architectural | A parsing concern reaches persistence through the extraction chain. Make parser output a leaf DTO and let an application orchestrator invoke save. |
| `queue.ts → whatsapp-bot.ts → message-handler.ts → jobs.ts → alerts.ts → queue.ts` | architectural | Queue imports a WhatsApp message type; jobs depend on alerts, which depends on queue. Move message/job payload types to `messaging-contract.ts` and split scheduler/alerts from product/queue monitoring. |
| Queue cycle through `pipeline-stats.ts` | architectural | `alerts.ts` imports queue metrics and queue imports lead back through WhatsApp. Keep queue metrics in an operations adapter with no queue producer dependency. |
| Queue cycle through `products.ts` | architectural | `alerts.ts` imports product logic while products imports queue. Extract product price calculation into a leaf domain module. |
| Queue cycle through `media-handler.ts` | architectural | WhatsApp media handler produces extraction jobs and is reachable through message orchestration. Depend on a small `ExtractionJobPort`, not `queue.ts` directly. |
| `driver-baileys.ts ↔ runtime.ts` | runtime/integration | Runtime dynamically imports driver; driver imports runtime flags. Move feature flags/config to `whatsapp-config.ts`. |

### Orphans and dead paths

**OBSERVED:** Madge identifies 34 non-route static-import orphans. `worker.ts`, hooks, migration/backfill CLIs, client hooks, and files consumed only by Svelte are expected runtime roots. **INFERRED:** no item is dead based on this graph alone. Candidate review should begin with `lib/admin-readiness.ts`, `lib/donut-math.ts`, `lib/legal-entity.ts`, `lib/notification-actions.ts`, `lib/pulse-math.ts`, `lib/supplier-cadence-label.ts`, and `lib/server/working-days.ts`, then trace route and Svelte consumers before deletion.

---

## 04 — Missing nodes report

| Missing node | Evidence | Current distributed responsibility | Proposed responsibility / interface | Priority |
|---|---|---|---|---:|
| Job contracts | six named queues in `queue.ts`; handlers split across worker, products, WhatsApp and alerts | names, payloads, retries and ownership cross modules | `jobs/contracts.ts`: payload DTOs, names, retry/idempotency policy; producer/consumer ports | P0 |
| Scheduled operations | `alerts.ts` fan-out 26; registers many unrelated cron jobs | alert rules, queue health, maintenance, tenant fan-out | `operations/scheduler.ts` and job modules; alert rules remain domain logic | P1 |
| Domain persistence ports | `db.ts` and `schema.ts` fan-in 115/101 | routes/services query shared tables directly | per-domain repository/query modules with owned read/write contracts | P1 |
| Extraction application service | `extraction-worker.ts` 19 and `invoice-save.ts` 24 fan-out | document routing, quota, storage, Gemini, invoice save, product follow-ups | `invoices/application/process-extraction.ts` orchestrating parser, persistence and post-processing ports | P1 |
| Combined runtime graph generator | Madge omits `.svelte` | no proof of component-to-server reachability | CI graph with Svelte AST + routes + static imports | P2 |

---

## 05 — Missing links report

| Source | Target | Current workaround / risk | Recommended explicit connection | Priority |
|---|---|---|---|---:|
| Feature modules | owned data | direct DB/schema imports blur ownership | domain query/repository interface; no cross-domain writes without application service | P1 |
| Web producers | worker consumers | string queue names plus distributed payload knowledge | typed contract and producer/consumer ownership test | P0 |
| Svelte components | dependency graph | not represented by Madge | generated component/route edges | P2 |
| Web + worker storage | storage configuration | same source but separate containers/local disks | deployment assertion that both services use the same driver/bucket/path contract | P1 |
| privileged request paths | RLS/system context | `runAsSystem` intentionally bypasses tenant context | audited, named system-use cases and tests for each privileged operation | P1 |

---

## 06 — Duplication report

| Layer | Finding | Classification | Consolidation strategy |
|---|---|---|---|
| Infrastructure | external integrations are already adapter-shaped (`storage.ts`, `email.ts`, `llm-provider.ts`, WhatsApp transport) | intentional specialization | retain separate adapters; converge common timeout/retry/observability only where behaviour is identical |
| Workflow | upload and WhatsApp media both enqueue batch extraction | shared abstraction opportunity | retain `enqueueBatchExtraction`; expose it through an ingestion port rather than duplicating pipeline policy |
| Data | schema is a single canonical Drizzle definition | intentional shared representation | do not duplicate DTOs; define boundary DTOs only at external/queue interfaces |
| Configuration | web and worker need shared storage/database/integration vars | required shared configuration, operational risk | validate a role-specific configuration matrix at startup/deploy |
| Logic | alert calculation, scheduling and operational monitoring reside in `alerts.ts` | accidental responsibility convergence | split by responsibility, not by arbitrary file size |
| Code | no textual-duplication verdict was made | unknown | use existing `pnpm lint:duplication` gate when the dependency installation is healthy |

---

## 07 — Complexity report

### Hotspots

| Rank | Component | Problem | Evidence | Recommended action | Effort |
|---:|---|---|---|---|---:|
| 1 | `db.ts` / `schema.ts` | global data hubs | fan-in 115 / 101 | introduce domain data facades incrementally, starting with invoice and billing writes | L |
| 2 | `alerts.ts` | unrelated responsibilities and cycles | fan-out 26; queue/product/operations cycles | split scheduler, operational health and alert rules | M |
| 3 | `queue.ts` | queue contract participates in multiple cycles | 14 consumers; queue/WhatsApp/alerts cycles | create leaf job contracts and producer port | M |
| 4 | `invoice-save.ts` | high orchestration coupling | fan-out 24 | make persistence a narrow invoice command/query module | M |
| 5 | `hooks.server.ts` | cross-cutting policy concentration | fan-out 24 | retain one entry point but compose named policies with contract tests | M |
| 6 | `extraction-worker.ts` | pipeline coordinator owns many external/domain dependencies | fan-out 19 | move phases behind ports; preserve one transaction/workflow owner | M |

### Failure, security and observability graph

**OBSERVED:** worker jobs use pg-boss, dead-letter recording, heartbeat, Sentry, and a separate worker deployment. `hooks.server.ts` assigns request IDs, Sentry context, security headers, cache headers, rate limits, authentication and tenant context. `worker.ts` registers exception handlers and heartbeat.

**INFERRED:** the main failure boundary is the worker/database/storage triangle. If web and worker storage configuration diverges, an uploaded document may not be available to extraction. If PostgreSQL fails, application data, queue, RLS context, and worker scheduling fail together. This is acceptable for a modular monolith but makes PostgreSQL the explicit shared availability dependency.

**UNKNOWN:** production alert routing, trace correlation across queue jobs, and external-provider retry outcomes cannot be proven without running configuration and telemetry.

### API and event architecture

| Interface | Producer | Consumer | Contract / resilience evidence | Assessment |
|---|---|---|---|---|
| SvelteKit page/form/API routes | browser | SvelteKit web | route handlers plus hook auth/access/tenant pipeline | primary synchronous API; no separate gateway is justified |
| Stripe webhook | Stripe | `routes/api/stripe-webhook/+server.ts` → `billing.ts` | signature validation is delegated to `handleWebhookEvent`; webhook handler is system-context exempt | explicit external boundary; retain contract tests |
| WhatsApp webhook | WhatsApp | `routes/api/whatsapp/webhook/+server.ts` → queue/worker | inbound queue, idempotency/claim behavior and worker consumer | explicit async boundary; contract types should be decoupled from queue implementation |
| `extract-invoice` | web/WhatsApp | extraction worker | item/restaurant/request identifiers, pg-boss retry and DLQ | high-value typed contract candidate |
| `normalize-product`, `categorize-product` | invoice/product flow | worker | product identifiers + request ID, pg-boss/DLQ | keep asynchronous; decouple contract |
| WhatsApp queues | integration/extraction flow | worker | inbound and notification queues, transport conditionally started | adapter boundary; ensure disabled transport behavior is observable |
| scheduled pg-boss queues | `registerScheduledJobs` | worker | UTC cron registration, system context, DLQ recording | split registration ownership from alert calculation |

### Architectural health score

Scores describe the observed source topology, not production reliability.

| Dimension | Score | Evidence |
|---|---:|---|
| Cohesion | 6/10 | clear domain files exist, but `alerts.ts`, invoice orchestration, and billing combine multiple concerns |
| Coupling | 4/10 | `db.ts`/`schema.ts` fan-in 115/101 and eight cycles |
| Duplication | 6/10 | shared helpers/adapters exist; workflow/configuration convergence remains |
| Boundary clarity | 6/10 | SvelteKit/web-worker and tenant boundaries are clear; persistence ownership is not |
| Data ownership | 5/10 | RLS context exists, but shared schema imports are extensive |
| Dependency hygiene | 4/10 | generated graph is present but has eight cycles and no Svelte coverage |
| Testability | 7/10 | 294 test/spec files and 4,013 textual tests; pass rate/coverage UNKNOWN |
| Observability | 7/10 | request IDs, Sentry, worker heartbeat, metrics and health endpoints are observed |
| Resilience | 7/10 | pg-boss retries/DLQ, heartbeat and error handlers are observed; production outcomes UNKNOWN |
| Security boundaries | 7/10 | auth, request gate, RLS context, rate limits and headers are centralized in hooks |
| Deployment independence | 6/10 | web/worker deploy independently but share DB/schema/storage configuration |
| Architectural simplicity | 6/10 | modular-monolith topology is appropriate, though central hubs obscure change paths |

---

## 08 — Domain map and data ownership

| Bounded context | Owned concepts / tables | Inbound interfaces | Outbound interfaces | Boundary recommendation |
|---|---|---|---|---|
| Identity & tenancy | users, accounts, sessions, restaurants, user_restaurants | auth hooks, onboarding, admin | RLS context, membership/access decisions | keep modular; security boundary |
| Invoice ingestion & extraction | upload_batches, batch_items, extraction_results, invoices, invoice_line_items | uploads, WhatsApp media, worker jobs | Gemini, storage, product enrichment, alerts | modularize first; high cohesion |
| Product intelligence | products, aliases, categories, stock levels, conversions, price data | invoice persistence, product routes, jobs | normalization/categorization jobs, alerts | modularize first |
| Billing & entitlements | subscriptions, usage_events, monthly_usage, quotas | billing routes, Stripe webhook, scheduler | Stripe, access/feature checks, notifications | keep modular; no service now |
| Operations & notifications | system_notifications, dead_letter_queue, heartbeats, metric samples, digest shares | worker scheduler, admin/health | pg-boss, Sentry, Resend, WhatsApp | split internally; no service now |
| Messaging integration | WhatsApp session/contact/event/pairing tables | webhook, worker transport | WhatsApp Cloud/Baileys, extraction port | keep adapter/module; extract later only for operational isolation |
| Reporting & analytics | metrics, aggregates, reports | route loads, scheduled refresh | DB read models, exports | keep modular/read-model oriented |

**Data ownership assessment:** tenant-scoped tables are protected by PostgreSQL RLS/context (**observed**), yet the import graph shows wide shared schema access. Treat the table list above as target ownership, then prohibit cross-context writes except through an explicit application command. The database remains a shared deployment resource; it is not an API for future services.

---

## 09 — Service candidate matrix

| Candidate | Cohesion | Coupling | Data ownership | Independent scaling | Failure isolation | Operational cost | Recommendation |
|---|---:|---:|---:|---:|---:|---:|---|
| Core SvelteKit application | 9 | 3 | 8 | 4 | 4 | 2 | KEEP MODULAR |
| Extraction worker | 8 | 5 | 6 | 9 | 8 | 4 | KEEP SEPARATE PROCESS, NOT SERVICE |
| Invoice extraction | 8 | 6 | 7 | 8 | 7 | 6 | EXTRACT LATER only after owned persistence/contract boundary |
| Billing | 8 | 5 | 7 | 3 | 5 | 7 | KEEP MODULAR |
| WhatsApp | 7 | 6 | 5 | 6 | 6 | 6 | EXTRACT LATER if transport operation requires independent lifecycle |
| Alerts/scheduler | 4 | 8 | 4 | 5 | 5 | 6 | MODULARIZE FIRST |
| Shared DB/schema | 2 | 10 | 1 | 1 | 1 | 9 | DO NOT EXTRACT |

No candidate currently satisfies the full service rule: independent deployability without shared-schema coupling, clearly owned data, and low synchronous coordination. The existing two-process topology is justified by workload isolation.

---

## 10 — Target architecture

```text
                    SvelteKit web
         routes/components + request-policy pipeline
                               │
      ┌────────────── application commands/queries ──────────────┐
      │ Identity │ Invoices │ Products │ Billing │ Operations     │
      └──────┬──────────┬──────────┬──────────┬──────────────────┘
             │          │          │          │
         domain-owned persistence ports / typed job contracts
             │          │          │          │
        PostgreSQL + RLS + pg-boss ──────── Worker process
                                           │
                          extraction / product / messaging adapters
                                           │
                    Gemini, S3, Stripe, Resend, WhatsApp, Sentry
```

### Rules

1. Route code calls application commands/queries; it does not coordinate cross-domain persistence.
2. Domain modules own writes to their tables; other domains use a command/query contract.
3. Job contracts are leaf modules: contracts do not import worker, routes, adapters, or domain implementation.
4. Worker consumers depend inward on application services and outward on adapters only.
5. `runAsSystem` exists only in named system use cases; default paths remain tenant-scoped.
6. Keep process deployment separate for web/worker. Do not add a network boundary until the service matrix changes.

---

## 11 — Migration roadmap

| Priority / phase | Before → after | Dependencies | Tests / success criteria | Rollback |
|---|---|---|---|---|
| P0 / 0 | static TS graph only → CI-generated TS + Svelte route graph | graph script | graph generated; route roots no longer listed as dead by default | remove CI gate |
| P0 / 1 | cyclic queue/types → leaf contracts/config modules | no schema change | cycle count falls from 8; queue producer/consumer contract tests pass | retain adapter exports temporarily |
| P1 / 2 | `alerts.ts` scheduler/health/domain rules mixed → separate operations modules | job contracts | scheduled-job registration and alert tests pass; no changed cron names | preserve façade forwarding to old modules |
| P1 / 3 | direct cross-domain DB writes → domain command/query boundaries | inventory of table writers | RLS and tenant-isolation suites pass; one domain migrated at a time | retain existing DB access behind façade |
| P1 / 4 | extraction coordinator mixes infrastructure/domain work → application workflow plus ports | extraction fixtures | document extraction, retry, segmentation, quota and DLQ tests pass | keep old orchestration entry point as adapter |
| P2 / 5 | web/worker config implication → enforced role configuration matrix | deployment pipeline | startup/deploy check rejects mismatched storage configuration | disable validation only for emergency repair |
| P2 / 6 | broad hook coordination → composed policy functions | request-route tests | auth, access, tenant, rate-limit and header regression tests pass | preserve ordered composition facade |
| P3 / 7 | shared schema as universal interface → documented domain ownership/enforcement | completed earlier phases | architectural import rules prevent new prohibited dependencies | warn-only rule before enforcement |

### Architectural fitness test

Every roadmap item reduces a cycle, fan-out, or implicit cross-domain link without adding a network hop. The proposed target improves ownership and change isolation while keeping PostgreSQL transactions, RLS, and in-process calls where they are currently valuable. Any future extraction of a service must first prove independent data ownership, failure behavior, scaling need, observability, and a rollback path.

### Change hotspots and expected blast-radius reduction

- **Persistence change:** today potentially touches 115 `db.ts` consumers; domain facades localize future changes to a context.
- **Job change:** today crosses queue strings, worker registrations and feature modules; typed contracts create one producer/consumer seam.
- **Operations change:** today may traverse alert rules, products, queue metrics and scheduler registration; splitting operations isolates maintenance work.
- **Invoice workflow change:** today spans ingestion, storage, extraction, save and product follow-up; one application workflow makes the change owner explicit.
