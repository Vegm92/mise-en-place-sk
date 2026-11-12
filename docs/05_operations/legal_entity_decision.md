---
tags: [mep, operations, compliance]
related: "[[CONTEXT]]"
---

# Legal entity decision: SL or autónomo

**Date:** 18 October 2026 · **Issues:** #779 (no entity behind live data), #984 (LSSI art. 10
data), #784 (processor role) · **Hand-off:** [`checklist_gestor.md`](./checklist_gestor.md)

This is an executive memo, not legal or tax advice. Every figure has a source; anything I hold
below ~80% confidence is marked **[Likely]** (probably right, check it) or **[Guessing]**
(order of magnitude only). The gestor confirms the binding numbers.

## Recommendation

**Incorporate a single-shareholder SL (SLU) now, through the PAE/CIRCE online route with the
standard articles (*estatutos tipo*) and €3,000 share capital. Do not register as autónomo as an
interim step.**

- **Setup cost:** about €120 in official fees (notary €60, Registro Mercantil €40, name certificate
  about €17), plus €0–€400 if a gestoría runs the paperwork. The €3,000 capital stays in the
  company's bank account and can be spent on the business. It is not a fee.
- **First-year running cost:** about €3,000–€3,600 if the €80 *tarifa plana* applies to you as
  administrator, or €5,800–€8,000 if it does not. That is roughly €1,000–€1,500 more than year one
  as an autónomo, and €2,500–€6,000 more each year after that **[Likely]**.
- **Timeline:** 1–2 weeks of real time from asking for the name certificate to having a registered
  company with a provisional NIF **[Likely]**. The legal minimum is a few working hours once the
  deed is signed.

### Why an SL, and why now

1. **The raise needs one.** The plan is to raise €750k
   ([`ceo_audit_2026-08-29.md`](./ceo_audit_2026-08-29.md)). An autónomo cannot issue shares. An SL
   also unlocks two things investors and the founder want: the 50% IRPF deduction for angels
   investing in new companies (up to €100k a year, SA/SL only), and the startup-law (*empresa
   emergente*) 15% corporate-tax rate.
2. **Starting as autónomo means changing identity twice.** The 8 September comment on #779 already
   expects this: correct the documents, bump `POLICY_VERSION`, then do it all again at
   incorporation. The second round is the expensive one, because by then it reaches paying
   customers. Every customer has to re-accept the terms and the data processing agreement. Every
   restaurant has to replace you with a new supplier (new NIF) in its books. Stripe has to
   re-verify a new business, or you open a new account and customers re-enter their cards.
   Vendor DPAs get re-signed. The founder assigns the IP to the company. See *Switching cost
   later* below.
3. **The liability is real, and as an autónomo it is personal and unlimited.** Mise en Place is
   the data processor for every restaurant's supplier documents (#784). It also runs an
   unofficial WhatsApp client that knowingly breaches WhatsApp's terms (ADR-025). An autónomo
   answers with everything they own (Código Civil art. 1911). The *emprendedor de responsabilidad
   limitada* (ERL) carve-out shields only the main home (up to €300k, or €450k in a city of more
   than 1M people such as Barcelona) **[Likely]**.
4. **B2B buyers and DPAs.** The target buyer is a group with 2–10 locations, or a venue buying
   ≥€20k a month from suppliers. That buyer will want a counterparty that can sign a data
   processing agreement and that will still be there if the founder's personal circumstances
   change.
5. **The cost gap is small next to the alternatives.** It is about €1k–€1.5k in year one and a
   few thousand a year after that, mostly the administrator's higher Social Security minimum.
   Compare that with redoing every contract later, or with uncapped personal exposure.

### When autónomo would be the right call instead

Choose autónomo if **all three** hold: no outside money for at least 18 months; the WhatsApp
(Baileys) channel stays off; and expected profit stays under roughly €40–60k a year. In that case
register as autónomo with the ERL carve-out. Invoo puts the break-even for an SL at about €60k
profit **[Likely]** ([Invoo](https://invoo.es/es/blog/analisis/autonomo-vs-sociedad-limitada-2026/)).
Today the raise is in the plan and the WhatsApp channel is built, so this does not apply.

This reverses the interim decision recorded on #779 (8 Sep 2026: autónomo first, SL later). The
reason is point 2: the interim path was costed as one change, but it is two.

## Cost comparison (2026)

| Item | SL (PAE/CIRCE, estatutos tipo, capital ≤ €3,100) | Autónomo | Source |
|---|---|---|---|
| Name certificate (RMC) | about €16.50 **[Likely]** | — | [Billeo calculator](https://www.billeo.es/herramientas/calculadora-gastos-constitucion-sl) |
| Notary | €60 fixed fee (ask for it, some notaries forget to apply it) | — | [Notarios y Registradores](https://www.notariosyregistradores.com/web/normas/destacadas/aspectos-societarios-de-la-ley-de-creacion-y-crecimiento-de-empresas/), [Legia](https://legia.es/guias/como-constituir-sociedad-limitada-pasos), [Justito Notario](https://www.justitonotario.es/tramitacion-telematica-integral-notaria-gestion-serfides-gestoria-notarios/) |
| Registro Mercantil | €40 fixed fee; BORME publication and ITP-AJD (operaciones societarias) exempt | — | same |
| Same SL without estatutos tipo (notary route) | €600–€1,500 total **[Likely]** | — | [Billeo](https://www.billeo.es/blog/constituir-sl-paso-a-paso-2026) |
| Gestoría to incorporate | €0–€400 (often bundled free with a monthly plan) **[Likely]** | €0–€100 **[Guessing]** | [Billeo](https://www.billeo.es/crear-sociedad-limitada) |
| Minimum share capital | €1 legal minimum. Below €3,000, 20% of profit goes to legal reserve, and in a liquidation shareholders answer jointly for the gap up to €3,000. **Use €3,000**: it avoids both and still gets the €60/€40 fees | — | [Cuatrecasas](https://www.cuatrecasas.com/es/spain/articulo/espana-ley-crea-y-crece-medidas-societarias) |
| Gestoría, monthly | €150–€500/month; budget about €150–€200 for a pre-revenue SL with few invoices **[Likely]** | €65–€150/month **[Likely]** | [Billeo](https://www.billeo.es/blog/gestoria-precios) |
| Social Security, first 12 months | Tarifa plana €80/month (about €88.64 with the MEI surcharge), **if** granted to administrators **[Likely]** | Same tarifa plana | [VidaCaixa](https://www.vidacaixa.es/articulos/finanzas-y-ahorro/tarifa-plana-autonomos), [Quipu](https://getquipu.com/blog/tarifa-plana-autonomos-societarios/) |
| Social Security, after the tarifa plana | Minimum base €1,424.40/month for *autónomos societarios* in 2026, or a provisional ≥€1,000 while the definitive base is fixed. At 31.5% that is €315–€449/month **[Likely]** | Income-linked. Lowest band of the reduced table: base €653.59, about €206/month **[Likely]** | [Orden PJC/297/2026](https://www.boe.es/buscar/act.php?id=BOE-A-2026-7296), [Iberley on BNR 5/2026](https://www.iberley.es/noticias/boletin-noticias-red-5-2026-aclaraciones-orden-cotizacion-2026-36292), [UPTA](https://upta.es/wp-content/uploads/2026/03/RES-ORDEN-COTIZACION-2026-RETA.pdf) |
| Annual accounts deposit + book legalisation | about €60–€150/year **[Guessing]**. Late deposit risks fines of €1,200–€60,000 and a registry block | — | [TeamSystem](https://teamsystem.es/magazine/plazo-cuentas-anuales/) |
| Representative digital certificate (FNMT) | about €15–€30 **[Guessing]** | uses personal certificate / Cl@ve | — |
| Income tax | IS 15% in the first year with positive base and the next. Micro-companies (<€1M turnover) otherwise 19% on the first €50k and 21% above in 2026 **[Likely]**. Startup-certified (ENISA): 15% for 4 years | IRPF progressive (19%–47%) on net profit | [FacturaDirecta](https://www.facturadirecta.com/blog/impuesto-sociedades-2026-pymes-micropymes/), [Legálitas](https://www.legalitas.com/actualidad/certificado-enisa-para-startups) |

**Year-one totals.** These are pre-revenue, so income tax is about €0 in either case.

- **SL:** setup €120–€520, gestoría €1,800–€2,400, Social Security €1,064 (tarifa plana) or
  €3,780–€5,390 (without), registry and certificate about €100. Total **€3,100–€4,100**
  with the tarifa plana, or **€5,800–€8,400** without it **[Likely]**.
- **Autónomo:** gestoría €780–€1,800, Social Security €1,064. Total **€1,850–€2,900**
  **[Likely]**.

Both routes need the founder in RETA (the self-employed Social Security scheme). As sole
shareholder and administrator of an SL who works in it, you are an *autónomo societario*
(LGSS art. 305.2.b). So "becoming autónomo" is not avoided by incorporating. What changes is the
minimum base.

## Timeline

| Route | Steps | Realistic duration |
|---|---|---|
| **SL via PAE/CIRCE with estatutos tipo** | Name certificate from the RMC → PAE files the DUE (single electronic form) in CIRCE and the provisional NIF is issued → bank certificate → notary signs the standard deed → registry registers it within 6 working hours → definitive NIF | 1–2 weeks **[Likely]**. Vendors advertise 24–72 h ([Zunapro](https://www.zunapro.com/spain/es/blog/crear-sl-espana-guia-completa)). Registry inscription "1–2 weeks, sometimes 48 h" ([cuantomecuesta](https://cuantomecuesta.com/es/crear-empresa-sl/)). The 6-working-hour registry window is in [Captain Legal](https://www.captain.legal/es/blog/documentos-constituir-sociedad-limitada/) |
| SL via notary with custom articles | Same, plus drafting and a full registry review | 2–4 weeks **[Guessing]** |
| Autónomo | Modelo 036 (the simplified 037 was abolished on 3 Feb 2025) + RETA registration online | 1–3 days ([AEAT](https://sede.agenciatributaria.gob.es/Sede/en_gb/todas-noticias/2025/enero/9/orden-ministerial-modificacion-declaraciones-censales.html)) |

Name certificate: the name stays reserved for 6 months, and the certificate is valid for 3 months
to sign the deed **[Likely]** ([Entretrámites](https://entretramites.com/en/?p=56847),
[BOE resolution on an expired reservation](https://www.boe.es/boe/dias/2026/08/07/pdfs/BOE-A-2026-17254.pdf)).
"Mise en Place" is a common hospitality phrase. Expect the bare name to be taken and bring
alternatives (see the checklist).

## Liability

| | SL | Autónomo |
|---|---|---|
| Business debts, contract claims, GDPR fines | The company's assets, i.e. its capital and what it owns | Everything the founder owns (Código Civil art. 1911). ERL protects only the main home, ≤ €300k (×1.5 in cities over 1M people) **[Likely]** ([INEAF](https://www.ineaf.es/divulgativo/mercantil/el-emprendedor-de-responsabilidad-limitada-nueva-ley-de-emprendedores)) |
| Where it leaks | Administrator liability for negligence or for failing to dissolve on losses (LSC arts. 236–241, 367). Personal guarantees banks ask for. Tax liability passed to the administrator (LGT art. 43). Below €3,000 capital, joint liability for the gap in a liquidation | — |

## Stripe, B2B customers and invoicing

- **Invoices (factura completa).** Every invoice must show number and series, date, the issuer's
  and the customer's legal name, NIF and address, a description, the taxable base, the VAT rate
  and amount, and the total (RD 1619/2012 art. 6,
  [BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696)). Restaurants need your NIF on the
  invoice to deduct the VAT. **You cannot issue a valid invoice until the NIF exists.**
- **VAT.** 21% on SaaS sold to Spanish businesses (Ley 37/1992 art. 90,
  [BOE](https://www.boe.es/buscar/act.php?id=BOE-A-1992-28740)).
- **EU business customers.** No Spanish VAT is charged. The invoice says *inversión del sujeto
  pasivo* (reverse charge), the customer accounts for the VAT (place of supply: art. 69 LIVA), and
  you report the sale on modelo 349. This needs registration in the **ROI** (intra-EU operators
  register) via modelo 036, and a check of the customer's VAT number in VIES
  ([STEL Order on 349](https://www.stelorder.com/blog/modelo-349/)). Canary Islands customers are
  outside the EU VAT area (IGIC) **[Likely]**. Barcelona-first sales are domestic, so this is a
  "when it comes up" item.
- **Withholding.** An SL's invoices never carry IRPF withholding. An autónomo registered under a
  *professional* heading (e.g. 763, programmers) would make every customer withhold 15% (7% in the
  first years), which is friction for restaurants. Under the *business* heading 845, which the tax
  authority (DGT) applies to cloud services, it does not **[Likely]**
  ([DGT V0392-26](https://www.conversoriaecnae.es/consultas-dgt/v0392-26-primer-lugar-en-que-rubrica-del);
  Ley 35/2006, [BOE](https://www.boe.es/buscar/act.php?id=BOE-A-2006-20764)).
- **VERI\*FACTU** (certified invoicing software). Invoicing software must comply from **1 January
  2027 for corporate-tax payers (an SL)** and from 1 July 2027 for everyone else (an autónomo),
  under RDL 15/2025 **[Likely]**
  ([Cruz Guillén](https://cruzguillenabogados.com/aplazamiento-verifactu-2027-fechas-claves/),
  [Nedaxe](https://nedaxe.com/verifactu/obligados-calendario)). This is the one real cost of the
  SL route on timing: whatever issues your invoices (Stripe Invoicing, the gestoría's software, or
  another tool) must be compliant in about 10 weeks. Whether Stripe Invoicing qualifies is unknown
  **[Guessing]**. Ask the gestor which tool they use. This concerns *your own* invoices. It is not
  a product claim, and MDR-001 still forbids claiming the product is VERI\*FACTU compliant.
- **B2B e-invoicing** (RD 238/2026). In force since 20 April 2026. The obligation phases in after
  a ministerial order: about October 2027 for companies with turnover over €8M, and about October
  2028 for everyone else **[Guessing]**
  ([BOE](https://www.boe.es/eli/es/rd/2026/03/25/238/con/20260331),
  [Billin](https://www.billin.net/blog/calendario-final-factura-electronica-b2b/)).
- **Stripe.** The account must carry the legal entity, NIF and registered address that go on
  invoices and receipts. Some accounts can change *Individual → Company* in Settings → Account
  details, which triggers re-verification. Others need Stripe support or a new account. With a new
  account, live subscriptions and saved cards do not carry over **[Guessing]**
  ([Stripe on Spanish registration](https://stripe.com/fr/resources/more/registration-in-commercial-registry-in-spain)).
  This is the strongest argument for setting Stripe up once, on the SL, **before the first paying
  customer**. In the EEA the contracting entity is Stripe Payments Europe, Ltd. (Ireland)
  **[Likely]** ([Stripe privacy centre](https://stripe.com/es/legal/privacy-center)).

## Switching cost later (autónomo → SL)

Doing it in this order costs, on top of the SL setup itself:

- **Contracts:** new terms and DPA accepted by every customer. That is a second `POLICY_VERSION`
  bump, and a 30-day notice by email, since the terms (clause 10) promise one.
- **Customer books:** each restaurant swaps you for a new supplier (new NIF) in its accounting.
- **Stripe:** re-verification or a new account (see above).
- **Vendor DPAs:** Google, Railway, Stripe, Resend and Sentry DPAs re-accepted by the new
  controller.
- **IP:** the code, brand and domain assigned from founder to SL. Done as a contribution in kind,
  it needs a valuation, and any gain is personal income **[Guessing]**.
- **Startup status:** the risk that the SL counts as continuing an existing business when it
  applies for *empresa emergente* status or the angel deduction **[Guessing]**. This is question 6
  for the gestor.

Estimate: €500–€2,000 in professional fees, 1–3 weeks of founder time, and some churn risk
**[Guessing]**. Small in money; large in attention, at exactly the moment the raise needs it.

## Processor role and sub-processors (#784), as published by this change

The privacy policy now lists every provider that processes personal data, read from
`SUBPROCESSORS` in `src/lib/legal-entity.ts`:

| Provider | Region today | Transfer safeguard | Source |
|---|---|---|---|
| Railway Corporation (app, DB, worker) | `asia-southeast1`, Singapore. Moving to `europe-west4` is planned in #978 | SCCs (Decision 2021/914) in Railway's DPA | [Railway DPA](https://railway.com/legal/dpa) |
| Railway Corporation (object storage) | `iad`, Virginia (US). The region of a bucket cannot be changed: moving means a new bucket | SCCs | [Railway docs](https://docs.railway.com/storage-buckets). Buckets run on Tigris **[Likely]** ([Railway Station](https://station.railway.com/questions/railway-storag-bucket-eu-west-85b7529c)) |
| Google LLC (Gemini API, Sign-in with Google) | US | DPF **[Likely]**. Confirm on the [DPF list](https://www.dataprivacyframework.gov/list) | Free-tier Gemini content "used to improve our products", paid tier not ([Gemini pricing](https://ai.google.dev/pricing)) |
| Stripe Payments Europe, Ltd. / Stripe, LLC | IE / US | DPF | [Stripe DPF policy](https://stripe.com/en-nl/privacy-shield-policy) |
| Functional Software, Inc. (Sentry) | US. EU hosting exists; check the DSN host | DPF, SCC fallback | [Sentry](https://sentry.io/trust/privacy/) |
| Resend | US (data stored in the US whatever the sending region) | DPF since March 2025, plus SCCs | [Resend changelog](https://resend.com/changelog/data-privacy-framework-certification), [Resend GDPR](https://resend.com/security/gdpr) |
| Cloudflare, Inc. (Turnstile) | US | DPF **[Likely]** | DPF list |

The terms gain clause 13, the Art. 28(3) processing agreement: instructions, confidentiality,
security, sub-processor authorisation with 30 days' notice and a right to object, assistance,
breach notice without undue delay, deletion on account deletion, and audits. The privacy policy
gains §10, which explains the controller/processor split to restaurants' suppliers. Counsel
should still review both before the first paying customer (#784).

## What changes in the code when the NIF arrives

Everything reads `src/lib/legal-entity.ts`: `/legal`, `/privacy`, `/terms` and the email footer.
On incorporation:

1. Fill `form: 'sociedad_limitada'`, `legalName` (it must end in SL/SLU), `taxId` (a valid
   B-prefixed NIF), `registeredAddress` and `companyRegistry`, then set `isPlaceholder: false`.
   `tests/legal-entity.test.ts` fails if the flag and the data disagree, if the NIF is invalid,
   or if an SL has no registry entry.
2. After #978, update `region`/`countries` on the two Railway rows in `SUBPROCESSORS`.
3. Bump `POLICY_VERSION` in `src/lib/server/consent.ts`. It is `'2026-07'` today.
   `hasConsent()` accepts a consent row of **any** version. As written, the bump only re-labels
   new signups. It does not make existing users re-accept. That needs `hasConsent` to match the
   current version, which is a separate, deliberate change.
4. Email existing users 30 days ahead of the new terms (terms clause 10).
5. Remove the `COMPANY_LEGAL_NAME/ADDRESS/NIF` row from
   [`go_live_checklist.md`](./go_live_checklist.md). Those env vars are no longer read; the email
   footer reads the entity module.
