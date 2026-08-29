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

Build a **vendor-neutral sales ingest layer first**, and native connectors
second. Concretely:

| Phase | What | Why |
|---|---|---|
| **0** | Generic Sales API (a documented endpoint TPVs and dealers push to) + a CSV / Z-report importer | Works with *all* TPVs on day one, including the on-premise ones we cannot reach. Zero vendor dependency, zero vendor negotiation. This is exactly the pattern Haddock uses. |
| **1** | **Revo XEF** native connector | Best public API of the Spanish natives, cloud-hosted, born in Barcelona province, and already named in our landing copy |
| **2** | **Glop** connector | Genuinely public REST docs with webhooks; lowest friction after Revo |
| **3** | **Lightspeed K-Series** connector | Best-documented API of all five, but partner-gated — start the partner application early because approval is the long pole |
| **4** | **Ágora** and **ICG** | Largest install bases, hardest architecture (on-premise). Needs a local agent or dealer-channel cooperation. Do not start here despite the market share |

The ordering is deliberately *inverse to install base*. Ágora and ICG have the
most terminals in Spain; they are also the two that cannot be reached from our
cloud without extra machinery. Phase 0 is what lets us serve their customers
anyway.

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
building the generic layer in Phase 0 rather than a pile of bespoke connectors.

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
| 2 | **Ágora** (IGT Microelectronics) | Valencia; **37,000+ customers in Spain** | Huge among traditional independents — bars, cafeterías, menú del día | **On-premise** LAN server; ACMS for chains | API via paid add-on module, reachable only on the local network | **High** |
| 3 | **ICG Software** (FrontRest / HioPOS) | Spanish, since 1985; HioPOS sold in 12 countries | Strong in mid-market, groups and hotels across Catalonia | On-premise SQL Server (FrontRest) + HioPOS Cloud | Database-level (ICG Analytics works directly over any ICG database); dealer channel | **High** |
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

**Assessment.** This is a LAN-resident server, not a cloud API. The implications
are serious and shape the whole architecture:

- We cannot pull from our cloud unless the venue exposes a port to the internet
  with a static IP — which many independents do not have, and which we should
  not encourage them to create.
- Chains running ACMS are reachable centrally; single independents largely are
  not.
- There is a **per-venue licence cost paid to Ágora**, and it is gated by the
  local distributor. Integration is therefore a commercial conversation with the
  dealer channel, not just an engineering task.

This single finding is the strongest argument for the Phase 0 push model: for
Ágora venues, the practical path is that *Ágora (or its dealer) pushes to us*,
or a small local agent does, rather than us reaching in.

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
fragile, version-coupled, and a security liability inside a customer's LAN. The
realistic route is the ICG partner channel plus our generic push API. Prioritise
HioPOS Cloud venues if a cloud API materialises there.

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

### 5.1 Two patterns, not one

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

**Landing copy — needs a decision**

`docs/onboarding/marketing/00_base/02_reglas_inquebrantables.md` and
`docs/onboarding/marketing/03_canales/landing_waitlist.md` both flag that the
live landing promises connection to **Square and Revo "desde el primer día"**,
and that this is not built. This report does not resolve that by itself. Two
honest options:

1. Build the Revo connector (Phase 1) and make the Revo half true. Then drop or
   qualify Square, which has a small Barcelona share and does not deserve equal
   billing.
2. Amend the copy now to a forward-looking claim, and keep rule 1 intact.

Doing neither is the only genuinely bad outcome, and it gets worse the moment
real traffic arrives.

---

## 9. Decisions needed from Victor

1. **Is TPV integration a product goal?** The marketing docs carry this as an
   open question. Everything above assumes yes.
2. **Generic-push-first, or Revo-first?** This document argues push-first
   because it serves Ágora and ICG venues we otherwise cannot reach — but
   Revo-first makes existing landing copy true sooner.
3. **Square**: keep it in the promise, or drop it? Its Barcelona share does not
   justify connector work on merit.
4. **Local agent for on-premise venues** — in scope, or do we simply decline
   Ágora/ICG single-site independents until their vendors push to us?
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
- [Square para hostelería (ES)](https://squareup.com/es/es/solutions/hospitality) · [Square llega a España — MuyCanal](https://www.muycanal.com/2022/01/25/square-comercio-tpv)
- [Last.app — software TPV](https://www.last.app/producto/software-tpv) · [Camarero10](https://www.camarero10.com/) · [Numier](https://numier.com/) · [Hosteltáctil](https://hosteltactil.com/)
