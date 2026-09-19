---
tags: [mep, operations, compliance]
related: "[[CONTEXT]]"
---

# EU AI Act classification memo

**System.** Two Gemini-backed features, one seam (`src/lib/server/llm-provider.ts`,
`@google/genai`): (1) document extraction — turns an uploaded invoice/albarán photo, PDF or
XML into structured fields (supplier/receiver name, NIF, address, amounts, line items, tax
breakdown — prompt in `src/lib/server/extract.ts`) and assigns one of 17 fixed spend
categories (`src/lib/server/category-guide.ts`); (2) a chat assistant answering
natural-language questions over the tenant's own invoice/spend data (`docs/03_features/chat.md`,
metered in `docs/04_engineering/llm_usage_metering.md`). No biometric identification, no
profiling or scoring of natural persons feeds either feature, and no employment, credit,
insurance or essential-service decision is made or influenced by the output.

**Role.** Mise en Place is the **provider** (Art. 3(3)) of both features: it designs the
prompts, the category taxonomy and the field-validation logic, and places them on the market
under its own brand for restaurant customers. Google is the **GPAI model provider**
(Art. 3(63)) of Gemini itself; Mise en Place is a **deployer** of that model (Art. 3(4)),
integrating it solely via API with no fine-tuning or training on customer data visible in
the code.

**Classification: limited/minimal-risk, not high-risk under Annex III.** Headings checked
and ruled out:

| Annex III heading | Why it doesn't apply |
|---|---|
| 1. Biometrics | `extract.ts` reads only printed text fields; no facial/voice/biometric recognition anywhere in the codebase |
| 2. Critical infrastructure | Not applicable — SaaS expense tracking, no infrastructure control |
| 3. Education/vocational training | Not applicable |
| 4. Employment / worker management | The system processes **suppliers'** invoices, not employment decisions about the restaurant's own staff or applicants |
| 5. Access to essential private/public services (incl. creditworthiness, insurance) | No credit scoring or service-eligibility decision about a natural person. `supplier_metrics` (`schema.ts:302`) computes a deterministic, SQL-based reliability score (`supplier-reliability.ts` — coefficient of variation, not model-derived) that is descriptive, not decisional, and not AI-generated |
| 6. Law enforcement / 7. Migration, asylum, border control / 8. Administration of justice, democratic processes | Plainly inapplicable — B2B restaurant expense tracking |

**Transparency obligations that do apply:**
- **Art. 4 (AI literacy)** — applies to Mise en Place as both provider and deployer, in force since 2 Feb 2025, regardless of risk tier.
- **Art. 50(1)** — if the chat assistant isn't obviously identifiable as AI-driven from context, users interacting with it must be told they're talking to an AI system. No explicit "you're chatting with an AI" disclosure string was found in `src/lib/components/mep/ChatFab.svelte` in this pass. **OWNER INPUT REQUIRED**: confirm or add that disclosure.
- Art. 50(2)/(4) synthetic-content labelling does **not** apply — the system produces structured extracted data, not synthetic images/audio/video presented as authentic.

**The trigger that would change this classification:** if `supplier_metrics` (or any future
feature) started **gating a real-world outcome** for a natural person — e.g. auto-blocking a
sole-trader supplier, or feeding a score into a credit/insurance/access decision — that moves
the system into Annex III.5 (essential services) and makes it high-risk, triggering Art. 6
conformity obligations (risk management, data governance, logging, human oversight,
conformity assessment). Today the score is descriptive-only and never gates anything.
