# Product Definition

Source: `README.md`, `docs/02_product/plan_de_negocio.md`, `docs/SPAIN_MARKET_RESEARCH.md`,
and the implemented product surface. Where docs and implementation disagree,
implementation wins and the difference is flagged in `CONTEXT.md`.

## What it is

Mise en Place is an AI-powered supplier-invoice intelligence SaaS for independent
restaurants and small groups. The core loop:

1. **Capture** — photograph or upload a supplier invoice (PDF/JPG/PNG), or send
   it to a WhatsApp number.
2. **Extract** — Gemini extracts supplier, header fields and line items with
   per-field confidence; structured XML e-invoices (Facturae/UBL) are parsed
   without AI.
3. **Confirm** — the user reviews low-confidence fields and confirms; a
   canonical invoice row is persisted.
4. **Act** — the confirmed data feeds spend analytics, price-shock alerts,
   low-stock forecasts, budgets, payment reminders, a weekly AI digest and a
   chat assistant over the restaurant's own purchasing data.

Spanish first, bilingual (es/en).

## Product surface (implemented)

| Area | What it does | Route |
|---|---|---|
| Upload → Extract → Confirm | Multi-file batch, offline queue, per-field confidence, duplicate detection, low-confidence review | `/`, `/batch/[id]` |
| Invoices | List, detail, edit, status (pending/paid), xlsx export, original-file viewer | `/invoices`, `/invoice/[id]` |
| Suppliers | Auto-created; spend, price trends, reliability metrics, contact data, category | `/suppliers` |
| Products | Normalized catalog, aliases, unit conversions, pack sizes, merge/split | `/products` |
| Analytics | Spend by category/period, price evolution, extraction-quality dashboard | `/analytics/*` |
| Budgets | Monthly budget per category with overage warnings — beta-flag-gated, default off (`03_features/feature_flags.md`) | `/budgets` |
| Reminders | Overdue / due-soon invoices + alerts hub, one-click mark-paid | `/reminders` |
| Alerts | Price shock, low-stock forecast, budget overage, unit-conversion, category nudges, product suggestions, VERI\*FACTU mismatch | notification bell + reminders |
| Weekly digest | Gemini-generated weekly summary per restaurant | `/digest` |
| Chat | Data-aware assistant over the restaurant's own data | `/chat` + floating FAB |
| Billing | Plan cards, Stripe checkout, trial | `/billing` |
| Settings | Profile, restaurant, locations (multi-location beta-flag-gated, default off), WhatsApp pairing | `/settings` |
| Admin/ops | Dashboard, system events, health, errors (Sentry), revenue, dead letters | `/admin/*` |
| Waitlist | Public bilingual landing + email capture | `/waitlist` |

## Positioning

- Built for **independent restaurants and small groups** in Spain, bilingual.
- Two distribution motions: direct signup/onboarding and **WhatsApp ingestion**
  (staff already send invoices via WhatsApp — the app answers with a review link).
- Regulatory tailwind: VERI*FACTU (2027) and B2B e-invoicing (Ley Crea y Crece)
  are parsed/verified natively (`einvoice-parser.ts`, `qr.ts`).

## Non-goals (deliberate)

- Not an invoicing/issuance tool — the app does not issue invoices (and is
  therefore not itself a VERI*FACTU SIF).
- Not a POS/TPV (the waitlist copy references future TPV integration — not yet
  implemented).
- Not a general accounting package — spend intelligence for purchasing.
- No RLS; no dynamic SQL for the chatbot (ADR-018).

## Current maturity

Pre-launch. Open audit items and current task: `CONTEXT.md`. Gap analysis:
`GAP_ANALYSIS.md`. Production gate checklist: `PRODUCTION_SIGNOFF.md`.
