# Haddock — Competitive Intelligence Report

**Research date:** May 2026  
**Sources:** haddock.app, YC, Crunchbase, Tracxn, Trustpilot, Glassdoor, restauracionnews.com, startups-espanolas.es, job postings, UX case studies

---

## Company Snapshot

| Fact | Detail |
|---|---|
| Legal name | HADDOCK APP S.L. |
| Founded | March 2020, Barcelona |
| Accelerators | Lanzadera → YC W22 (Winter 2022) → Decelera 2023 |
| Funding | ~$3.5M total (YC + Zone2Boost + JME Ventures + LevelsUp + Wayra + others) |
| No Series A | Revenue ~$165K ARR (2024 per Getlatka) — still early |
| Team | ~50 employees; lean eng team (~4 FE/BE + 1 AI engineer) |
| Clients | 2,000+ restaurants — Spain, Andorra, Portugal |
| Notable clients | Nandu Jubany (Michelin ⭐), Estimar (Rafa Zafra, ex-elBulli), Isabella's Group, Flax & Kale, Miss Sushi |
| Recognition | LinkedIn Top 20 Most Innovative Spanish Startups 2025 |
| GitHub | **No public repos.** CTO Carlos Marchal (departed) has personal repos in TypeScript/Rust/Go |

---

## Pricing (publicly listed)

| Plan | Monthly | Annual (per month) | Docs/mo | Users |
|---|---|---|---|---|
| Standard | €85 | €72.25 | 200 | 4 |
| Premium | €120 | €102 | 400 | Unlimited |
| Group | from €700 | Custom | Custom | Custom |

Annual billing saves ~15%. The Group plan requires a call. No freemium / free trial.

---

## Full Feature Inventory

### Core — Invoice Digitization
- Upload via photo, PDF, or email forward
- AI + OCR extracts: supplier, date, invoice number, all line items (product, qty, unit, price, VAT), totals
- ⚠️ **Processing SLA: "less than 48 hours"** — not real-time
- Cloud document storage + search + export (Excel/CSV)
- Automatic product catalog built from extracted line items
- Algorithm merges near-identical line item descriptions

### Albarán ↔ Invoice Reconciliation
- Recommended reconciliation: algorithm detects docs from same supplier + compatible dates + sum(albaranes) ≈ invoice
- Manual reconciliation: user selects invoice + delivery notes from a list
- Real-time incident detection: price discrepancies, billing errors
- Incident management with statuses (created / reviewing / resolved) and severity
- Supplier notification drafting to request corrective invoices (via Fina)

### Escandallos (Recipe Costing) — Key Differentiator
- Create a dish in 3 clicks by adding ingredients
- Dish cost auto-updates when purchase prices change from new invoices
- Set selling price → platform shows margin in real time
- Compare dish versions; waste factor accounting
- **This is their #1 marketing feature and retention driver**

### Dashboard / P&L
- Daily expense + sales breakdown
- Amounts with or without VAT (configurable)
- Supplier spend by family/subfamily
- Budget vs. actual tracking
- Price history per product per supplier
- Access control by role (Admin / Document manager / Manager view)

### Purchase Orders
- Generate order forms from supplier catalog
- Send via WhatsApp, email, SMS, AirDrop (no supplier API — just message forwarding)
- Track status: shared / confirmed / received
- Log discrepancies on receipt (wrong price, missing items)

### POS Integrations (10+ confirmed)
Square, Agora, DSTnet, Fourvenues, Haleteo, ICG Frontrest, Intersoft, Madisa, OfiBarman, OptiRest, Platomico, Techni-Web, Turbopos, ZS Rest, Yantar, Sofyman, HIOPOS, LastPOS, Glop — plus Ingenico payment terminals.

### Accounting Integration
- **Holded**: direct native integration (invoices auto-sent, vendors matched by NIF/CIF)
- **Sage**: CSV/Excel export only — no native integration
- **A3 (Wolters Kluwer)**: no integration at all
- **Xero / QuickBooks**: none

### HR Module (added ~2025)
- Shift scheduling
- Time clock with geolocation
- Vacation / absence approval workflows
- Payroll document signing
- Trustpilot reviewers noticed and praised this

### Fina — AI Agent (launched November 2025)
- **"The first AI agent for restaurants"**
- Monitors email inbox autonomously — no manual upload needed
- Extracts and routes invoices without human intervention
- Cross-references invoices vs. delivery notes; flags discrepancies in seconds
- Reconciles bank movements with invoices for payment control
- Drafts supplier messages to resolve incidents
- Claims: 90% reduction in admin time, ~15 hrs/week saved per location, €750/month avg savings
- Went from 0 to 300 clients in 2 months post-launch

### Multi-Location
- Group dashboard for all restaurants in one view
- Per-location and aggregated expense visibility
- Employee role management across locations

---

## Tech Stack

| Layer | What we know |
|---|---|
| Frontend | **React** (confirmed in job posting interview process) |
| Backend | **Node.js** (confirmed in job posting) |
| Language | **TypeScript** (inferred from CTO's GitHub + interview stack) |
| Cloud | **AWS** — CloudFront CDN + S3 confirmed via RocketReach |
| Database | Unknown — likely PostgreSQL on AWS RDS |
| AI/OCR | Undisclosed model — could be OpenAI/Anthropic/Google |
| Analytics | PostHog (inferred — ex-CTO joined PostHog) |
| Mobile | Web-based, no confirmed native app |

---

## What Users Praise (Trustpilot, testimonials, press)

- **"Like seeing the light"** — before/after moment for food cost visibility
- Real-time margin awareness when supplier prices change
- Time savings: "saves many hours of work"
- Ease of use: "intuitive and agile"
- Square POS integration (praised by name)
- HR/scheduling module ("pretty good")
- Recent OCR improvements noticed and appreciated
- Social proof from Michelin-star chefs converts well

---

## User Complaints & Exploitable Gaps

### 🔴 Critical gaps (build-around opportunities)

| Gap | Evidence | Our position |
|---|---|---|
| **48-hour processing delay** | Official docs say "less than 48 hours" | Gemini extraction: ~10–30 seconds ✅ |
| **Teams struggle to adopt — churn driver** | Haddock stakeholder-stated goal | Simpler UX opportunity |
| **No real-time stock/inventory tracking** | Trustpilot reviewer explicitly requests it | `alert-engine.ts` has stock forecasting ✅ |
| **No native mobile app** | UX case study recommendation | Gap for both of us |
| **Opaque pricing** | No self-serve signup; Group requires call | Publish prices, self-serve ✅ opportunity |

### 🟡 Secondary gaps

| Gap | Evidence |
|---|---|
| A3 / Sage native integration | Sage = CSV only; A3 = nothing |
| No pre-loaded supplier catalog | Users must wait for OCR to build catalog |
| WhatsApp still used for internal tasks | UX case study user research |
| Setup requires Haddock employee to configure | HR module docs say "our team helps configure" |
| Internal instability | Glassdoor: "chaotic, layoff prone, no vision towards employee future" |

---

## Where We Already Beat Them (Today)

| Advantage | Haddock | Us |
|---|---|---|
| Extraction speed | ~48 hours | ~30 seconds (Gemini 2.5 Flash) |
| Stock forecasting alerts | ❌ Not present | ✅ `alert-engine.ts` |
| Price shock alerts | ✅ Yes | ✅ `alert-engine.ts` |
| Transparent pricing | ❌ Opaque | ✅ Can publish from day 1 |
| Self-serve onboarding | ❌ Requires Haddock team | ✅ Can self-serve |

---

## Feature Gap Analysis (What We Need to Build to Match)

Priority order based on Haddock's own marketing + user feedback:

### P0 — Must have to be credible

| Feature | Why P0 | Haddock equivalent |
|---|---|---|
| **Escandallos / recipe costing** | Their #1 retention driver; mentioned in every review | Escandallos module |
| **Albarán ↔ invoice reconciliation** | Core workflow; heavily marketed | Reconciliation + incident management |
| **Price history per product/supplier** | Users reference this constantly | Price history charts |

### P1 — Needed to compete on parity

| Feature | Notes |
|---|---|
| **Purchase orders** | WhatsApp/email send from app; track status |
| **Holded integration** | Most common Spanish accounting tool for SMBs |
| **Multi-restaurant dashboard** | Required for groups; unlocks higher ACV |
| **Document reconciliation UX** | Link albaranes to facturas manually and automatically |

### P2 — Differentiation territory

| Feature | Why P2 |
|---|---|
| **A3 / Sage native integration** | First mover; Haddock only does CSV export |
| **Real-time stock tracking** | Users ask for it; Haddock doesn't have it |
| **Self-serve onboarding** | Haddock requires human setup; we can be fully automated |
| **Pre-loaded Spanish supplier catalog** | Reduces time-to-value dramatically |
| **Native mobile app** | Haddock has no native app; gap for both |

---

## Strategic Summary

Haddock is a legitimate, well-funded, YC-backed competitor with 2,000+ clients and a 5-year head start. Their moat is the escandallo (recipe costing that auto-updates), their network of 10+ POS integrations, and Fina (autonomous email agent). Their weaknesses are:

1. **Speed**: 48-hour extraction vs. our near-instant AI
2. **Inventory**: purchase tracking only, no true stock/consumption visibility  
3. **Onboarding friction**: requires their team to set up
4. **Accounting**: A3 and Sage gaps in the Spanish fiscal ecosystem
5. **Internal instability**: lean eng team, ex-CTO departed, Glassdoor flags chaos

The **escandallo gap is the biggest risk**: any Spanish restaurateur will ask "can it update my dish costs automatically?" If we can't answer yes, we lose the sale. Build that first.

The **speed advantage is our clearest hook**: "your invoices digitized in 30 seconds, not 48 hours."
