# Terminology — Canonical Domain Terms

Load-bearing terms used across the codebase, specs, routes and docs. Use these
words with these meanings. Where a term differs between the Spanish UI string
and the code identifier, the code identifier is listed. When you introduce a new
concept, add it here before using it in specs.

## Actors and tenancy

| Term | Definition | Code / table |
|---|---|---|
| **Restaurant** | The billing tenant and data boundary. Every business row belongs to exactly one. | `restaurants` |
| **Tenant** | Synonym for restaurant in isolation context; `locals.restaurantId` is the runtime handle. | `restaurantId` / `rid` |
| **Location** | A second restaurant linked via `parentId` (multi-location, Business tier). | `restaurants.parentId` |
| **User** | A person account that can hold memberships to one or more restaurants. | `users` |
| **Membership** | A user↔restaurant link with a role (`owner` default). The basis for authorization. | `user_restaurants` |
| **Active restaurant** | The restaurant a signed-in user currently works in, from the `active_restaurant` cookie. Must be re-validated against membership every request. | cookie + `user_restaurants` |
| **Owner** | The only role that can invite/link WhatsApp numbers/manage billing. | `user_restaurants.role` |

## Ingestion

| Term | Definition | Code / table |
|---|---|---|
| **Batch** | A group of uploaded documents treated as one ingestion unit; the review unit for a multi-file upload. | `upload_batches` |
| **Batch item** | One file inside a batch with its own lifecycle state. | `batch_items` |
| **File class** | The extraction route a file takes: `text_pdf`, `scanned_pdf`, `image`, or `xml`. | `classifyFile` |
| **Extraction** | The AI pass that turns a document into an `ExtractedInvoice`. | `extract.ts` |
| **Extracted invoice** | The typed result of extraction: supplier, header fields, line items, per-field confidences, totals. | `ExtractedInvoice` |
| **Canonical invoice** | A persisted, user-confirmed invoice row (the only authoritative financial record). | `invoices` |
| **Confirmation** | The user's explicit acceptance that makes extracted data authoritative (`low_confidence_ack` gate). | `batch_items: confirmed` |

## Suppliers and products

| Term | Definition | Code / table |
|---|---|---|
| **Supplier** | A vendor, auto-created from invoices, unique per restaurant by lowercased name. | `suppliers` |
| **Category** | One of 14 canonical Spanish categories (`constants.ts`); `'Other'` is the fallback. | `VALID_CATEGORIES` |
| **Product** | A normalizable line-item identity, unique per restaurant by `name_key`. | `products` |
| **Product alias** | A raw invoice string mapped to a product (exact, fuzzy, or LLM-matched). | `product_aliases` |
| **Canonical unit** | The normalized unit a product is measured in (`kg`, `L`, `ud`, …). | `products.canonicalUnit` |
| **Base unit / normalized price** | Unit-of-measure + price per base unit (e.g. €/kg) for pack-aware price comparison. | `base_unit`, `normalized_unit_price` |
| **Unit conversion** | A supplier-scoped conversion factor between purchase unit and canonical unit. | `unit_conversions` |
| **Pack** | A multi-pack quantity in a line item ("3 x 1 kg"); parsed, not assumed. | `parsePack` |

## Recipe costing

| Term | Definition | Code / table |
|---|---|---|
| **Escandallo** | A recipe costing sheet: the ordered ingredients of a dish with waste, portions and menu price, costed from real purchase prices. | `recipes` |
| **Elaboración / prep** | A sheet used as an ingredient of another sheet (a sauce, a stock). Declares a yield so its cost can be shared out. | `recipes.kind = 'elaboracion'` |
| **Merma** | Waste percentage between the weight bought and the weight that reaches the plate. Stored per line; the net is stored and the gross derived. | `recipe_items.waste_pct` |
| **Bruto / Neto** | Gross (bought) and net (plated) quantity of a line. `gross = net / (1 − merma)`; the line is charged on the gross. | `recipe_items.net_quantity` |
| **Food cost** | Cost per portion as a percentage of the menu price **excluding VAT** (the taxable base), never of the shelf price. | `recipeTotals` |
| **Ración / portion** | How many servings a sheet yields; the divisor for cost per portion. | `recipes.portions` |
| **Yield** | What a prep produces (2 kg of sofrito), the divisor that turns its total cost into a rate. | `recipes.yield_qty` |

## Insights

| Term | Definition | Code / table |
|---|---|---|
| **Price shock** | An alert when a new price deviates ≥ threshold (default 15%) from the median of up to 3 previous same-supplier prices. | `price_shock` |
| **Low-stock forecast** | An alert when projected stock ÷ daily burn < 3 days. | `low_stock_forecast` |
| **Budget overage** | An alert when category spend hits the warning threshold (default 80%) or exceeds 100%. | `budget_overage` |
| **Notification** | A persisted alert row with a type, an i18n `messageKey`/`messageVars` payload and a `pending`/`sent` status. | `system_notifications` |
| **Digest** | The weekly AI summary email/page per restaurant. | `weekly-digest.ts` |
| **Snapshot** | The fixed Markdown context built once and shared by chat and digest (ADR-018). | `buildChatContext` |

## Billing

| Term | Definition | Code / table |
|---|---|---|
| **Subscription** | A restaurant's billing row; Stripe owns money, Postgres owns entitlement (ADR-013). | `subscriptions` |
| **Plan / Tier** | `trial`, `starter`, `pro`, `business`. | `PlanTier` |
| **Entitlement** | A feature flag or quota derived from the tier. Resolved once per request by `getEntitlements` (ADR-023). | `getEntitlements`, `resolveMonthlyQuota` |
| **Route policy** | The entitlement a route requires, declared per route id and enforced in one hook (ADR-023). | `ROUTE_POLICY`, `entitlementHandle` |
| **Quota** | Monthly invoice extraction allowance per restaurant (trial 20, starter 100, pro 300, business unlimited). | `monthly_usage`, `tenant_llm_quotas` |
| **Trial** | 30-day window from first contact; enforced via `subscriptions.trialEndsAt`. | `TRIAL_DAYS` |

## Data lifecycle

| Term | Definition |
|---|---|
| **Soft delete** | Invoices are soft-deleted via `deletedAt`, keeping audit/history. |
| **Content hash** | SHA-256 over canonicalized invoice content; the duplicate gate on save. |
| **Idempotency key** | Client-supplied UUID consumed once in `idempotency_keys` under the `form-submit` scope; replays return `replay`. |
| **Dead letter** | A job that exhausted pg-boss retries; recorded in `dead_letter_queue`. |

## Cross-cutting

| Term | Definition |
|---|---|
| **VERI\*FACTU** | Spanish certified-invoicing regime; the app parses and cross-checks VERI\*FACTU QR payloads on supplier invoices (`qr.ts`). |
| **E-invoice** | Structured XML invoice (Facturae 3.2.x / UBL 2.1) parsed without AI. |
| **Onboarding** | First-invoice flow gating product surfaces until the first invoice is confirmed; `settings.has_completed_onboarding`. |
| **i18n** | One string table (`src/lib/i18n.ts`), Spanish first, es/en (ADR-021). |
| **Viewport variants** | Mobile and desktop Svelte components for the same screen, both rendered, CSS picks one (ADR-020). |
| **Beta feature flag** | A site-wide on/off switch (default off) that freezes a built-but-not-MVP feature independent of plan tier; toggled from `/admin/feature-flags`. | `BetaFeatureKey`, `app_flags` |
