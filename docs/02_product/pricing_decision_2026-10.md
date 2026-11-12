---
tags: [mep, product, pricing, decision]
related: "[[CONTEXT]]"
---

# Pricing decision — October 2026

- **Date:** 2026-10-18. **Decides:** issue #780 (one price table). **Feeds:** #836 (COGS).
- **Supersedes:** the 2026-09-08 decision comment on #780 ("keep €29/59/129 as
  the permanent table"). The founder has since asked to launch at a higher list
  price behind the founder coupon, since a discount can be withdrawn later and a
  price rise can't. **The founder still needs to confirm this on #780.**
- **Goal it serves:** 10 restaurants paying through live Stripe within 8 weeks
  (by 2026-12-13), at least 3 of them on the top tier.
- **Code:** branch `launch/pricing`. The single source is `src/lib/billing-plans.ts`.

Tags: **[Likely]** = estimated from code or docs, not measured. **[Guessing]** =
an assumption with no source. Every other number cites a file or a URL.

## The table

| Tier (id / name) | Monthly, excl. IVA | Annual, excl. IVA | Documents / month | Restaurants | Founder price (−60 %, forever) |
|---|---|---|---|---|---|
| `starter` / Starter | **€69** | **€690** (€57.50/mo) | 100 | 1 | €27.60 / mo · €276 / yr |
| `pro` / Pro | **€139** | **€1,390** (€115.83/mo) | 400 | 1 | €55.60 / mo · €556 / yr |
| `business` / Business | **€299** | **€2,990** (€249.17/mo) | unlimited | up to 10 | €119.60 / mo · €1,196 / yr |

- Each price covers the whole account, not each restaurant. One subscription
  per user (ADR-024).
- The features per tier are unchanged (`TIERS` in `src/lib/server/billing.ts`).
  Pro adds the intelligence layer (assistant, digest, price analytics, stock).
  Business adds multi-location and priority support.
- Trial unchanged: 14 days, 30 for founders (`TRIAL_DAYS` / `FOUNDER_TRIAL_DAYS`).
- **Founder coupon:** 60 % off, **forever**, **50 redemptions**, redeem by
  **2026-12-13 23:59 Europe/Madrid**. Applies to all three products, monthly
  and annual. The customer-facing code is `FUNDADORES`, limited to first-time
  customers. If `waitlist` has more than 50 rows at cutover, raise the cap to
  that count (see §5.6).

## 1. Who we are pricing for

The ICP is a Spanish restaurant operator with high supplier spend, Barcelona first:

- either an owner of **2–10 locations**,
- or a **single restaurant buying ≥ €20k/month** from suppliers.

How each lands on a tier, by construction:

- **Groups → Business.** Pro and Starter cover one restaurant
  (`TIER_MAX_LOCATIONS`), and a user can hold only one live subscription
  (ADR-024, enforced at checkout and in the webhook). Any second location
  therefore needs Business.
- **High-volume singles → Pro.** 400 documents/month covers a €20–50k/month
  buyer: at an average €150–300 per albarán/factura that is roughly 70–330
  documents [Guessing]. The business plan's own estimate of 200–400
  documents/month for an average restaurant is also unvalidated
  (`plan_de_negocio.md` §2).
- **Starter is not an ICP plan.** It is the entry and decoy tier, for smaller
  kitchens and for anyone who only wants digitisation.

## 2. Value math

### 2.1 € at stake per month = monthly supplier purchases × drift caught

| Monthly purchases | 1 % drift | 2 % drift | 3 % drift |
|---|---|---|---|
| €10,000 | €100 | €200 | €300 |
| €20,000 | €200 | €400 | €600 |
| €50,000 | €500 | €1,000 | €1,500 |
| €100,000 (≈ 5-location group [Guessing]) | €1,000 | €2,000 | €3,000 |

This is a ceiling. It assumes the whole basket drifted and the operator acts on
every alert (claims, renegotiates or switches supplier). What gets recovered in
practice is some fraction of it, and we have no data on how large [Guessing].

### 2.2 What the product catches today — read before quoting 2–3 %

- Price-shock alerts fire when one line item's unit price, normalised for pack
  size, moves at least the account's `price_alert_threshold` against the same
  supplier's previous price for that product. **The default threshold is 15 %**
  (`src/lib/server/alerts.ts:210`). The dashboard and price reports use the
  same default (`DEFAULT_DEVIATION_THRESHOLD = 0.15`,
  `src/lib/server/price-deviations.ts:57`).
- At the default, **a 1–3 % creep is invisible.** What the product catches is
  the € spent on items that jumped by 15 % or more. For example, if 3 % of a
  €20k/month basket jumps by an average +20 %, that is €120/month [Guessing].
  We have no measurement of that share yet. Count `price_shock` notifications
  per tenant during the pilots to get one.
- **The 2–3 % pitch needs the threshold lowered for that account.**
  Owners can set it anywhere from 1 % to 99 % in `/settings` (clamped in
  `(app)/settings/+page.server.ts:158`). For pilots, set it to 2–3 % during
  onboarding.
- The global default stays at 15 %, as instructed. Whether to lower it is the
  founder's decision. The risk is alert noise from imperfect unit-of-measure and
  pack-size normalisation [Likely]. Check alert volume on the first pilots
  before quoting 2 % publicly.

### 2.3 Price as a share of € at stake (monthly list price ÷ table 2.1)

| Tier @ customer spend | 1 % | 2 % | 3 % |
|---|---|---|---|
| Starter €69 @ €10k | 69 % | 35 % | 23 % |
| Pro €139 @ €20k | 70 % | 35 % | 23 % |
| Pro €139 @ €50k | 28 % | 14 % | 9 % |
| Business €299 @ €50k (2–3 locations) | 60 % | 30 % | 20 % |
| Business €299 @ €100k (5 locations) | 30 % | 15 % | 10 % |
| *Founder* Pro €55.60 @ €20k | 28 % | 14 % | 9 % |
| *Founder* Business €119.60 @ €100k | 12 % | 6 % | 4 % |

Reading: at the ICP's 2–3 % case, the list price is a small fraction of what is
at stake (≤ 15 %) for a €50k single restaurant on Pro and for a 5-location group
on Business. For founders it is a small fraction across the board. It is *not*
small at 1 %, for a €20k single restaurant paying list (23–35 %), or for a
2–3-location group at €50k (20–30 %). So qualify list-price prospects at
roughly €30k/month or more, and use the founder price for €20k restaurants.

"Catching one silent 2–3 % rise pays for a year" holds as follows:

- **Pro:** a 3 % rise on one supplier billing €4k/month is €1,440/yr. A 2 %
  rise on a €6k/month supplier is also €1,440/yr. Either covers Pro annual
  (€1,390).
- **Business:** a 2 % rise across €12.5k/month of a group's purchases is
  €3,000/yr, which covers Business annual (€2,990).

## 3. COGS

### 3.1 Model and price list

- **Model:** `gemini-3.1-flash-lite` is the default in `src/lib/server/env.ts:40`.
  Railway's `GEMINI_MODEL` may override it, and that value can't be seen from
  here [Likely].
- **Prices:** $0.25 per million input tokens, $1.50 per million output tokens
  (`COST_PER_MILLION`, `src/lib/server/llm-provider.ts:23`). Two third-party
  trackers match this. One tracker lists $0.125 / $0.75 for the GA model,
  which would halve every figure below (see Sources).
- **FX:** 1 USD = €0.90 [Guessing].

### 3.2 Tokens per extracted document [Likely]

| Part | Tokens | Basis |
|---|---|---|
| System prompt (`EXTRACTION_PROMPT`) | ~5,000 | 17,571 characters of source plus ~1.3k for the expanded category guide, measured from `src/lib/server/extract.ts`. Assumes ~3.8 characters per token for mixed English/Spanish. |
| Response schema (`INVOICE_RESPONSE_SCHEMA`) | ~700 | 4.4k characters of schema source [Guessing on serialisation] |
| Document | ~1,100 | Text PDF dump ~1k [Guessing]. Photo: 1,120 at Gemini 3 default media resolution. Scanned PDF: 560 per page (media-resolution docs). |
| **Input total** | **~6,800** | **$0.0017** |
| Visible JSON output | ~1,400 | ~15 line items × ~280 characters plus header fields [Guessing]. **$0.0021** |
| Thinking tokens | 0 / 1,500 / 5,000 | The code sets no `thinkingConfig`. Gemini 3 models think by default, and thinking is billed as output (see §3.8). |
| Per-document extras | ~$0.0005 | Product `normalize`/`categorize` calls for new products. `document-structure` runs only on multi-page scans [Guessing]. |

### 3.3 Cost per document

| Scenario | USD | EUR |
|---|---|---|
| Low (no thinking) | $0.0043 | **€0.0039** |
| **Mid [Likely]** (1.5k thinking) | $0.0066 | **€0.0059** |
| High (5k thinking) | $0.0118 | **€0.0106** |

All three are under the business plan's "< €0.01/document" claim except the
high case. The #780 COGS comment modelled ~€0.0021/doc, which is below even our
low case. The difference is most likely the size of the system prompt.

Chat and digest are Pro and Business only. Per location they add about
€0.14/month: 30 chat messages plus 4 digests [Guessing].

### 3.4 LLM cost per tier at full quota

| Tier | Documents modelled | Mid | High |
|---|---|---|---|
| Starter | 100 | €0.59 | €1.06 |
| Pro | 400 + chat/digest | €2.50 | €4.38 |
| Business, typical (5 × 250) [Guessing] | 1,250 + 5 × chat/digest | €8.08 | €13.95 |
| Business, "full" (10 × 400) | 4,000 + 10 × chat/digest | €25.00 | €43.80 |

### 3.5 Stripe fees

- **Card fees:** 1.5 % + €0.25 for a standard EEA card, 1.9 % + €0.25 for a
  premium one.
- **Billing fee:** Stripe Billing adds 0.7 % of billing volume.
- **Base:** fees apply to the charged amount, which includes 21 % IVA.

| Charge (excl. IVA) | Charged incl. IVA | Fee (standard card) |
|---|---|---|
| Starter €69 / founder €27.60 | €83.49 / €33.40 | €2.09 / €0.98 |
| Pro €139 / founder €55.60 | €168.19 / €67.28 | €3.95 / €1.73 |
| Business €299 / founder €119.60 | €361.79 / €144.72 | €8.21 / €3.43 |
| Pro annual €1,390 | €1,681.90 | €37.25 per year, vs €47.40 for 12 monthly charges |

- **Tax:** use a manual IVA tax rate (no fee). Stripe Tax would add 0.5 % and
  is only worth it once we sell outside Spain.

### 3.6 Hosting per tenant [Guessing]

- **Platform:** Railway Pro is $20/month and includes $20 of usage. Compute
  runs ~$20 per vCPU-month and ~$10 per GB-month of RAM (Sources).
- **Estimate:** web + worker + Postgres + bucket at around 0.5 vCPU / 1 GB each
  comes to about **$70/month ≈ €63**.
- **Per tenant:** **€6.30 at 10 tenants**, €1.26 at 50.
- Replace this with the actual Railway invoice line items (#836).

### 3.7 Gross margin per tier (mid LLM, full quota, 10 tenants)

| | Revenue | LLM | Stripe | Hosting | **Gross margin** |
|---|---|---|---|---|---|
| Starter list | €69.00 | 0.59 | 2.09 | 6.30 | **87.0 %** |
| Pro list | €139.00 | 2.50 | 3.95 | 6.30 | **90.8 %** |
| Business list, 4,000 docs | €299.00 | 25.00 | 8.21 | 6.30 | **86.8 %** (high LLM: 80.5 %) |
| Starter founder | €27.60 | 0.59 | 0.98 | 6.30 | **71.5 %** |
| Pro founder | €55.60 | 2.50 | 1.73 | 6.30 | **81.1 %** |
| Business founder, 4,000 docs | €119.60 | 25.00 | 3.43 | 6.30 | **71.0 %** (high LLM: 55.2 %; typical 1,250 docs: 85.1 %) |

What this shows:

- **At list:** every tier clears the plan's ≥ 80 % target.
- **At founder price:** Starter and Business-at-full-quota fall below 80 %.
  At 10 tenants hosting is the biggest cost. The only real cost risk is a
  founder group that genuinely runs 10 locations × 400 documents with heavy
  thinking.
- **Guardrail:** `tenant_llm_quotas.monthly_cost_limit_usd` can cap one
  tenant without a deploy.

### 3.8 Thinking tokens are not recorded

- **What's recorded:** `createGeminiProvider` records
  `usageMetadata.candidatesTokenCount` as `outputTokens`
  (`llm-provider.ts:67`). It drops `thoughtsTokenCount`, and Google bills
  thinking at the output rate.
- **Effect:** `llm_usage_log.estimated_cost_usd` and the cost caps undercount
  real spend whenever Flash-Lite thinks. Its default thinking level is reported
  as "high" by one third-party guide [unverified].
- **Follow-up (one line, not in this change):** add `thoughtsTokenCount` to
  `outputTokens`, or set an explicit `thinkingLevel`.
- **Until then:** check the SQL below against the Gemini bill for the same
  month.

### 3.9 Replace the estimate — read-only SQL for the founder

Run it against production with `psql "$DATABASE_URL" -f cogs.sql`. It is
wrapped in a read-only transaction and was smoke-tested against a migrated
local schema.

```sql
BEGIN READ ONLY;

-- (1) Tokens and cost per call, by caller and month (last 90 days)
SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month, model, caller_context,
       count(*) AS calls,
       round(avg(input_tokens)) AS avg_input_tokens, round(avg(output_tokens)) AS avg_output_tokens,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY input_tokens)  AS p90_input_tokens,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY output_tokens) AS p90_output_tokens,
       round(avg(estimated_cost_usd), 6) AS avg_cost_usd, round(sum(estimated_cost_usd), 4) AS total_cost_usd
FROM llm_usage_log
WHERE created_at >= now() - interval '90 days'
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;

-- (2) All-in LLM cost per metered document (the unit the plan sells), per month
WITH cost AS (
  SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
         sum(estimated_cost_usd) FILTER (WHERE caller_context NOT IN ('chat', 'weekly-digest')) AS doc_usd,
         sum(estimated_cost_usd) FILTER (WHERE caller_context IN ('chat', 'weekly-digest'))     AS assistant_usd
  FROM llm_usage_log GROUP BY 1
), docs AS (SELECT month, sum(used) AS documents FROM monthly_usage GROUP BY 1)
SELECT c.month, d.documents, round(c.doc_usd, 4) AS document_llm_usd,
       round(c.doc_usd / NULLIF(d.documents, 0), 6) AS usd_per_document,
       round(c.assistant_usd, 4) AS chat_digest_usd
FROM cost c LEFT JOIN docs d USING (month) ORDER BY c.month;

-- (3) LLM cost per tenant (billing group) and tier, per month
WITH tenant_month AS (
  SELECT COALESCE(r.parent_id, r.id) AS billing_rid,
         to_char(l.created_at AT TIME ZONE 'UTC', 'YYYY-MM') AS month,
         sum(l.estimated_cost_usd) AS usd, count(DISTINCT r.id) AS locations
  FROM llm_usage_log l JOIN restaurants r ON r.id = l.restaurant_id
  GROUP BY 1, 2
)
SELECT tm.month, COALESCE(s.plan_tier, 'none') AS plan_tier, count(*) AS tenants,
       round(avg(tm.locations), 1) AS avg_locations,
       round(avg(tm.usd), 4) AS avg_llm_usd_per_tenant, round(max(tm.usd), 4) AS max_llm_usd_per_tenant
FROM tenant_month tm LEFT JOIN subscriptions s ON s.restaurant_id = tm.billing_rid
GROUP BY 1, 2 ORDER BY 1, 2;

-- (4) Size of the founder-promise cohort (sets the coupon cap, §5.6)
SELECT count(*) AS waitlist_signups, min(created_at) AS first_signup, max(created_at) AS last_signup FROM waitlist;

ROLLBACK;
```

How to use the results:

- **Queries (1) and (2):** these replace §3.2–3.4. Put `usd_per_document`
  from (2) into §3.4 and re-run the margin table.
- **Text vs. vision mix:** read it off (1). Input on the `extraction-worker`
  rows is roughly the ~5.7k fixed prompt plus the document, so a wide spread
  between average and p90 means many photos or scans.
- **Thinking-token check:** compare `total_cost_usd` for a full month with
  that month's Gemini API bill. A bill more than ~20 % higher is the
  thinking-token gap from §3.8.

## 4. Competitors (public pricing, Spain/EU first)

| Product | Public price | What you get / note | Source |
|---|---|---|---|
| **Haddock** (Barcelona, direct competitor) | Basic **€135**/mo · Standard **€160**/mo · Unlimited **€250**/mo, excl. VAT | 100 / 400 / unlimited documents. Annual discount offered but not published. | support.haddock.app (updated 2026-04-23) |
| Gstock (ES) | ZERO €43.90 · ONE €65.90 · PREMIUM €98.90 /mo | Inventory-first, POS sync | capterra.es |
| Yurest (Valencia) | Lite €79 · Plan €99 per *feature* /mo | Full ops suite, priced per module | capterra.com |
| MarketMan | Starter $249 · Growth $299 · Enterprise from $449 /mo (raised Aug 2026) | Inventory + invoice scanning | pricingsaas.com |
| MarginEdge | $330–350 per location /mo | Invoice processing + food cost (US) | marginedge.com/pricing, pricingsaas.com |
| xtraCHEF (Toast) | from $149 per feature /mo; quote-based, per location and invoice count | Toast add-on | capterra.com; `competitor_xtrachef.md` |
| Apicbase | ~$160/mo single outlet; quote-based | Multi-outlet, modules | softwaresuggest.com, apis.io |
| BlueCart | $99–299/mo (third-party, inconsistent; $500 setup per one source) | Ordering marketplace | softabase.com, fitgap.com |
| Restoo | from US$100 (unclear scope) | Ops / escandallos | capterra.ca |
| Prezo, Supy | no public price found | — | prezo.es, g2.com |
| Generic Spanish accounting tools (Holded, Quipu, …) | €7–50/mo | Header-level extraction only | `plan_de_negocio.md` §6 |

Positioning:

- **Like for like on documents,** we sit below Haddock on every tier:
  Starter −49 % vs Basic (100 documents), Pro −13 % vs Standard (400
  documents), Business +20 % vs Unlimited but covering up to 10 restaurants.
- **Against the US tools,** we are well below MarketMan and MarginEdge.
- **Against the inventory-first Spanish tools,** we sit above Gstock and at
  Yurest's level. Those are different products.
- **€29/59/129 would anchor us below Gstock,** a signal of "cheap tool" to a
  buyer spending €20k+ a month.

All web figures come from search-engine snippets of the pages listed under
Sources. This sandbox's egress policy blocked direct page fetches, so treat
them as **[Likely]** and re-check Haddock's page before publishing.

## 5. Recommendation

### 5.1 Tier names: keep Starter / Pro / Business

- They are brand names, identical in Spanish and English by design
  (`tests/billing.test.ts`, "keeps Starter/Pro/Business identical in both
  locales"). The stored `plan_name` token depends on them too.
- The business plan's "Básico / Grupos" would need a locale split.
- The tagline already does the self-selection for groups ("Las mismas
  funciones, para un grupo de restaurantes"), as does the bullet "Hasta 10
  restaurantes".

### 5.2 Why these list prices

1. **List high, discount through the coupon (founder's rule).** The list is
   2.3–2.4× the old €29/59/129 and above the plan's €49/99/199, while staying
   under Haddock like for like. Lowering a list price later is easy; raising one is
   not.
2. **A ~2× step between tiers (69 → 139 → 299)** keeps Pro the obvious middle
   choice. Pro stays the "Recomendado" tier.
3. **The value math (§2.3) supports it** for the ICP at 2–3 % drift: 9–14 %
   of € at stake for a €50k single restaurant on Pro, 10–15 % for a €100k group
   on Business. A small 2–3-location group at €50k is at 20–30 % on list, which
   is why founder pricing matters for the first groups.
4. **Margin is not the constraint** (§3.7), the same conclusion #780 reached.
5. **Pro quota 300 → 400** matches Haddock Standard and the business plan's 400,
   which closes the divergence #780 flagged. At ~€0.006 per document, the extra
   100 documents cost about €0.60/month.

### 5.3 Annual: 2 months free (pay 10 × monthly)

- **It is the plan's discount, easier to explain.** The business plan already
  budgeted −15 % for annual; 2 months free is −16.7 %, the standard SaaS
  framing.
- **Cash upfront** funds the 8-week push.
- **Fees:** one card charge a year instead of 12 saves about €10/yr per Pro
  account (§3.5).
- **Churn:** it removes cancel-and-return around seasonal closures
  [Guessing about the churn pattern].
- **Not deeper than that.** A forever founder coupon stacks on the annual
  price: a founder on annual Pro pays €556/yr.

### 5.4 Sizing the top tier: a higher cap (10), not a per-location add-on

Chosen: Business covers **up to 10 restaurants at one flat price**
(`TIER_MAX_LOCATIONS.business = 10`, previously 5). Why:

- **A 2–10-location group fits without negotiating,** and the 6–10-location
  groups the old cap of 5 excluded now fit too.
- **An add-on is too much change for 8 weeks.** It would need a second
  quantity-priced Stripe price, quantity handling in the Customer Portal, and
  a `maxLocations` derived from the subscription quantity rather than the tier
  (a new entitlement path). That is too much change to ship and test with live
  money inside the 8 weeks.
- **Trade-off:** a 10-location group (~€200k/month [Guessing]) pays €299, about
  €30 per location and ~7 % of €4,000 at stake at 2 %. That leaves money on the
  table at the top end.
- **Mitigation:** 11+ locations are quoted by hand. After 3 groups are live,
  revisit an add-on priced from the value math. Each extra location at
  €20k/month × 2 % = €400 at stake, so ~10 % gives **~€40 per location per
  month above 5** [Guessing].
- **Pilots need the `multiLocation` beta flag on** (`/admin/feature-flags`;
  off by default, `docs/03_features/feature_flags.md`). The flag is
  **global, not per tenant**: turning it on lets every Business tenant create
  locations. The default is not changed in this branch.

### 5.5 Prices stay single-sourced

- **One source:** `PROVISIONAL_PRICE`, `ANNUAL_PRICE`, `TIER_QUOTA`,
  `TIER_MAX_LOCATIONS` and `FOUNDER_OFFER` in `src/lib/billing-plans.ts`.
  `TIERS`, `/billing`, `/waitlist` and `/admin/revenue` all read them.
- **Override removed:** the `PLAN_PRICE_<TIER>_EUR` env override is gone.
  Railway sets those variables (`docs/05_operations/go_live_checklist.md`)
  to values this repo can't see, so admin MRR could disagree with the
  published page. Delete them on Railway.

### 5.6 Founder coupon — terms and why

| Term | Value | Why |
|---|---|---|
| Discount | **60 % off** | The smallest round percentage that keeps every founder at or below the price the waitlist showed (€29 / €59 / €129). The minimums are Starter 58.0 %, Pro 57.6 %, Business 56.9 %. 50 % would charge founders €34.50 / €69.50 / €149.50. |
| Duration | **forever** | The waitlist promised it, see the quotes below. |
| Redemption cap | **50**, or the `waitlist` row count at cutover if higher (query 4) | 50 matches the waitlist's "Edición de fundadores — 50 cocinas" (`waitlist.metaDescription`, `SPOT_TOTAL = 50`). The price promise was made to everyone who joined, so the cap must not be lower than the cohort. |
| Deadline (`redeem_by`) | **2026-12-13 23:59 Europe/Madrid** | The end of the 8-week window. Email the code to the waitlist at least 3 weeks before. |
| Scope | All three products, monthly and annual | The coupon follows a founder who switches tiers in the portal. |
| Code | `FUNDADORES`, first-time customers only, same expiry | For self-serve redemption. Founders approved in `/admin/access` get the coupon applied automatically. |

What the waitlist promised, next to the €29/59/129 cards:

> "Quien se une ahora se lo queda congelado para siempre, decida el precio
> público lo que decida." — `waitlist.foundingSub`
>
> "Tu precio de fundador queda congelado de por vida, aunque el precio público
> suba después." — `waitlist.founding.2.body`

So the cohort's discount is not withdrawable, and the founder's "a discount can
be withdrawn later" applies only to *new* redemptions. Those stop at the
deadline or the cap. In Stripe, deleting a coupon does not remove it from
subscriptions that already carry it.

- **Timing risk:** founders get a 30-day trial, so a founder who checks out
  after **2026-11-13** is not charged before 2026-12-13. For "10 *paying* by
  week 8", most founder checkouts must happen by mid-November, or the founder
  shortens `FOUNDER_TRIAL_DAYS` (founder decision, not changed here).
- **What the goal's minimum looks like:** 3 Business + 7 Pro on founder
  pricing is €748.00 MRR (3 × €119.60 + 7 × €55.60). That is arithmetic on the
  goal's own shape, not a forecast. `/admin/revenue` will show these
  subscriptions at list price (€1,870), because MRR is not net of discounts
  (`revenue_metrics.md`).

## 6. One-way doors

1. **The public price list** (`/waitlist`, landing variants, `/billing`). Once
   paying customers have seen €69/139/299, raising it is a breaking change.
   Lowering it is not.
2. **Live Stripe Prices.** Amounts can't be edited; changing a price means
   creating a new Price, and existing subscriptions stay on the old one until
   migrated. Archive old Prices, never delete them.
3. **Forever coupon redemptions,** together with the waitlist promise above.
4. **The Business location cap (10).** Lowering it later takes locations away
   from paying groups.
5. **Annual prepayments.** They can't be repriced mid-term. Decide the
   refund/credit policy before the first annual sale.
6. **Not one-way:** document quotas (raise any time), the alert-threshold
   default, trial length, annual availability (env), founder deadline extension.
7. **No migration.** The billing interval is derived from the already-stored
   `subscriptions.stripe_price_id`.

## 7. Stripe TEST mode — do this first

Dashboard labels move between Stripe releases. If a label differs, search for
it in the Dashboard search bar.

1. Toggle **Test mode** (or open a **Sandbox**) in the top bar.
2. **IVA tax rate:**
   - Search "Tax rates" → **Create tax rate**.
   - Fill in: Type *VAT*, Display name `IVA`, Rate `21`, Region *Spain*,
     **Inclusive: off (exclusive)**, Description `IVA 21 %`.
   - Save, then copy the `txr_…` id.
3. **Products** (Product catalog → **+ Add product**), three times:
   - **Mise en Place Starter:** Recurring, **€69.00 EUR, Monthly**,
     *Include tax in price*: **No**. Save, then **Add another price**:
     Recurring **€690.00 EUR, Yearly**, tax **exclusive**.
   - **Mise en Place Pro:** €139.00 / Monthly and €1,390.00 / Yearly.
   - **Mise en Place Business:** €299.00 / Monthly and €2,990.00 / Yearly.
   - All six prices must have the same tax behaviour (exclusive), or the
     portal cannot switch between them.
   - Optional lookup keys: `starter_monthly`, `starter_yearly`, and so on.
   - Copy all six `price_…` ids.
4. **Coupon** (Product catalog → **Coupons** → **+ New**):
   - Name `Fundador 60 % de por vida`, ID `FUNDADOR60`.
   - *Percentage discount* `60`.
   - *Apply to specific products*: Starter, Pro, Business.
   - *Duration* **Forever**.
   - *Redemption limits*: **Limit the date range** → redeem by 13 Dec 2026
     23:59 (Madrid), and **Limit the total number of times** → `50` (or the
     cohort count). Create.
5. **Promotion code** (on the coupon page → **+ Add promotion code**):
   - Code `FUNDADORES`.
   - Tick **Eligible for first-time order only**.
   - **Limit the number of times** `50`, **Add an expiration date** 13 Dec
     2026 23:59. Save.
6. **Customer portal** (Settings → Billing → **Customer portal**):
   - **Subscriptions → Customers can switch plans: On.** Add Starter, Pro and
     Business, and select **both** prices (monthly and yearly) on each. This
     is what lets customers switch interval.
   - Proration: *Prorate charges and credits*. If offered, schedule
     downgrades and interval shortening for the **end of the billing period**.
     That matches the "graceful downgrade" open question in `billing.md`.
   - **Customers can cancel: On**, *at end of billing period*.
   - **Customer information:** allow billing address and **Tax ID** (the NIF
     printed on their facturas).
   - **Business information:** terms and privacy URLs; default return URL
     `https://<domain>/billing`. Save.
7. **Webhook** (Developers → **Webhooks** → **Add endpoint**):
   - URL `https://<staging-domain>/api/stripe-webhook`.
   - **API version `2026-08-26.dahlia`.** It must match `STRIPE_API_VERSION`
     in `billing.ts`.
   - Events: `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `customer.subscription.paused`,
     `customer.subscription.resumed`, `customer.subscription.trial_will_end`.
   - Copy the `whsec_…` secret. Locally, `pnpm dev:all` runs
     `stripe listen --forward-to localhost:5173/api/stripe-webhook`, which
     prints its own `whsec_…`.
8. **Set the test env** (local `.env` or a staging Railway environment) with
   the `sk_test_…` key and the ids above. Variable names are in §9.
9. **Test, with card `4242 4242 4242 4242`:**
   - Pro monthly checkout.
   - Business annual checkout.
   - A founder checkout: approve the user in `/admin/access` → 60 % applied,
     30-day trial.
   - A non-founder entering `FUNDADORES`.
   - In the portal: Pro monthly → Pro yearly, then Pro → Business.
   - After each step, `/billing` should show the right tier and `/año` for
     annual, and `/admin/revenue` should show annual MRR at price/12 with no
     `unknownPrice` leak.
   - The Stripe invoice should show IVA 21 % on top.
   - Use **Billing → Test clocks** to run a trial to its first charge.

## 8. Stripe LIVE mode

1. Leave test mode. Confirm Settings → Business: country **Spain**, currency
   **EUR**, and your NIF in the invoice footer (Settings → Billing → Invoices).
2. Repeat §7 steps 2–7 in live mode. Prices, coupon, code, portal and webhook
   are per mode, so the ids will all differ. The webhook URL is
   `https://<production-domain>/api/stripe-webhook`.
3. **Archive** any old live Prices (€29/59/129 or €49/99/199) after checking
   that no subscription uses them. #780 triage records zero live transactions
   to date.
4. **Order of operations:** stage the Railway variables (§9) and merge this
   branch into **one** deploy. Deploying the code first would show €139 while
   the old price ids still charge the old amounts.

## 9. Railway variables (web service)

| Variable | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_live_…` / `rk_live_…`. The worker service needs it too. |
| `STRIPE_WEBHOOK_SECRET` | live endpoint `whsec_…` |
| `STRIPE_PRICE_ID_STARTER` / `_PRO` / `_BUSINESS` | monthly `price_…` ids |
| `STRIPE_PRICE_ID_STARTER_ANNUAL` / `_PRO_ANNUAL` / `_BUSINESS_ANNUAL` | yearly `price_…` ids. Set all three, or the annual toggle stays hidden. |
| `STRIPE_TAX_RATE_ID` | live IVA `txr_…` |
| `STRIPE_FOUNDER_COUPON_ID` | `FUNDADOR60` (the coupon id; a `promo_…` id also works) |
| `STRIPE_FOUNDER_PROMO_CODE` | `FUNDADORES` |
| **Delete** `PLAN_PRICE_STARTER_EUR`, `PLAN_PRICE_PRO_EUR`, `PLAN_PRICE_BUSINESS_EUR` | no longer read |
| Optional: delete `STRIPE_PRICE_ID` | legacy Starter fallback; unused once `STRIPE_PRICE_ID_STARTER` is set |

Then in the app, before the first Business pilot: `/admin/feature-flags` →
**multiLocation on** (global).

## 10. What changed in code (`launch/pricing`)

- **`src/lib/billing-plans.ts`:**
  - the new `PROVISIONAL_PRICE`;
  - new exports `ANNUAL_PRICE`, `ANNUAL_MONTHLY_EQUIVALENT`,
    `ANNUAL_MONTHS_BILLED`, `ANNUAL_FREE_MONTHS`, `TIER_QUOTA`,
    `TIER_MAX_LOCATIONS`, `FOUNDER_OFFER`, `FOUNDER_PRICE`, `tierPrice`,
    `BillingInterval`;
  - the Business bullet now reads its location count from
    `TIER_MAX_LOCATIONS`.
- **`src/lib/server/billing.ts`:**
  - `TIERS` reads quotas and caps from billing-plans and gains
    `stripeAnnualPriceId`;
  - new helpers `priceIdFor`, `intervalFromPriceId`,
    `isAnnualBillingAvailable`, `subscriptionMonthlyPriceCents`,
    `configuredPriceIdSet`;
  - `tierFromPriceId` maps both ids of a tier;
  - checkout takes `interval` and adds the optional IVA `default_tax_rates`;
  - `switchTier` keeps the subscription's interval;
  - the `PLAN_PRICE_*` override is removed.
- **Bug fix 1, founder coupon:** the founder coupon was sent as
  `promotion_code` (Stripe rejects a coupon id there), which would have broken
  every founder checkout. It now goes through `founderDiscount`.
- **Bug fix 2, stale customers:** checkout's stale-customer detection now only
  matches a missing *customer* (`isMissingCustomerError`), so a bad coupon or
  price no longer mints a new Stripe customer on every retry.
- **`src/lib/server/env.ts`:** reads the annual price ids and
  `STRIPE_TAX_RATE_ID`.
- **`src/lib/server/revenue-metrics.ts`:** annual subscribers count at /12 in
  MRR, and annual ids are no longer reported as `unknownPrice`.
- **`/billing`:** a monthly/annual toggle (only when all annual ids are set),
  plan cards priced per interval, a hidden `interval` field, and the status
  card showing the current interval. The "precio provisional" badge is gone
  from `/billing`.
- **i18n:** new `billing.interval.*`, `billing.perYear*`,
  `billing.annualEquivalent` and `billing.vatExcluded` keys.
  `billing.perMonth` loses "por restaurante", and `billing.plansSub` now says
  one plan per account.
- **Docs and tests:** updated alongside (see the commit).

### 10.1 Needed in `LandingPage.svelte` / `src/routes/waitlist/*` (owned separately, not touched here)

What updates by itself once this merges:

- The prices: `PROVISIONAL_PRICE` → €69/139/299, on both the cards and FAQ 3.
- The Business bullet: "Hasta 10 restaurantes".

What still needs changing:

1. **Quotas:** `PAID_TIERS` still hardcodes `quota: 100 / 300 / null`. Read
   `TIER_QUOTA[id]` instead (Pro is now 400). Then update the local
   `TIER_QUOTA` and Pro's `POST_ADR036_QUOTA_BULLET` in
   `tests/waitlist-provisional-price.test.ts` to 400.
2. **Founding copy:** `waitlist.foundingHead`, `waitlist.foundingSub` and
   `waitlist.founding.2.body` promise "the price above frozen forever, whatever
   the public price". Restate them as the explicit offer, interpolated from
   `FOUNDER_OFFER` / `FOUNDER_PRICE` (60 % for life, 50 places, until
   13/12/2026). Keep the promise honoured, and don't hardcode the numbers
   (`tests/403-waitlist-founding-section.test.ts` bans both the old and the
   new price literals).
3. **Badge:** drop the `billing.provisional` badge from the price cards. The
   prices are decided.
4. **Pricing subtitle:** `waitlist.pricingSub` says "Precios por restaurante,
   provisionales…". Change it to per account, IVA not included, Business up to
   `TIER_MAX_LOCATIONS.business` restaurants.
5. **FAQ:** `waitlist.faq.3.a` could add the annual price (`ANNUAL_PRICE`,
   `ANNUAL_FREE_MONTHS`) and the founder offer.
6. **Optional:** a monthly/annual display using `ANNUAL_MONTHLY_EQUIVALENT`.

Deploy the landing copy in the same release as this branch, so the public page
never shows the new prices next to the old "provisional" wording.

## 11. Open items for the founder

- **#780:** confirm this table there; it supersedes the 2026-09-08 decision.
  `plan_de_negocio.md` §7 shows the new table, but its ARPA, LTV and
  projection numbers (§7, §9, §11) still need restating.
- **Alert threshold:** lower the default (15 %), or onboard each pilot at 2–3 %
  (§2.2).
- **Founder trial:** 30 days versus the "paying by week 8" goal (§5.6).
- **Thinking tokens:** add them to metering (§3.8).
- **Facturas:** Checkout does not collect the customer's NIF. Enable Tax ID in
  the portal, or add it per customer for the first 10. Ask the gestoría
  whether Stripe-generated invoices are acceptable as facturas under
  VERI\*FACTU from 2027.
- **MRR:** `/admin/revenue` shows founder subscriptions at list price, because
  discounts are not modelled.

## 12. Claims register

- **[Likely]:**
  - tokens per document and cost per document (§3.2–3.3);
  - the active Gemini model and its price;
  - the competitor and Stripe figures obtained via search snippets;
  - alert noise at a 2 % threshold.
- **[Guessing]:**
  - document counts for a €20–50k restaurant;
  - a 5-location group ≈ €100k/month and a 10-location group ≈ €200k/month;
  - visible JSON output size and the per-document extras;
  - chat and digest volume;
  - FX 0.90;
  - Railway ≈ $70/month;
  - Business typical usage of 5 × 250 documents;
  - the share of spend with ≥ 15 % jumps;
  - the recovered share of € at stake;
  - seasonal churn;
  - an add-on price of ~€40 per location.

## Sources

Fetched on 2026-10-18 through web search. Direct fetches were blocked by this
sandbox's egress policy, so these are search snippets of the listed pages.

- **Haddock:** https://support.haddock.app/en/article/plans-and-pricing-m0guzl/
- **Gstock:** https://www.capterra.es/software/1019904/gstock
- **Yurest:** https://www.capterra.com/p/10047559/Yurest/
- **MarketMan:**
  - https://pricingsaas.com/companies/marketman/diffs/2026W34
  - https://www.g2.com/compare/marketman-vs-xtrachef
- **MarginEdge:**
  - https://marginedge.com/pricing
  - https://pricingsaas.com/companies/marginedge
- **xtraCHEF:** https://capterra.com/p/165935/xtraCHEF/ (and `competitor_xtrachef.md`)
- **Apicbase:**
  - https://www.softwaresuggest.com/apicbase-food-management/pricing
  - https://apis.io/plans/apicbase/apicbase-plans-pricing/
- **BlueCart:**
  - https://softabase.com/en/software/restaurant-management/bluecart
  - https://us.fitgap.com/products/bluecart
- **Restoo:** https://www.capterra.ca/software/1102366/restoo
- **Prezo:** https://prezo.es/en/soluciones/cocina/
- **Supy:** https://www.g2.com/products/supy/pricing
- **Stripe:**
  - EEA card fees: https://support.stripe.com/questions/pricing-updates-for-businesses-based-in-the-european-economic-area-(eea)
  - Billing 0.7 %: https://stripe.com/en-us/billing/pricing
  - Tax 0.5 %: https://support.stripe.com/questions/understanding-stripe-tax-pricing
  - Customer portal (same tax behaviour, monthly/yearly as separate prices, ≤ 10 products): https://docs.stripe.com/billing/subscriptions/integrating-customer-portal
- **Gemini:**
  - 3.1 Flash-Lite price: https://pricepertoken.com/pricing-page/model/google-gemini-3.1-flash-lite-preview and https://www.morphllm.com/gemini-api-pricing
  - Conflicting lower GA figure: https://pricepertoken.com/pricing-page/model/google-gemini-3.1-flash-lite
  - Media resolution (Gemini 3 defaults: 1,120 tokens per image, 560 per PDF page): https://ai.google.dev/gemini-api/docs/media-resolution
  - Thinking billed as output: https://discuss.ai.google.dev/t/are-the-thinking-tokens-counted-in-the-output-price-for-2-5-flash/88792
  - Flash-Lite default thinking level (unverified): https://www.verdent.ai/guides/gemini-3-1-flash-lite-thinking-levels
- **Railway:**
  - https://docs.railway.com/reference/pricing/plans
  - https://livemy.app/blog/railway-pricing
