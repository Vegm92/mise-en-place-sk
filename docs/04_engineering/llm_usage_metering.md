---
tags: [mep, engineering]
related: "[[CONTEXT]]"
---

# LLM Usage Metering

Status: **Recorded, not fully enforced** (chat/digest metering shipped in
#426, closing the original 2026-08-13 gap this doc described; a cost-cap
enforcement gap remains — see below).

## Current state

Chat (`src/routes/(app)/api/chat/+server.ts:133`) and the weekly digest
(`src/lib/server/weekly-digest.ts:78`) call `recordLlmUsage` after a
successful reply, with `caller_context` `'chat'` / `'weekly-digest'`. Both
write to `llm_usage_log`, so `estimated_cost_usd` and `/admin/revenue` now
include this spend.

What's still open:

- `checkExtractionQuota` (`tenant_llm_quotas.monthly_extractions` /
  `monthly_cost_limit_usd`) is called only from the extraction path
  (`src/lib/server/extraction-worker.ts:89`). Chat and digest usage is
  **recorded but not checked against the per-tenant cost cap** — a tenant can
  exceed `monthly_cost_limit_usd` through chat/digest alone and nothing stops
  it, though the spend is now visible for review.
- `monthly_usage` (plan quota, `claimMonthlyExtraction`) tracks only
  extractions — deliberately, since that is the unit the plan is sold on
  (ADR-036) — so chat/digest usage does not consume the plan's extraction
  counter. Document-structure detection is metered in `llm_usage_log` as
  `document-structure` but is likewise off the plan counter: it is the system
  deciding what a file is, not a document the customer asked to have
  processed.

This is a **cost-cap enforcement** gap, not a correctness or visibility one:
chat and digest work and their spend is now visible in `llm_usage_log` and
`/admin/revenue`; only the per-tenant cost limit doesn't yet stop them.

## The mechanism that already exists (reuse, do not rebuild)

| Piece | File | Role |
|---|---|---|
| Provider seam | `src/lib/server/llm-provider.ts` | `LLMProvider.generate(content)` returns `{ text, usage: { inputTokens, outputTokens, model } }`; `estimateCostUsd(model, in, out)` prices via the `COST_PER_MILLION` table. Seam selected by `LLM_PROVIDER` env (only `gemini` today). This is the ADR-007 seam |
| Usage accounting | `src/lib/server/llm-quota.ts` | `recordLlmUsage(restaurantId, usage, callerContext?)` inserts into `llm_usage_log` (cost computed + stored as `estimated_cost_usd`, `caller_context` labels the caller); non-fatal on failure. `checkExtractionQuota` enforces `tenant_llm_quotas` (count + cost) |
| Plan quota | `src/lib/server/llm-quota.ts` | `claimMonthlyExtraction` / `releaseMonthlyExtraction` / `reserveMonthlyExtractions` gate the plan quota on `monthly_usage`; `getMonthlyUsage` is the single read every surface uses (ADR-036) |
| Storage | `src/lib/server/schema/extensions.ts:121-147` | `llm_usage_log` (indexed `(restaurant_id, created_at)`), `tenant_llm_quotas` (per-tenant custom caps), `monthly_usage` (plan counter), `usage_events` (append-only trail the counter sums to) |
| Warning email | `src/lib/server/quota-warning.ts` | `maybeSendQuotaWarning(restaurantId)` — sends one quota warning per month when `monthly_usage` crosses the plan limit (it counted saved invoices until ADR-036, so it warned late or never) |

**Metered paths today** (all go through the seam and `recordLlmUsage`):
- Extraction: `src/lib/server/extraction-worker.ts:80` calls `checkExtractionQuota`,
  `claimMonthlyExtraction`/`releaseMonthlyExtraction`, and
  `recordLlmUsage(rid, usage, 'extraction-worker')` at line 128.
- Product matching: `src/lib/server/products.ts:642-664` calls
  `recordLlmUsage` (injectable via `deps.recordUsage`).
- Chat: `src/routes/(app)/api/chat/+server.ts:133` calls
  `recordLlmUsage(rid, response.usage, 'chat')` after a successful reply,
  via `createGeminiProvider().generate()` with `systemInstruction` support
  (added in #466).
- Digest: `src/lib/server/weekly-digest.ts:78` calls `recordLlmUsage` with
  `callerContext: 'weekly-digest'`, same seam.

Chat and digest are logging-only: neither is added to `checkExtractionQuota`
or `claimMonthlyExtraction`. `recordLlmUsage` stays non-fatal everywhere —
metering failure never breaks chat, digest, or extraction.

## Remaining decision

Should chat/digest usage count toward `tenant_llm_quotas.monthly_cost_limit_usd`
(and, separately, the plan's `monthly_usage` extraction counter)? Per
ADR-007, this is an open product decision, not an engineering gap — the
mechanism (`checkExtractionQuota`) already exists and would just need chat
and digest wired into it once the call is made. Record the decision as an
ADR-007 amendment when it's made.

## Tests to add

No test asserts the chat/digest metering rows exist yet:

- Chat endpoint integration test asserting the `llm_usage_log` row (uses the
  `GenerateFn`/provider mock pattern; no live Gemini).
- Digest test asserting the same (currently only `tests/scheduler.test.ts`
  covers digest job registration).

## Related docs

- ADR-007 (`docs/06_decisions/extraction/ADR-007-llm-provider-seam.md`) — the
  seam and the #426 closure; the enforcement decision above amends it.
- Feature specs: `docs/03_features/chat.md`, `docs/03_features/digest.md`.
- Monitoring: `docs/05_operations/monitoring.md` (LLM usage row).
- Quota/billing: `docs/03_features/billing.md`, `docs/02_product/plans_and_entitlements.md`.
