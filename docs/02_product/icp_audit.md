# ICP Audit & Growth Hypotheses — July 2026

**Scope requested:** a data-driven Ideal Customer Profile audit across the billing layer
(Stripe), the product-engagement layer (Postgres), and the customer-context layer, followed
by growth experiments targeting the verified ICP.

**Headline finding:** the audit was run against the production Supabase project
(`dylthalciyhlqwbbntfx`, "Mise en place") on 2026-07-13, and **there is no customer data to
audit**. The product is pre-launch. Every conclusion in this document is therefore split
into (a) what the data actually shows, (b) a *provisional* ICP derived from economics
already encoded in the product, clearly labeled as hypothesis, and (c) the instrumentation
required so a real ICP audit is possible 60–90 days after launch. No cohort numbers are
invented anywhere in this document.

---

## Part 0 — What the data actually shows

### Billing / payment layer (Stripe ↔ `subscriptions`)

| Signal | Value |
|---|---|
| `subscriptions` rows | **0** |
| Stripe customers ever created | **0** (no `stripe_customer_id` anywhere) |
| Upgrades / downgrades / refunds / failed payments | **0** — no lifecycle events ever received |

LTV, churn, and payment-failure segmentation are mathematically undefined on this dataset.

### Product engagement layer (Postgres)

Every tenant-scoped table is empty: `restaurants` 0, `invoices` 0, `invoice_line_items` 0,
`suppliers` 0, `chat_messages` 0, `category_budgets` 0, `stock_levels` 0,
`system_notifications` (the event log) 0, `llm_usage_log` 0.

### Customer context layer

- `auth.users` contains **2 accounts**: `admin@gmail.com` (operator) and
  `demo@mise-en-place.app` (the seeded demo from `scripts/seed-demo.mjs`). Last sign-in
  activity: 2026-06-11. Neither is a customer.
- `waitlist` has **0 signups**, and the form (`src/lib/server/waitlist-db.ts`) captures
  **email only** — even if signups existed, they could not be segmented by venue type,
  size, or invoice volume.

### Side-findings from the audit (worth fixing regardless)

1. **Production schema is stale.** Prod has tables up to roughly migration `0007`; the repo
   is at `0016`. Missing in prod: `user_consents` (GDPR trail), `monthly_usage` (quota
   enforcement), `processed_requests` (idempotency), `whatsapp_processed_messages`,
   `stripe_webhook_events` (webhook dedup), plus the invoice `version`/content-hash
   constraints. Launching on this schema would break billing dedup and quota enforcement.
2. **The production project was paused** (Supabase `INACTIVE`) — it was restored to run
   this audit. A paused database also means the deployed app, if anyone visited it, was
   down.
3. **Events are tenant-scoped, not user-scoped.** `trackEvent()` writes
   `restaurant_id` but no `user_id`, and there are no signup/onboarding/login events at
   all — activation analysis by user will be impossible without additions (see Part C).

---

## Part A — The ICP: what can honestly be said today

### A.1 Provisional ICP (hypothesis, not data)

There is no "hidden high-performing segment" to uncover yet. But the product's own pricing
math, quota design, and feature set already encode a bet about who the best customer is.
Making that bet explicit gives launch a falsifiable target:

**"The 60–250-invoice independent."** An independent Spanish restaurant or small group
(1–3 locations) that:

- receives roughly **60–250 supplier invoices/month** — busy enough that manual entry hurts
  (the Starter quota of 100 was sized to "most small Spanish restaurants, ~50–80
  invoices/mo" per `billing.ts`; the trial quota of 20 is deliberately "not enough to rely
  on for free"), so the pain is recurring and weekly, not occasional;
- buys from **8–15 recurring suppliers** across produce/meat/fish/dry goods, making
  price-shock alerts and supplier scoring meaningful (they need repeat price series);
- has an **owner-operator or F&B manager who already does the invoices themselves** on a
  phone — the entire capture path (camera upload, offline queue, WhatsApp bot) is built
  for someone standing in a kitchen, not a back-office clerk;
- is exposed to **RD 238/2026 e-invoicing obligations** (the app ships Facturae/UBL
  parsing, AEAT/TicketBAI QR verification, and accept/reject statuses) — a regulatory
  clock that turns "nice analytics" into "compliance necessity";
- operates in **food-cost crisis mode**: 30%+ food cost, no controller, no ERP — too big
  for a spreadsheet, too small for a Compass-style procurement system.

Economic logic for why this segment should be highest-LTV/lowest-churn *if* the bet is
right: invoice volume is the natural retention flywheel (every week of use deepens the
price-history moat, and exporting 12 months of price series is painful), while venues
below ~40 invoices/month never hit the habit loop and venues above ~400 (chains) demand
multi-entity features, SSO, and procurement workflows the product doesn't have.

### A.2 Key discrepancies vs. the generic definition

- Generic: "small businesses / restaurants." Provisional ICP: **invoice-volume band, not
  headcount** — a 20-seat tapas bar with 10 daily deliveries is in; a 100-seat venue
  buying from one cash-and-carry weekly is out. Volume is observable pre-sale (ask one
  question); "small" is not.
- Generic: sell analytics. Provisional: **sell the 2-minute invoice capture first** —
  analytics is the retention layer, not the acquisition hook; nobody searches for "spend
  dashboards" at 23:00 after service, they search for how to stop typing invoices.
- Generic: the decision-maker is "the owner." Provisional: the decision-maker is
  **whoever physically handles the paper** — sometimes a chef or manager; WhatsApp-first
  capture is the wedge for exactly that person.
- The "surprise in the data" is the meta-finding: **the company is preparing growth
  analysis before it has a single waitlist email.** The binding constraint is not segment
  knowledge; it is (1) shipping the stale prod deployment and (2) instrumenting signup so
  the first 100 users arrive pre-segmented.

### A.3 Core retaining features (predicted, to be validated)

Ranked bets for what will separate day-30 retainers from churners, chosen because each one
compounds with data the user accumulates:

1. **Weekly capture habit:** ≥ N invoices confirmed per week for 3 consecutive weeks
   (`invoice_saved` events). This is the proposed activation metric — pick N after the
   first cohort; the schema already logs every save.
2. **Price-shock alert received *and opened*** — the first "it caught something I didn't
   see" moment; requires ≥2 purchases of the same ingredient, which ties directly back to
   capture volume.
3. **A second capture channel or second user added** (WhatsApp contact linked, or a
   `member` row in `user_restaurants`) — process embedding, the classic churn-resistance
   signal in SMB SaaS.

Track all three from day one; discard whichever fails to separate retained from churned
cohorts at day 60.

---

## Part B — Growth experiments

Reframed for the actual stage: each experiment must *acquire* users **and** *generate the
segmentation data this audit lacked*. All conversion-lift numbers are targets to test, not
predictions.

### Experiment 1 — Segmented waitlist ("volume-banded onboarding")

- **Hypothesis:** if the waitlist asks two extra questions — *¿Cuántas facturas de
  proveedor recibes al mes?* (bands: <40 / 40–100 / 100–300 / 300+) and *¿Cuántos locales?*
  — then completion will stay above 80% of email-only baseline, and the 40–300 band will
  show materially higher trial-to-paid conversion at launch, validating (or killing) the
  provisional ICP within one cohort.
- **Landing page angle:** "Deja de teclear albaranes. Foto → datos → precios vigilados."
  Sub-head: "Para restaurantes que reciben 10+ facturas a la semana y no tienen tiempo de
  picarlas." Secondary block on RD 238/2026: "La factura electrónica llega. Tus albaranes
  ya estarán dentro."
- **Paid angle:** Meta (IG Reels) creative: 15-second phone video, flour-dusted hands
  photographing a crumpled fish invoice, extraction appears, price-shock alert pops —
  "El bacalao subió 14% y te enteraste tarde." Target: ES, restaurant-owner/hostelería
  interest stacks, geo-tiered (Madrid/Barcelona first). Google Search: "programa facturas
  proveedores restaurante", "escanear albaranes", "factura electrónica restaurante RD
  238/2026" — regulation queries are cheap now and will spike.
- **Metrics:** leading — waitlist completion rate with extra fields, cost per waitlist
  signup by band; lagging — signup→activated (capture-habit metric above) and
  trial→paid **by declared volume band**. Kill/scale decision: does the 40–300 band
  out-convert the rest by ≥2×?

### Experiment 2 — WhatsApp-first capture as the acquisition wedge

- **Hypothesis:** offering "manda tu albarán por WhatsApp y te lo devolvemos en datos"
  as the primary CTA (before any dashboard screenshot) will beat a feature-tour landing
  page on trial starts, because the target persona adopts via the tool they already live
  in and the time-to-first-value drops to under a minute.
- **Landing page angle:** hero is a WhatsApp thread mock: photo of invoice → structured
  reply with total, supplier, and "3 precios subieron." Copy: "Sin app nueva. Sin
  escáner. El WhatsApp que ya usas con tus proveedores." CTA: "Prueba con una factura
  real."
- **Paid angle:** Meta click-to-WhatsApp ads (lowest-friction objective for this
  audience); creative = screen-recording of the actual bot exchange. Retarget engagers
  with the price-shock story. Google: Performance Max excluded; exact-match only on
  invoice-digitization terms to keep intent clean.
- **Metrics:** leading — CTR to WhatsApp, % who send a first document, first-document →
  account-created rate; lagging — day-30 retention of WhatsApp-first vs web-first users,
  CAC per *activated* (not per signup). Requires adding `signup_source` — see Part C.

### Experiment 3 — RD 238/2026 compliance clock (regulatory urgency)

- **Hypothesis:** a dedicated landing page framed as "¿Está tu restaurante listo para la
  factura electrónica?" with a 60-second self-check quiz will convert colder traffic than
  product-led pages, because compliance deadlines create time-bound intent that food-cost
  savings do not — and the quiz answers (invoice volume, software used, locations) *are*
  the customer-context dataset this audit was missing.
- **Landing page angle:** countdown framing, plain-language explanation of
  accept/reject/paid obligations, then the pivot: "Cumplir la norma es lo mínimo. Los
  mismos datos te dicen qué proveedor te está subiendo los precios." Lead magnet: 1-page
  PDF checklist in exchange for the quiz.
- **Paid angle:** Google Search on regulation terms (own them before accounting-software
  incumbents bid them up); Meta lookalikes seeded from quiz completers once ≥1k. Also the
  only angle suitable for gestorías/asesorías as a referral channel — worth a separate
  small test.
- **Metrics:** leading — quiz completion rate, cost per completed quiz, share of
  completers inside the 40–300 volume band; lagging — quiz→trial rate, trial→paid vs
  Experiments 1–2, 90-day churn of regulation-motivated vs pain-motivated cohorts (the
  key strategic question: does compliance-driven acquisition churn worse?).

---

## Part C — Instrumentation required before any real ICP audit

Do these before or at launch; each maps to an existing mechanism:

1. **Deploy the missing migrations to prod** (`0008`–`0016`) and unpause/keep the project
   active. Without `monthly_usage` and `stripe_webhook_events`, billing data will be
   corrupt from day one and the *next* audit will be garbage-in.
2. **Add `user_id` to `trackEvent` / `system_notifications`** and emit lifecycle events:
   `user_signed_up` (with `signup_source`, `utm_*`, waitlist volume band), `onboarding_completed`,
   `first_invoice_saved`, `trial_started`. Today activation cannot be measured per user.
3. **Extend the waitlist table** with `invoice_volume_band`, `locations`, `role`, `source`
   (Experiment 1 depends on it; it is a 10-line migration).
4. **Define the activation metric in code** (e.g., a nightly rollup flagging restaurants
   with ≥N confirmed invoices/week for 3 straight weeks) so day-30/day-60 cohort queries
   are one `GROUP BY`, not archaeology.
5. **Keep LTV inputs clean:** `llm_usage_log` already gives per-tenant COGS — pair it with
   Stripe MRR at audit time to segment by *margin*, not just revenue. That is the audit
   this document should have been, and can be, one quarter after launch.

---

*Audit performed 2026-07-13 against Supabase project `dylthalciyhlqwbbntfx` (restored from
pause for the audit, then re-paused). Sources: `auth.users`, all `public` tables, repo
schema `src/lib/server/schema.ts`, billing config `src/lib/server/billing.ts`, event
inventory via `trackEvent` call sites.*
