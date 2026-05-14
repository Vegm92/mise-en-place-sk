# Spanish Market Research: Restaurant Invoice & Procurement Software

**Prepared for: Mise-en-Place**
**Date: May 2026**
**Scope: Barcelona and major Spanish cities — restaurant vertical**

---

## 1. Market Landscape

Spain's hostelería sector is large and highly fragmented. There are roughly **9,359 bars and restaurants in Barcelona alone** (1 per 172 residents), with over 90% being independent operators. Catalonia has 16,100+ establishments, making it the highest-density region in Spain. At the national level, the **restauración independiente controls 94% of locations** (251,751 establishments) — predominantly autónomos and micro-SMEs.

The software market splits into two layers:

### POS / TPV (front-of-house) — saturated, price-competitive

| Product | Origin | Market position | Approx. pricing |
|---|---|---|---|
| **Ágora POS / TPV** | Spain (IGT Microelectronics) | 37,000+ clients, leading Spanish POS | From €32/month |
| **Last.app** | Spain | Modern cloud TPV, growing fast | €46–€160/month |
| **Hosteltáctil** | Spain | Established, older architecture | Varies |
| **Camarero10** | Spain (Madrid, 2017) | SMB-focused, includes purchasing module | Undisclosed |
| **BDP / Blendi** | Spain | 90,000+ licenses, legacy market leader | Varies |
| **MyChefTool** | Spain | All-in-one, no-commission model | Undisclosed |

### Back-of-house / procurement / inventory — less saturated, the real gap

| Product | Origin | Key focus | Approx. pricing |
|---|---|---|---|
| **Gstock** | Spain | Stock, procurement, escandallos, OCR albaranes | Undisclosed; 1,800+ clients |
| **Prezo** | Spain | Purchasing, supplier invoices, OCR+AI, inventory | Undisclosed |
| **Yurest / Yurest Lite** | Spain (Valencia) | Full ERP for chains; Lite for independents (Nov 2025) | Undisclosed |
| **Controliza** | Spain | AI-powered procurement, demand prediction | Undisclosed; 1,000+ restaurants |
| **Haddock** | Spain | AI/OCR invoice digitization, cost control | Custom; 3.9/5 Trustpilot |
| **Dijit.app** | Spain | OCR+AI albaranes/facturas, integrates with Ágora | From €0.20/doc; €20 starter |
| **Gerentino** | Spain | 80+ hostelería tools incl. procurement | Undisclosed |

### International tools present in Spain

| Product | Origin | Position in Spain |
|---|---|---|
| **Apicbase** | Belgium | Multi-site F&B management; Spanish language; chains (€199+/month est.) |
| **Mapal OS** | Spain/UK | People & operations for large chains; 45,000 locations in 54 countries |
| **MarketMan** | USA | Inventory+procurement; from $199/month; not Spain-first |
| **Holded** | Spain (Barcelona) | SMB ERP/accounting; very popular autónomo tool; acquired by Sage 2022 |

---

## 2. Spotlight: Key Spanish-Native Competitors

### Yurest (Valencia, 2019)
The closest to a full-stack restaurant ERP in Spain. Used by Grosso Napoletano, Saona, Familia La Ancha. In **November 2025 launched Yurest Lite** specifically for independent single-venue hostelería — direct response to the market gap of tools too complex/expensive for small operators.

Features: supplier purchase orders, albarán digitization, OCR, purchase reporting, escandallos, stock, AI recommendations. Claims clients see 12% cost reduction in purchasing. **This is the most direct competitor.**

### Dijit.app
A pure-play OCR+AI document processing specialist for hostelería, built in Spain. Processes albaranes and facturas at ~3 seconds/document, claimed 99% accuracy. Uses GPT-4, Claude, and Llama. Per-document pricing (~€0.20/doc, decreases with volume). Native connectors to Ágora POS and ICG Software.

One Andalusian chain with 15 locations cut supplier reception time from **2 hours to 15 minutes** per location. ROI in 3 months. **Direct functional competitor to mise-en-place's AI document processing.**

### Prezo
Focused procurement tool: AI+OCR albarán digitization, real-time inventory updates, purchase split by service, budget optimization, supplier price tracking, supplier invoice management. Cloud-based. Verifactu-compliant. No public pricing.

### Gstock
Most established inventory+purchasing specialist for HORECA in Spain; 1,800+ establishments. Strong on escandallos (recipe costing with dynamic price recalculation), mobile inventory counting, OCR albarán reading, compliance (food safety, allergens, Verifactu). A hotel group reported reducing F&B cost from 36–37% to **33%** after implementation.

### Controliza
Positioned as AI-powered procurement SaaS for hospitality. 1,000+ restaurants including La Mafia se Sienta a la Mesa, Urban Poke. Claims **20% average profitability increase** and **30% waste reduction** after 3 months. AI demand prediction is a headline feature.

### Haddock
AI/OCR invoice digitization, cost control, price variation alerts. 3.9/5 on Trustpilot. Pricing is custom. Described as "intuitive" but noted to require a committed team. Direct competitor.

---

## 3. Real User Complaints & Pain Points

### Against existing procurement/inventory tools

- **Excel persistence is the #1 pain point.** A large share of restaurants still use WhatsApp to order from suppliers, Excel for tracking, and paper albaranes — cited repeatedly as "el error más costoso."
- **Yurest's own research found 73% of restaurants commit purchasing management errors**, particularly in supplier price tracking. Average loss: **€800/month per location** from undetected price deviations.
- **"Albaranes erróneos pueden causar pérdidas significativas"** — manually entered delivery notes with errors in quantities, prices, or references propagate into inventory and recipe costing.
- Tools like Apicbase are criticized for requiring **"a knowledgeable and committed restaurant team"** — too complex for small independents.
- The market is full of **point solutions that don't connect**: POS in one silo, stock in another, escandallos on a spreadsheet, accounting with the asesor.
- Mapal OS Trustpilot complaints center on lack of post-migration training and difficulty reaching support.

### Against general SMB accounting (Holded, Sage)

- **Holded's most common Trustpilot complaints:** "Atención al cliente malísimo," long wait times even on premium plans, AI chatbot blocking access to real humans, pricing that "can skyrocket depending on your needs."
- Sage is seen as reliable but **too complex and expensive** for small hostelería autónomos.
- The **Verifactu compliance transition** is creating direct financial pain: adapting existing software can cost **€1,500–€8,000** per establishment. Only 8% of autónomos had implemented it by November 2025 (deadline postponed to 2027).

---

## 4. Regulatory Landscape

### VeriFactu (Reglamento de Software de Facturación) — MANDATORY

- **What it is**: All billing software must be certified; every invoice cryptographically chained and sent real-time to AEAT, with a mandatory QR code on each invoice.
- **Timeline**: January 1, 2027 (IRPF contributors); July 1, 2027 (all other businesses/autónomos).
- **Sanctions**: Up to €50,000/year for using non-certified software; up to €150,000/year for software manufacturers.
- **Cost of adaptation**: €1,500–€8,000 per establishment.
- **Implication**: Any invoice management tool in Spain **must be VeriFactu-compliant** before 2027. This is mandatory table stakes.

### Factura Electrónica Obligatoria (Ley Crea y Crece)

- Applies to B2B invoices only (not consumer restaurant tickets).
- Timeline: October 2027 (€8M+ revenue); October 2028 (everyone else).
- **Impact**: Supplier invoices received by restaurants will increasingly be structured electronic invoices (FacturaE, Peppol format) — creating demand to move beyond OCR into direct API ingestion of e-invoices.

### TicketBAI (Basque Country only)

- Mandatory in Gipuzkoa, Álava, and Bizkaia. Affects all hostelería in Bilbao.
- Separate certification from VeriFactu.

### Kit Digital (Opportunity)

- Spanish government subsidies of **€2,000–€12,000** to SMBs for digital tools.
- Becoming a certified **Agente Digitalizador** means restaurants can acquire mise-en-place at zero direct cost, funded by the subsidy.
- How several competitors (Qamarero, Tipsi) are growing. Removes price friction entirely for early adoption.

---

## 5. Barcelona Market Specifics

- **9,359 bars and restaurants** in Barcelona (1 per 172 residents); 12,118 restaurants total.
- **Over 90% are independent operators** — autónomos or small SLs, typically 1–3 locations, turnover under €1M.
- Barcelona's startup ecosystem is strong: 2,403 startups in Catalonia in 2025, record **€1.13B raised** — but hostelería tech remains underrepresented.
- Holded (the most popular Spanish SMB accounting SaaS) is a **Barcelona company** (acquired by Sage 2022), meaning there's local familiarity with SaaS for business management.
- **44% of hostelería businesses in Spain have not yet automated purchasing processes** — the addressable market is enormous.
- Barcelona has a large number of international restaurant concepts (Asian, American, etc.) operated by owners for whom general European software is poorly adapted.

---

## 6. Gaps & Opportunities

### Gap 1: The disconnected back-office for the independent restaurant
The biggest gap: no single, affordable, easy-to-use tool connecting **supplier purchasing → albarán digitization → inventory → recipe costing → financial reporting** for the independent Spanish restaurant (1–3 locations, autónomo or small SL, turnover <€1M).

Gstock and Prezo require deliberate implementation effort. Yurest/Controliza work better for multi-location chains. Yurest Lite (Nov 2025) is the most recent attempt to serve independents — still very new.

### Gap 2: Affordable AI price-deviation alerts for single-venue operators
73% of restaurants lose ~€800/month from undetected supplier price deviations. No tool makes this accessible and affordable for single-venue operators. Dijit.app does document OCR cheaply; Yurest does price alerts for chains. The **independent operator in between is underserved**.

### Gap 3: The WhatsApp-to-structured-order pipeline
A large share of Spanish restaurant procurement happens via WhatsApp messages, phone calls, or paper forms. The gap: a tool that converts these unstructured communications into structured purchase orders, reconciles them against delivered albaranes, and flags discrepancies — **without requiring the supplier to change behavior**.

### Gap 4: Unified invoice-to-asesor pipeline
Spanish small restaurants work with an **asesor fiscal/contable**. The flow is: invoices pile up → monthly/quarterly sent to asesor → asesor manually enters into Sage/A3/Holded. No tool makes this hand-off seamless, VeriFactu-compliant, and automated. **Strong positioning opportunity: "the bridge between your kitchen and your accountant."**

---

## 7. Differentiation Recommendations for Mise-en-Place in Barcelona

### 1. Lead with the "stop losing €800/month to supplier price errors" message
The Yurest statistic (73% of restaurants, €800/month loss per location) is a powerful, verifiable hook. Frame mise-en-place's AI price monitoring as **immediate ROI**, not a productivity story.

### 2. Target the "Yurest Lite gap" before Yurest closes it
Yurest Lite launched November 2025 and is still finding its footing. There is a narrow window to capture independent Barcelona operators who need:
- WhatsApp/email photo → structured albarán in <5 seconds
- Automatic supplier price deviation alert
- Simple escandallo (recipe cost) linking
- VeriFactu-ready invoice management
- Monthly summary exportable to their asesor

At **below €100/month per location**, with zero setup friction.

### 3. Build the "asesor bridge" as a unique feature
No tool in Spain makes it trivially easy to export a clean, categorized, VeriFactu-compliant invoice ledger that an asesor can directly import into Sage, A3, or Holded. This is a strong B2B2C wedge: **win the restaurateur, make the asesor's life easier, get the asesor to recommend you to all their other restaurant clients**.

### 4. VeriFactu compliance as a promise, not a feature
Frame it as included and handled — "we handle the tax compliance so you don't have to pay €1,500–€8,000 to adapt." Do not market it as a feature; make it a baseline promise.

### 5. Kit Digital certification as a demand driver
Becoming a certified Agente Digitalizador removes price friction entirely. Restaurants and pharmacies can acquire mise-en-place at zero direct cost funded by government subsidy. Research competitors (Qamarero, Tipsi) who are already using this channel.

### 6. Spanish-first, Catalan-aware
Full Spanish UX and support from day one. Consider Catalan language support — especially relevant for Catalonia institutional relationships. International tools (Apicbase, MarketMan) have generic European support; **local responsiveness is a real differentiator in Barcelona**.

### 7. Lean into Barcelona's independent restaurant identity
Market to the restaurateur who wants to **compete professionally without corporate back-office infrastructure** — not for chains, not for franchises. The "mise-en-place" name already resonates with craft kitchen culture.

---

## Summary: Competitor Quick-Reference

| Tool | Procurement? | AI/OCR? | Spain-native? | Target | Pricing |
|---|---|---|---|---|---|
| Gstock | Yes | Yes (OCR) | Yes | HORECA | Undisclosed |
| Prezo | Yes | Yes (AI+OCR) | Yes | Restaurant | Undisclosed |
| Yurest Lite | Yes | Yes | Yes | Independent restaurant | Undisclosed |
| Dijit.app | Partial (docs) | Yes (GPT+Claude) | Yes | Restaurant/Retail | €0.20/doc |
| Controliza | Yes | Yes (AI demand) | Yes | Restaurant chains | Undisclosed |
| Haddock | Partial | Yes | Yes | Restaurant | Custom |
| Apicbase | Yes | Limited | No (Belgium) | Chains | €199+/month est. |
| MarketMan | Yes | Partial | No (USA) | Restaurant | From $199/month |
| Holded | Partial | No | Yes (Barcelona) | SMB general | €29–€119+/month |

---

## Key Numbers

- **94%** of Spanish restaurants are independent operators
- **9,359** bars/restaurants in Barcelona; 90%+ independent
- **73%** of restaurants lose ~**€800/month** to purchasing management errors (Yurest, 2025)
- **44%** of hostelería businesses have not yet automated purchasing
- VeriFactu deadline: **January–July 2027**
- Factura electrónica B2B: **October 2027–2028**
- Kit Digital subsidies: **€2,000–€12,000** available for qualifying SMBs
- Barcelona startup ecosystem: **€1.13B raised** in Catalonia in 2025
