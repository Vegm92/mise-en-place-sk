# E-Invoicing Readiness — VERI*FACTU & RD 238/2026

Technical brief for the dev team. Researched June 2026 from primary sources (BOE, AEAT sede). Tracking issues: see "Workstreams" below.

---

## TL;DR for engineering

1. **Mise en Place is NOT an SIF** (Sistema Informático de Facturación) under VERI*FACTU. The regulation covers invoice-**issuing** software only; we only receive/digitize supplier invoices. **No certification needed** — unless we ever add an invoice-issuance feature, which would put us in scope (AEAT FAQ on RD 1007/2023 scope).
2. From **2027**, every supplier invoice we ingest will carry a **standardized QR code** containing the issuer NIF, invoice number/series, date, and total — machine-readable ground truth we can parse to cross-check (or pre-fill) AI extraction, plus a deep link to AEAT's verification service. This is our single biggest extraction-accuracy lever.
3. From **~Oct 2027 / Oct 2028**, B2B invoices become structured XML (EN 16931: UBL/Facturae/CII/EDIFACT). We should ingest these directly — **no OCR at all** — and our existing "mark paid" flow maps naturally onto the new **mandatory payment-status reporting** (4 working days), which we can turn into a compliance feature restaurants will need anyway.

---

## 1. VERI*FACTU (RD 1007/2023 + RD 254/2025 + Orden HAC/1177/2024)

**What it is:** certified, tamper-evident invoice-issuance software ("SIF") with SHA-256 hash-chained `registros de facturación` (XML per AEAT XSD, optional continuous submission to AEAT via web service = "VERI*FACTU mode").

**Who must comply:** anyone *issuing* invoices with software. Deadlines (postponed by RDL 15/2025): **1 Jan 2027** (corporate-tax payers) / **1 Jul 2027** (everyone else, incl. autónomos). Our restaurant customers' *POS/till systems* are in scope; **our product is not** (receive-only).

**The QR code (Orden HAC/1177/2024, art. 20–21 + AEAT technical doc "Características del QR y especificaciones del servicio de cotejo", v0.4.7, 17 Oct 2024):**
- 30×30 to 40×40 mm, ISO/IEC 18004, on every invoice (paper or digital image).
- Encodes a URL to AEAT's verification/remission service with 4 parameters: **`nif`** (issuer), **`numserie`** (series+number), **`fecha`** (`DD-MM-AAAA`), **`importe`** (total, decimal point).
- Endpoints: production `https://www2.agenciatributaria.es/wlpl/TIKE-CONT/ValidarQR` (test: `https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR`); a `ValidarQRNoVerifactu` variant exists for non-VERI*FACTU SIFs.
- VERI*FACTU invoices also carry the legend *"Factura verificable en la sede electrónica de la AEAT"* or *"VERI*FACTU"*.
- The invoice **recipient** can scan the QR to check (cotejo) the invoice register at AEAT and may voluntarily remit invoice information from the receiving side (AEAT FAQ).

**What we build on this:**
- QR detection + parse in the extraction pipeline → authoritative NIF/number/date/total to validate or pre-fill the AI extraction (totals can be hard-verified before save — directly supports issue #67's "never save an unverified money field").
- "Verify at AEAT" deep link on the invoice detail page; later, optional automated cotejo.
- Handle the **TicketBAI QR/identifier** variant for Basque suppliers (different scheme, already live).

**Issuer-side spec (context only — our suppliers):** XSDs/WSDLs and validation rules for `registros de facturación` are published on the AEAT sede ("Sistemas Informáticos de Facturación y VERI*FACTU → Información técnica").

## 2. Mandatory B2B e-invoicing (Ley 18/2022 "Crea y Crece" → RD 238/2026)

**Status:** RD 238/2026 published 31 Mar 2026 (BOE-A-2026-7295), in force 20 Apr 2026. The implementing **ministerial order** (regulating the public platform, SPFE) went to public consultation **17 Apr 2026**; expected entry into force **1 Oct 2026**, which starts the clocks:
- **+12 months (~1 Oct 2027):** businesses with turnover > €8M must issue/receive e-invoices; private platform requirements take effect.
- **+24 months (~1 Oct 2028):** everyone else — i.e., **every restaurant and nearly every food supplier**.

**Formats:** structured invoices conforming to **EN 16931**, in any admitted syntax: **Facturae, UBL, CII, EDIFACT**. The public solution's reference syntax is **UBL**.

**Architecture:** dual system —
- **SPFE** (Solución Pública de Facturación Electrónica, run by AEAT): free emit/receive channel for SMEs, **universal repository** (private platforms must push a faithful copy of every invoice), and payment-status receiver (anti-morosidad monitoring).
- **Private exchange platforms:** ISO/IEC 27001 certification, advanced e-signature, mandatory interconnection/interoperability, copia fiel to SPFE.

**Receiver obligations (our customers):** receive structured e-invoices, and report statuses to the issuer within **4 natural days (excluding weekends/national holidays)**: commercial **acceptance/rejection** and **full effective payment + date** (optional: partial payment/acceptance, assignment).

**What we build on this:**
- **Structured ingestion:** accept Facturae 3.2.2 / UBL XML uploads (and email-in later) → bypass OCR/AI entirely; line items (`InvoiceLine`: description, quantity, unit price, taxes) come for free and are *more* granular than our current extraction. Keep the AI path for paper/photo (which remains legal between businesses until each tier's deadline, and for tickets/albaranes after).
- **Payment-status workflow:** our existing paid/pending status + reminders extend naturally to "accepted/rejected/paid with date + 4-day deadline countdown". Whether we report to SPFE on the restaurant's behalf depends on the final ministerial order (API details pending) — design the data model now, integrate when the order is final.
- **Strategic decision (deferred):** we do NOT need to become a registered private exchange platform to read invoices and manage statuses for our customers. Becoming one (ISO 27001 etc.) is a possible future play; revisit when the ministerial order is final.

## 3. Formats to base our implementation on (the "formatting documents")

| Spec | What for | Where |
|---|---|---|
| **Facturae 3.2.2 XSD** (current version, BOE-A-2017-9982) | Parsing Spanish e-invoices incl. line detail | https://www.facturae.gob.es/formato/Paginas/version-3-2.aspx |
| **EN 16931** (European semantic model) + **UBL 2.1** syntax | SPFE reference syntax; EU interop | CEN EN 16931-1; OASIS UBL 2.1 (`Invoice` schema) |
| **Orden HAC/1177/2024** | QR + invoice content + registro spec (issuer side) | https://www.boe.es/diario_boe/txt.php?id=BOE-A-2024-22138 (consolidated PDF: BOE-A-2024-22138-consolidado) |
| **AEAT QR/cotejo technical doc** v0.4.7 | Exact QR URL composition & encoding | AEAT sede → SIF y VERI*FACTU → Información técnica → "Características del QR y especificaciones del servicio de cotejo" |
| **RD 238/2026** | B2B e-invoice system, statuses, platforms | https://www.boe.es/diario_boe/txt.php?id=BOE-A-2026-7295 |
| **RD 1007/2023 (+RD 254/2025)** | SIF scope (confirms we're out of scope) | https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840 |
| **TicketBAI spec** (Basque suppliers) | Alternate QR/identifier on received invoices | Each foral hacienda (Bizkaia/Gipuzkoa/Álava) publishes its spec |

## 4. Workstreams (tracked as issues)

1. **VERI*FACTU QR parsing + AEAT verification on received invoices** — P1, ship well before Jul 2027 → **issue #110**
2. **Structured e-invoice ingestion (Facturae 3.2.2 / UBL)** — P1, beta before Oct 2027 → **issue #111**
3. **Payment-status workflow per RD 238/2026** — P2 design now, integrate when the ministerial order is final → **issue #112**

**Watch items:** final text of the SPFE ministerial order (in consultation since 17 Apr 2026 — API specs for status reporting and repository access will land there); AEAT QR doc version bumps; whether EDIFACT support matters for large food distributors (likely: Makro/Sysco-scale suppliers use EDI).
