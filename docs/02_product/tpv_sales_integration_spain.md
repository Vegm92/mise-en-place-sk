---
tags: [mep, product]
related: "[[CONTEXT]]"
---

# TPV integration — the Spanish market and how sales data reaches Mise en Place

Researched 2026-08-29 from public sources, focused on Barcelona. Companion to
`docs/02_product/competitor_xtrachef.md`.

The app today only knows what a restaurant **buys** (albaranes and facturas →
`invoices` → `invoice_line_items` → `products`). It does not know what the
restaurant **sells**. Every ratio a chef actually manages by — food cost %,
margin per dish, theoretical vs real consumption — needs both halves. This
document identifies the TPV systems worth connecting to, what each one will
actually give us, and the architecture that gets sales into the schema.

> **Verification note.** The vendor documentation portals (`api.revo.works`,
> `apidoc.glop.es`, `support.revo.works`, `agorapos.com`,
> `api-docs.lsk.lightspeed.app`) are blocked by this environment's network
> egress policy, so the API details below come from search-engine extracts of
> those pages, not from reading them directly. Endpoint names, pagination limits
> and event names are quoted where a source stated them, but **every one must be
> confirmed against the live docs before a line of connector code is written.**
> Nothing here should be repeated in customer-facing material — see
> "Landing copy" below.

---

## 1. Recommendation up front

**Do not pick a vendor first.** Every native connector — Revo's token, Glop's
portal registration, Lightspeed's partner programme, Ágora's per-venue licence —
costs a negotiation before it returns a single row of data, and each one buys you
exactly one vendor.

There is a path that needs no vendor's permission at all: **every one of the five
already has a web back office that the restaurant logs into, and every one of them
exports sales to CSV or Excel.** A headless browser signing in with the
restaurant's own credentials gets the same file. One mechanism, all five vendors,
nobody to ask.

| Phase | What | Why |
|---|---|---|
| **0** | **Headless back-office sync** — sign in as the restaurant, pull the sales export | Vendor-agnostic and un-gated. Works across all five without a partner programme, a dealer licence or an API approval. Proves the whole downstream product before we spend a single negotiation. |
| **0b** | CSV / Z-report drag-and-drop | The manual fallback for anything headless cannot reach (2FA, an unusual back office). Two days of work; makes the feature universal. |
| **1** | **Revo XEF** native connector | Once headless proves demand, this is the first vendor worth doing properly: real webhooks, a sandbox, and chain-level tokens. |
| **2** | Generic push endpoint (the Haddock pattern) + **Glop** connector | The push endpoint lets vendors and dealers integrate *us* once we are worth integrating with. Ordering matters — it needs adoption to be worth publishing. |
| **3** | **Lightspeed K-Series** | Best-documented API of the five, but partner-gated. Start the application in phase 1; approval is the long pole, not the code. |

The point of phase 0 is not that it is elegant. It is that **it is the only step
that does not depend on anyone else saying yes**, and it makes every later phase a
choice rather than a prerequisite.

> **A revision this changes.** An earlier draft of this document ranked Ágora and
> ICG as effectively unreachable because both are on-premise. That is true of their
> *databases* and false of their *back offices* — ICG's HiOffice is a cloud ERP that
> exports Excel, and Ágora's administration is reachable remotely through My Ágora
> Premium. Headless access substantially flattens the difficulty gap between all
> five. See §4.2 and §4.3.

---

## 2. Why this is worth doing now

**The regulatory tailwind is large and dated.** VERI\*FACTU (RD 1007/2023, as
postponed by RDL 15/2025) makes certified invoicing software mandatory for
companies on **1 January 2027** and for the self-employed on **1 July 2027**.
From those dates every TPV in Spain becomes a certified invoicing system
producing an immutable, hash-chained record per ticket, carrying a QR code, in a
format the AEAT specifies. Penalties run from €300 to €50,000 or 20% of turnover.

The consequence for us: **sales data across all Spanish TPVs is about to become
structurally standardised**, in the same way supplier invoices are being
standardised by Facturae/UBL (which `src/lib/server/einvoice-parser.ts` already
exploits). A VERI\*FACTU-shaped ingest path is a vendor-neutral sales feed that
does not care which TPV produced it. This is the strongest single argument for
normalising sales into **one internal model that every source writes into**,
rather than letting a pile of bespoke connectors each shape their own — and for
not over-investing in any single vendor's payload today, since the shape of that
payload is legislated to change in 2027 anyway.

*This does not make us VERI\*FACTU-compliant and we must never say it does — we
do not issue invoices. See `docs/onboarding/marketing/00_base/02_reglas_inquebrantables.md`
rule 2 and MDR-001.*

**The competitive gap is already documented.** `docs/onboarding/marketing/01_estrategia/analisis_competencia_bcn.md`
lists "Integración TPV → margen real por plato (coste × venta)" as a capability
Haddock and Gstock have and we do not, and leaves an open action: *"Confirmar con
Victor si alguna vez se evaluó integración TPV."* This document is the answer to
that open item.

- **Haddock** (Barcelona, YC) — the direct rival. Ships a free **generic TPV
  API**: sales (orders with their payments and items) plus catalogue sync,
  activated by the restaurant in *Configuración → Mis integraciones → API
  genérica para TPVs*, with technical docs and a free test environment given to
  the TPV vendor. TPVs already pushing into it include DSTnet, Fourvenues,
  Haleteo, **ICG FrontRest**, Intersoft, Madisa, OfiBarman, OptiRest, Platomico,
  Techni-Web and Turbopos — plus named per-vendor connectors for Ágora, Glop,
  NEO and Yantar.
- **Gstock** — connects purchases, recipes and sales to give theoretical vs real
  consumption; TPV integration sits in its higher plan.

Haddock's generic API is the single most copyable idea in this document. It
inverts the integration cost: instead of us writing N connectors, the TPV vendor
or its dealer writes one adapter against our spec, because *their* customer is
asking for it.

**We already have a stub waiting for this data.** `docs/03_features/stock.md`
states plainly: *"Burn rate is user-supplied; there is no automatic burn
inference from TPV data (that integration is waitlist-copy only, not
implemented)."* `stock_levels.daily_burn_rate` exists and is hand-entered.
`src/routes/(app)/api/stock-levels/+server.ts` `POST` is documented as the "TPV
sync stub". Sales data fills it automatically.

---

## 3. The market

Sizing, from a single trade source and therefore to be treated as indicative
rather than established: the Spanish restaurant POS market is put at over €400M
a year growing ~12% compound, with typical pricing of €99–199 per terminal per
month and €400–800 of up-front hardware.

Barcelona is a deep and unusually modern market: the Gremi de Restauració de
Barcelona addresses **more than 9,000 bars and restaurants** in the city, and the
council counted **6,899 terrace licences in 2025** (a third of them in Eixample,
2,296). It is also the home city of Revo (Manresa, Barcelona province),
Last.app and Haddock — the density of cloud-native TPVs here is higher than the
Spanish average, which is why Barcelona-first is the right lens and why Revo
outranks its national install base for our purposes.

### 3.1 The top five for Barcelona

Ranked by *strategic value to us* — a blend of local install base and how
reachable the data is — not by raw national terminal count.

| # | System | Who | Position in BCN | Architecture | Data access | Integration difficulty |
|---|---|---|---|---|---|---|
| 1 | **Revo XEF** (Cegid Revo) | Founded 2013, Manresa (Barcelona). ~1,900 clients / 35,000+ users at acquisition; bought by Cegid in 2023 | Very strong in modern/independent Barcelona restaurants; reference clients include Meliá, Catalonia Hotels & Resorts, UDON | Cloud, iPad-native | Public REST API + webhooks + sandbox | **Low** |
| 2 | **Ágora** (IGT Microelectronics) | Valencia; **37,000+ customers in Spain** | Huge among traditional independents — bars, cafeterías, menú del día | **On-premise** LAN server; ACMS for chains; web admin remote via My Ágora Premium | API needs a paid per-venue licence; **back office exports PDF/Excel** | **High** by API, **medium** headless |
| 3 | **ICG Software** (FrontRest / HioPOS) | Spanish, since 1985; HioPOS sold in 12 countries | Strong in mid-market, groups and hotels across Catalonia | On-premise SQL Server (FrontRest) + **HiOffice cloud back office** | No public API, but HiOffice **exports Excel/PDF/Sheets** over the web | **High** by API, **low–medium** headless |
| 4 | **Glop** | Valencia | Solid SMB presence, strong stock features | Windows-based with cloud services | **Public documented REST API + webhooks** (`apidoc.glop.es`) | **Low–Medium** |
| 5 | **Lightspeed Restaurant (K-Series)** | International (Canada); absorbed Gastrofix | Mid/high-end restaurants and hotel F&B | Cloud | Best-documented API of the five, but **partner-gated** | **Medium** (technically easy, commercially slow) |

### 3.2 Runners-up worth tracking

- **Last.app** — Barcelona, delivery-native, claims 200+ integrations. High
  local relevance; a likely Phase 2 addition and a plausible partner rather than
  purely a data source.
- **Hosteltáctil**, **Numier**, **Camarero10** — meaningful Spanish install
  bases. Camarero10 and Hosteltáctil both integrate delivery through **Ordatic**.
- **Square** — in Spain since 2022 (1.25% + €0.05 in-person). Excellent API, but
  a small share of Barcelona restaurants. **It is named in our landing copy,
  which is a problem discussed below, not a reason to prioritise it.**
- **SumUp POS**, **Tipsi** — low end, no fixed monthly fee. Relevant for the
  smallest venues.
- **L'Addition** — French, actively marketing into Barcelona.
- **Ordatic** / **Connect Manager** / **Deliverect** — delivery middleware
  (Glovo, Uber Eats, Just Eat, Deliveroo), ~€50–150/month. Not TPVs, but they
  already sit between the aggregators and the TPV, and Deliverect already
  carries a Gstock connector. A middleware partnership is a plausible shortcut
  to many TPVs at once and should be evaluated in Phase 2.

---

## 4. Per-vendor integration teardown

### 4.1 Revo XEF — the one to build first

- **Docs**: `api.revo.works`, covering Xef, Retail, Flow and SOLO. Stated
  capability: fetch records, fetch/update the catalogue, create orders, manage
  stock.
- **Auth**: a token created in the Revo XEF Back Office (`revoxef.works`) under
  *Manage Account*; callers present a Revo username plus API token. A token on
  the master account reportedly reaches all sites in a chain — directly useful
  for our multi-location model.
- **Base endpoint**: `GET https://revoxef.works/api/external/v3/accounts`.
- **Orders**: paginated, 50 per page by default, up to 200 via `?pagination=200`.
  The documentation explicitly says this endpoint is **not** for real-time order
  retrieval and directs real-time consumers to webhooks.
- **Webhooks**: managed at `https://revoxef.works/account/webhooks`, with events
  including `order.updated`.
- **Sandbox**: `https://integrations.revoxef.works` — a real test environment,
  which materially de-risks development.
- **Ecosystem**: 50+ third-party integrations already, including ERP, BI and
  purchasing categories, so the commercial path is well-trodden.

**Assessment.** Cloud-hosted, token-authenticated, paginated history for
backfill, webhooks for freshness, and a sandbox. This is a textbook connector and
should be the reference implementation the others conform to. Chain-level tokens
also align with `restaurants` / `user_restaurants` multi-location support.

**Open questions for the vendor**: exact order payload fields (do we get
per-line PLU, tax rate, discounts, payment method breakdown?); whether closed/Z
totals are exposed separately from individual orders; rate limits; whether a
partner agreement is needed for production tokens or the restaurant can
self-serve one.

### 4.2 Ágora — biggest independent base, hardest architecture

The Haddock connection flow is the clearest public description of how an
external system talks to Ágora, and it reveals the architecture:

1. An **access key / API token**, found in Ágora under *Módulos Adicionales*.
2. A **server URL — the fixed IP of the venue** (with an explicit port when
   several venues share one IP).
3. Optionally a **restaurant identifier**, only when **ACMS** (Ágora Central
   Management System) is configured.
4. Activation of a **paid Ágora integration licence**.

**Assessment of the API path.** This is a LAN-resident server, not a cloud API.
We cannot pull from our cloud unless the venue exposes a port with a static IP,
which many independents do not have; and there is a **per-venue licence paid to
Ágora**, gated by the local distributor, so the API route is a commercial
conversation with the dealer channel before it is an engineering task.

**But the back office is a different story.** Ágora ships a browser-based
**Administración Web** for managing the business remotely in real time, and its
reports — sales, stock, accounting, employees — **export to PDF and Excel**.
Remote access is provided by **My Ágora Premium**, which explicitly removes the
fixed-IP and dynamic-DNS requirement; what it still needs is a router port
forwarded to the Ágora server and a recent version (Ágora Restaurant 4.2.9 /
Retail 2.4.9).

So Ágora is reachable headlessly **for any venue already running My Ágora
Premium** — which is the same venues whose owners are engaged enough to want
what we sell. It is a qualification question at onboarding ("do you log into
Ágora from home?"), not an architectural dead end. For venues without it, the
CSV fallback and the push endpoint remain.

### 4.3 ICG (FrontRest / HioPOS) — enterprise-shaped, channel-mediated

ICG is a 1985-vintage Spanish vendor with FrontRest (restaurants), FrontRetail,
HioPOS (cloud, 12 countries) and ICGManager (ERP). ICG Analytics is marketed as
working **directly over any ICG database**, which tells us the integration
surface is fundamentally the SQL Server database rather than a documented public
REST API.

Notably, **ICG FrontRest already appears in Haddock's generic-TPV list** — so an
ICG-side adapter that pushes sales to a third party demonstrably exists and is
achievable. That is a strong signal that the push model works for ICG and the
pull model does not.

**Assessment.** Do not attempt a direct database integration ourselves: it is
fragile, version-coupled, and a security liability inside a customer's LAN.

**The back office reverses the verdict.** ICG's **HiOffice Premium** is a web
back-office ERP reached over the internet from any browser, centralising data
from every HIOPOS terminal in the customer's database in real time, with
**reports exported to Excel, PDF or Google Sheets**; ICG Analytics likewise
exports to CSV, Excel and PDF. That makes ICG one of the *more* accessible of the
five by the headless route, not one of the least — the opposite of the
database-level conclusion above.

ICG FrontRest also already appears in Haddock's generic-TPV list, so an ICG-side
push adapter demonstrably exists too. Two viable routes; neither is the SQL
Server.

### 4.4 Glop — the easiest technical win after Revo

- **Docs**: a genuine public developer portal at `apidoc.glop.es` (Stoplight),
  described as extending Glop across all its verticals and integrating it with
  other software.
- **Onboarding**: registration through Glop support is required before use —
  gated, but lightly.
- **Objects**: tickets, customers and products, each with its own model and
  endpoints.
- **Webhooks**: external endpoints Glop calls when conditions occur, with
  payload types **ticket**, **customer** and **product**.

**Assessment.** `ticket` + `product` webhooks are exactly the shape we need:
sales events plus the catalogue to map them against. Glop also markets strong
stock control, so its customers are already cost-conscious — a good fit for our
buyer. Glop additionally integrates Ordatic for delivery, so delivery revenue
arrives through the same pipe.

**Note**: we must ingest only `ticket` and `product`. We have no use for
`customer` and should not receive it — see GDPR below.

### 4.5 Lightspeed K-Series — best docs, slowest door

- **Reporting endpoints**: `/sales`, `/financials`, `/tax-rates` and
  `/payment-methods` expose reporting-grade data per business, explicitly
  intended for nightly pulls into a data warehouse for analytics. That is
  precisely our use case.
- **Webhooks**: full lifecycle notifications for orders and payments, with
  create/modify/remove management endpoints.
- **Scope**: menus, items, dine-in and takeaway orders, staff, financials,
  across multi-business operations.
- **Access**: **reserved for Lightspeed partners and approved merchants**, via a
  Developer Portal that issues API clients and demo accounts. A sandbox exists
  (`api-docs.sbx.lsk.lightspeed.app`).

**Assessment.** Technically the cleanest of all five and the closest match to
what we want to compute. The constraint is entirely commercial: partner
approval. **Start that application in Phase 1 even though the build is Phase 3** —
the paperwork, not the code, is the critical path.

---

## 5. Architecture

### 5.0 Headless first — how it actually works

The restaurant already logs into a web back office and downloads its own sales.
We do the same thing on a schedule, with their credentials, on their behalf.

**Do not scrape the DOM.** That is the version of this idea that deserves its bad
reputation. Every one of these back offices renders its reports from an
underlying JSON or CSV endpoint, and that endpoint is far more stable than the
markup around it. The shape to build is:

1. **Discover once, per vendor.** Drive the back office in a headed browser
   during development, capture the network calls behind "export report", and
   write down the endpoint, its parameters and its response shape. This is a
   half-day of manual work per vendor, done once.
2. **Log in headlessly.** Playwright signs in and yields a session cookie. This
   is the only step that needs a browser.
3. **Fetch over plain HTTP.** With the cookie, call the export endpoint
   directly for a date range. No DOM, no selectors, no rendering. A UI redesign
   does not break this; only an API change does, and those are far rarer.
4. **Parse into the same normalised tables** every other source writes into
   (§6). The headless driver is a *source*, not a special case.

We already have the tooling: Playwright is a devDependency and `pnpm qa:sweep`
already drives headless Chromium against the running app, so the dependency,
the CI experience and the container story are all precedent rather than new.

**Structure it behind a seam, exactly as WhatsApp is.** ADR-025 faced this same
choice — an official API that needed paperwork we did not have, versus an
unofficial route that worked immediately — and resolved it with a transport
interface in `src/lib/server/integrations/whatsapp/`, where `transport.ts`
defines the contract, one driver file is the only thing that imports the
unofficial library, and the handlers never learn which transport they are on.
Swapping to the official Cloud API becomes one file rather than a rewrite.

Do the same here: `src/lib/server/integrations/pos/source.ts` defines
`SalesSource` (`connect`, `testConnection`, `fetchRange`, `fetchCatalog`), and
`driver-headless-revo.ts`, `driver-api-revo.ts`, `driver-csv.ts` are
interchangeable implementations. Then the phase-1 Revo connector genuinely is a
one-file addition, and the headless driver can be retired per-vendor the day an
official route opens — without touching a single line of the sales pipeline.

**This is the same trade the repo has already made once, knowingly**, and it
should be recorded the same way: as an ADR (next number 033) that states the
stopgap, the seam, and the conditions for retiring it.

#### What to be honest about

| Risk | Reality | Mitigation |
|---|---|---|
| **Terms of service** | Some back offices prohibit automated access. This is the real constraint, and it is per-vendor. It is the restaurant's own data and their own credentials, which helps, but it is not automatically a defence | **Read each vendor's terms before shipping that driver.** Where they forbid it, use the CSV fallback for that vendor and pursue the API instead. Prefer an official route the moment one exists |
| **Credential sensitivity** | A back-office password is far more dangerous than an API token — it is usually *write* access to the whole business, not read access to sales | Ask for a **dedicated read-only user** where the TPV supports roles (Revo, Ágora and ICG all have user management). Encrypt at rest (§5.3), never log, never surface in Sentry. This is non-negotiable |
| **2FA / captcha** | Ends automation cleanly where enforced | No workaround worth attempting. This is exactly what phase 0b (CSV upload) is for |
| **Brittleness** | UI changes break DOM scrapers | Largely avoided by hitting the export endpoint rather than the DOM. Budget for per-vendor breakage anyway, and alert on a driver that returns zero rows for a venue that had sales yesterday |
| **Export limits** | Revo's report export is reportedly capped at six months per pull | Fine for a nightly incremental; matters only for the initial backfill, which can page |
| **It looks like a hack to a vendor** | It is un-gated, not covert — we identify ourselves and act for the account holder | Do not disguise the client. A descriptive User-Agent and a sane request rate. If a vendor objects, that is the moment to open the partner conversation, from a position of having their customers |

The honest summary: **headless gets us to real data in weeks instead of
quarters, and it is a stopgap, not a destination.** Phase 1 onwards exists
precisely because we should not still be doing this in two years.

### 5.1 Two patterns for the long run

| | **Pull** (we call them) | **Push** (they call us) |
|---|---|---|
| Fits | Revo, Glop, Lightspeed, Square, HioPOS Cloud | Ágora, ICG FrontRest, and every TPV we have no connector for |
| Mechanism | Worker job: nightly backfill by business date + webhook for freshness | Vendor/dealer/local agent POSTs to our documented endpoint |
| Credentials | We store a per-tenant vendor token | We issue a per-tenant ingest key |
| Effort borne by | Us, per vendor | The TPV vendor, once, against our public spec |

Both terminate in the same normalised tables. The connector is a thin adapter;
everything downstream is vendor-agnostic. **Design the internal sales model
first, then make every connector conform to it** — the inverse (shaping our
schema around Revo's payload) is the standard way this kind of integration rots.

### 5.2 Where it runs

Pull jobs belong in the **worker** (`src/worker.ts`, scheduled via
`src/lib/server/scheduler.ts`, which already runs pg-boss cron for the weekly
digest and reminder emails). Sales sync is the same shape as those jobs:
periodic, tenant-scoped, idempotent, and tolerant of a vendor being down.

Push ingest belongs in a new route under `src/routes/api/` (outside `(app)/`,
since the caller is a machine with an ingest key, not a session), alongside
`api/stripe-webhook` and `api/whatsapp` — both of which are existing precedents
for authenticated machine callers.

The existing `idempotency_keys` table and the `dead_letter_queue` +
`worker_heartbeats` tables give us replay safety and observability for free.

### 5.3 A new requirement: per-tenant credential storage

**Every secret in the app today is an app-level environment variable** —
`GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `WHATSAPP_ACCESS_TOKEN` and the rest are
process-wide, and there is no encryption helper in `src/lib/server/`. POS
integration is the first feature that needs **a different secret per tenant**
(each restaurant's own Revo/Glop token).

This is a genuine new capability and should be treated as its own decision, not
smuggled in as part of a connector:

- An `ENCRYPTION_KEY` env var plus an AES-256-GCM helper
  (`node:crypto` `createCipheriv`), storing ciphertext + IV + auth tag.
- Tokens never returned to the client, never logged, never in Sentry breadcrumbs.
- Rotation and revocation paths (a restaurant disconnecting its TPV must
  invalidate stored credentials).
- Worth an **ADR** (next number is 033) covering key management and rotation.

For push connections the exposure is smaller — we issue the key, so we can store
a hash rather than the secret itself, exactly as a password would be handled.

---

## 6. Proposed data model

Shaped to the repo's invariants: every business table carries `restaurant_id`,
access goes through `forTenant().scope()` (enforced by `lint:tenant-scope`),
migrations in `drizzle/` are canonical (ADR-003).

```
pos_connections
  id, restaurant_id, provider ('revo'|'glop'|'lightspeed'|'agora'|'icg'|'generic'),
  display_name, status ('active'|'error'|'disconnected'),
  credentials_ciphertext, credentials_iv, credentials_tag,
  config jsonb,                 -- site id, base url, timezone, business-day cutoff
  last_sync_at, last_cursor, last_error, created_at
  UNIQUE (restaurant_id, provider, config->>'site_id')

pos_menu_items                   -- the TPV catalogue as the TPV sees it
  id, restaurant_id, connection_id, external_plu, name, name_key,
  category, price, last_seen_at
  UNIQUE (restaurant_id, connection_id, external_plu)

pos_menu_item_links              -- the join that makes everything work
  restaurant_id, pos_menu_item_id, recipe_id, confidence, source ('manual'|'auto')

pos_tickets
  id, restaurant_id, connection_id, external_id, business_date, closed_at,
  net_amount, tax_amount, discount_amount, service_type ('sala'|'barra'|'delivery'|'takeaway'),
  covers, table_ref, staff_ref
  UNIQUE (restaurant_id, connection_id, external_id)

pos_ticket_items
  id, restaurant_id, ticket_id, pos_menu_item_id, external_plu, description,
  quantity, unit_price, net_amount, tax_rate

pos_sale_days                    -- daily rollup; the cheap read path
  id, restaurant_id, connection_id, business_date,
  net_sales, gross_sales, tax_total, discounts, covers, tickets, avg_ticket,
  source ('api'|'push'|'csv'), updated_at
  UNIQUE (restaurant_id, connection_id, business_date)
```

Design notes:

- **`pos_sale_days` is not redundant.** Some sources (a Z-report import, an
  aggregate-only vendor) give us only the daily total, and every dashboard
  number reads from it. Ticket-level detail is an enrichment, not a
  prerequisite — this is what lets Phase 0 ship real value from a CSV.
- **Idempotency by `(connection_id, external_id)`** mirrors the existing
  `uq_invoices_rid_content_hash` dedupe. Re-syncing a date range must upsert,
  never duplicate — TPV tickets get reopened, split and voided routinely.
- **`business_date` ≠ calendar date.** A Barcelona kitchen closing at 02:00
  books those sales to the previous business day. The cutoff hour must be
  per-connection config, or every food-cost number will be subtly wrong on
  weekends. This is the most commonly botched detail in POS integrations.
- **Amounts as `numeric`**, matching `invoices.total_amount`, never `real`.
  (Note `invoice_line_items.quantity` and `stock_levels` currently use `real`;
  do not propagate that.)

### 6.1 The hard part is not the API — it is PLU → recipe

The connector is a week. Mapping *"MENÚ MEDIODÍA"*, *"Bravas"* and *"Bravas
(media)"* from the TPV onto rows in `recipes` is the actual product problem, and
it is the same problem the app already solved once on the purchasing side:
messy supplier line descriptions → canonical `products`, via `product_aliases`
plus a `name_key` normalisation.

**Reuse that pattern rather than inventing a second one.** `pos_menu_item_links`
is deliberately the mirror image of `product_aliases`, and `recipes.name_key`
already exists with a unique index on `(restaurant_id, name_key)`. Suggested
mapping, cheapest first:

1. Exact `name_key` match between `pos_menu_items` and `recipes`.
2. Fuzzy/normalised match surfaced as a **suggestion** the user confirms — the
   same review-and-confirm interaction the Products suggestions tab already uses.
3. Gemini-assisted proposal for the remainder, written back as
   `source = 'auto'` with a confidence, never auto-applied silently.
4. Manual override, always available.

Unmapped PLUs must be visible and quantified ("87% of last week's sales are
mapped to a recipe"), because every downstream number is wrong in an
unobvious way when coverage is partial. Do not compute a food-cost figure from
partial mapping without saying so on the screen that shows it.

**Known-hard cases to design for explicitly**: menús del día and combos (one
PLU, several dishes — needs a composition rule); half portions and
modifiers/extras; open-price items; voided and comped tickets; and menu changes
over time (a re-priced PLU must not rewrite history).

---

## 7. What the data unlocks

Mapped to what already exists in the schema, so the payoff is concrete:

| Capability | Needs | Status today |
|---|---|---|
| **Real food cost %** = purchases ÷ net sales, per period | `invoices` + `pos_sale_days` | The denominator is the only missing piece |
| **Margin per dish** | `recipes.selling_price` and `target_food_cost_pct` (both exist) × actual sales mix | Recipe costing shipped in #766; only sales volume is missing |
| **Menu engineering** (stars / puzzles / plowhorses / dogs) | margin × volume | Falls out of the above almost for free |
| **Theoretical vs real consumption** | explode `pos_ticket_items` → `recipes` → `recipe_items` (nested elaboraciones already supported via `child_recipe_id`) and compare against purchases + stock delta | The variance number is the one chefs pay for — it is where waste and shrinkage show up |
| **Automatic burn rate** | writes `stock_levels.daily_burn_rate` | Closes the stub `docs/03_features/stock.md` documents as user-supplied |
| **Budgets as % of sales** | `category_budgets` currently absolute € | Percentage-of-revenue budgets are how the industry actually works |
| **Sales in digest and chat** | `weekly-digest.ts`, `chat-context.ts` | Both take a data snapshot; adding a sales block is small and high-visibility |

The sequencing matters commercially: **real food cost % is the headline** and
needs only `pos_sale_days`, which even the CSV import delivers. Theoretical vs
real consumption is the defensible, hard-to-copy feature and needs the full
ticket-item pipeline plus good PLU mapping. Ship the headline first.

---

## 8. Risks and open questions

**Technical**

- PLU→recipe mapping quality gates every derived number. Under-invest here and
  the feature produces confidently wrong food-cost figures — worse than none,
  in a market where our differentiation is honesty.
- Business-day cutoff, voids, comps, discounts and combos are each a source of
  silent error.
- On-premise venues (Ágora, most ICG FrontRest) are unreachable without a local
  agent or vendor cooperation. A local agent is a new distributable artefact
  with its own update and support burden — do not commit to one lightly.
- Per-tenant credential encryption does not exist yet (§5.3) and is a
  prerequisite for any pull connector.

**Commercial**

- Lightspeed access is partner-gated; Ágora charges a per-venue integration
  licence through its dealer channel. Both are lead-time items, not build items.
- Ágora and ICG dealers are local businesses that may see us as competing with
  their own back-office modules. The generic push API reframes us as something
  their customer asked them to connect to, which is a much easier conversation.

**Legal / GDPR**

- Ingest **sales**, not **customers**. Glop's webhook types include `customer`
  and delivery tickets can carry names, phone numbers and addresses. Ingesting
  them would pull personal data of our customers' customers into our systems and
  materially expand our data-protection obligations for no product benefit.
  Filter at the connector boundary, drop customer identifiers before persisting,
  and state this in the integration docs.
- Staff identifiers (`staff_ref`) are personal data too. Store a vendor-side
  opaque id, not a name, unless there is a specific product reason.
- Nothing here makes us a VERI\*FACTU system. We read; we do not issue.

**Landing copy — resolved**

Two marketing docs listed the claim "se conecta a Square y Revo desde el primer
día" as live on the landing and unbuilt in the product. **Checked against the
source: the claim is already gone.** `waitlist.faq.1.a` had been retracted in
both locales during the GEO pass (`docs/05_operations/geo_program_plan.md`); the
two marketing docs were simply stale and have been corrected.

The copy now reads, in both locales, that we are **working on** connecting to the
TPVs most used in Spain and that it is **not yet available** — which is true
today and stays true through phase 0, since a headless connector for one
restaurant's own back office is not the same as "connected to Revo".

The rule that still binds: **do not name a specific TPV as connected until it
is.** "Estamos trabajando en ello" is fair; "compatible con Revo" is not, until
a Revo venue is syncing in production.

---

## 9. Decisions needed from Victor

1. **Is TPV integration a product goal?** The marketing docs carried this as an
   open question. Everything above assumes yes.
2. **Is headless-first acceptable to you as a stopgap?** It is un-gated and fast,
   it is how we reach all five without asking anyone, and it carries the
   terms-of-service and credential risks in §5.0. The repo has made this exact
   trade once already (ADR-025, Baileys). If the answer is no, the honest
   alternative is Revo-first and a much narrower phase 0.
3. **Which vendor do we drive first with a real restaurant?** Headless needs one
   willing venue to develop against. Whoever that is decides the first driver —
   so this is a customer-selection question, not a technical one.
4. **Read-only sub-users:** are we willing to make "create an integration user in
   your TPV" part of onboarding? It is friction, and it is the single biggest
   reduction in credential risk available to us.
5. **Entitlement tier.** Sales integration is a natural Pro/Business feature
   alongside `stockTracking`. Which tier, and does it change provisional pricing?

---

## Sources

- [Cegid adquiere REVO — Computing](https://www.computing.es/noticias/cegid-adquiere-revo-para-adentrarse-en-los-sectores-de-restauracion-y-retail/)
- [Cegid compra REVO — TPV News](https://tpvnews.es/actualidad/cegid-compra-revo-para-ampliar-su-presencia-en-el-mercado-del-software-para-restauracion-y-retail-2023092717641.htm)
- [Revo API Reference](https://api.revo.works/) · [Revo XEF API Reference](https://api.revo.works/sections/xef.html) · [Revo integrations](https://revo.works/en/integrations)
- [Glop API Rest — developer portal](https://apidoc.glop.es/docs/glop-api-rest/ZG9jOjIyNDIwMjY0-bienvenido-a-la) · [Glop webhooks](https://apidoc.glop.es/docs/glop-api-rest/939d5fe2254f6-webhooks) · [Glop API e integraciones](https://www.glop.es/api-integraciones/)
- [Lightspeed Restaurant K-Series API docs](https://api-docs.lsk.lightspeed.app/) · [Developer portal](https://api-portal.lsk.lightspeed.app/quick-start/intro)
- [Ágora integraciones](https://www.agorapos.com/integraciones/) · [Ágora TPV](https://www.agorapos.com/)
- [ICG Software — hospitality](https://www.icg.es/en/solutions/hospitality/restaurants/) · [ICG Analytics](https://www.icg.es/downloads/pdf/software/icganalytics/F-ICGAnalytics-ES.pdf)
- [haddock — Integración Genérica para TPVs](https://support.haddock.app/es/article/integracion-generica-para-tpvs-pyieor/) · [haddock — Ágora, conectar TPV](https://support.haddock.app/es/article/agora-conectar-tpv-higiuc/) · [haddock — Glop, conectar TPV](https://support.haddock.app/es/article/glop-conectar-tpv-1oyj2x7/)
- [Gstock — planes](https://g-stock.es/planes-gstock/) · [Gstock en Deliverect](https://www.deliverect.com/es/integrations/gstock)
- [VeriFactu en hostelería — TeamSystem](https://teamsystem.es/magazine/verifactu-hosteleria/) · [5 claves de VeriFactu para hostelería — OFI](https://www.ofi.es/news/5-claves-de-verifactu-para-hosteleria/)
- [Ordatic — Hosteltáctil](https://hosteltactil.com/partners/ordatic/) · [Ordatic — Valencia Plaza](https://valenciaplaza.com/ordatic-la-startup-que-agiliza-a-los-restaurantes-el-uso-de-plataformas-de-delivery)
- [Licencias de terrazas en Barcelona — ViaEmpresa](https://www.viaempresa.cat/es/empresa/cuantas-licencias-terrazas-bares-restaurantes-hay-en-barcelona_2235257_102.html) · [Gremi de Restauració de Barcelona](https://gremirestauracio.com/es/quienes-somos)
- Back-office / headless route: [Revo BACK](https://revo.works/en/revoback) and [Revo reports FAQ](https://support.revo.works/en/articles/773) · [Ágora Administración Web](https://www.agorapos.com/manual/agora-restaurant/html/WA_AdministracionWeb.html) · [My Ágora Premium — acceso a la administración](https://www.infinitel.es/noticia/software/my-agora-premium-acceso-a-la-administracion/) · [ICG HiOffice Premium](https://hiopos.online/erp-hioffice-premium/)
- [Square para hostelería (ES)](https://squareup.com/es/es/solutions/hospitality) · [Square llega a España — MuyCanal](https://www.muycanal.com/2022/01/25/square-comercio-tpv)
- [Last.app — software TPV](https://www.last.app/producto/software-tpv) · [Camarero10](https://www.camarero10.com/) · [Numier](https://numier.com/) · [Hosteltáctil](https://hosteltactil.com/)
