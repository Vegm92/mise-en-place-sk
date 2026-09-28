---
tags: [mep, engineering]
related: "[[CONTEXT]]"
---

# LLM Usage Metering

Status: **Recorded and enforced** (chat/digest metering shipped in
#426; cost-cap enforcement and timeouts added in #1141).

## Current state

Chat (`src/routes/(app)/api/chat/+server.ts:133`) and the weekly digest
(`src/lib/server/weekly-digest.ts:78`) call `checkExtractionQuota` before
making Gemini requests to enforce per-tenant cost ceilings, pass
`AbortSignal.timeout(GEMINI_TIMEOUT_MS)` to `generate()`, and call `recordLlmUsage`
after a successful reply with `caller_context` `'chat'` / `'weekly-digest'`. Both
write to `llm_usage_log`, so `estimated_cost_usd` and `/admin/revenue` include
this spend.

Key details:

- `checkExtractionQuota` (`tenant_llm_quotas.monthly_cost_limit_usd`) is enforced
  across extraction, chat, and weekly digest paths. When a tenant reaches its cost
  limit, chat returns HTTP 402 (`quota_exceeded`) and weekly digest returns `null`.
- `monthly_usage` (plan quota, `claimMonthlyExtraction`) tracks only
  extractions — deliberately, since that is the unit the plan is sold on
  (ADR-036) — so chat/digest usage does not consume the plan's extraction
  counter. Document-structure detection is metered in `llm_usage_log` as
  `document-structure` but is likewise off the plan counter: it is the system
  deciding what a file is, not a document the customer asked to have
  processed.

## The mechanism that already exists (reuse, do not rebuild)

| Piece | File | Role |
|---|---|---|
| Provider seam | `src/lib/server/llm-provider.ts` | `LLMProvider.generate(content)` returns `{ text, usage: { inputTokens, outputTokens, model, durationMs } }`; `estimateCostUsd(model, in, out)` prices via the `COST_PER_MILLION` table. Seam selected by `LLM_PROVIDER` env (only `gemini` today). This is the ADR-007 seam |
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

## Enforced behavior (#1141)

Chat and weekly digest check `checkExtractionQuota` before invoking LLM calls.
If `quota.allowed` is false due to reaching `monthly_cost_limit_usd` or extraction
limits, Gemini provider calls are skipped. Furthermore, both paths pass
`AbortSignal.timeout(GEMINI_TIMEOUT_MS)` to prevent hung calls.

## Tests to add

No test asserts the chat/digest metering rows exist yet:

- Chat endpoint integration test asserting the `llm_usage_log` row (uses the
  `GenerateFn`/provider mock pattern; no live Gemini).
- Digest test asserting the same (currently only `tests/scheduler.test.ts`
  covers digest job registration).

## Call latency (#1003)

`LLMUsage.durationMs` is wall-clock milliseconds around the provider call, timed
inside `generate` rather than at each call site — so every `recordLlmUsage`
caller (extraction, structure detection, chat, digest) records it without
threading a timer through its own code, and it lands in
`llm_usage_log.duration_ms`.

Optional on the type, and absent rather than zero when no call crossed the
network: the XML e-invoice path returns `zeroUsage` without a provider, and a
stubbed provider in tests reports whatever it likes. Tokens and cost alone
cannot distinguish a slow model from a slow queue, which is the question this
column exists to answer.

## Related docs

- ADR-007 (`docs/06_decisions/extraction/ADR-007-llm-provider-seam.md`) — the
  seam and the #426 closure; the enforcement decision above amends it.
- Feature specs: `docs/03_features/chat.md`, `docs/03_features/digest.md`.
- Monitoring: `docs/05_operations/monitoring.md` (LLM usage row).
- Quota/billing: `docs/03_features/billing.md`, `docs/02_product/plans_and_entitlements.md`.
