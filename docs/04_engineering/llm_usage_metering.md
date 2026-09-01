# LLM Usage Metering — issue doc for later adoption

Status: **Open gap** (documented 2026-08-13). No code change made; this doc is
the contract for whoever implements the fix.

## The problem

Chat (`src/routes/(app)/api/chat/+server.ts`) and the weekly digest
(`src/lib/server/weekly-digest.ts`) instantiate `GoogleGenAI` and call
`ai.models.generateContent` **directly**. They bypass the provider seam that
ADR-007 establishes ("one-method provider seam plus per-tenant usage
accounting"). As a result:

- Their Gemini calls are **not written to `llm_usage_log`** → `estimated_cost_usd`
  undercounts real spend.
- `checkExtractionQuota` (`tenant_llm_quotas.monthly_extractions` /
  `monthly_cost_limit_usd`) does **not** see chat/digest usage → the cost limit
  is not enforced on those surfaces.
- `monthly_usage` (plan quota, `claimMonthlyExtraction`) tracks only extractions
  — deliberately, since that is the unit the plan is sold on (ADR-036) — so a
  Pro/Business tenant's AI spend on chat and digests per month is unbounded
  from the app's perspective. Document-structure detection is metered in
  `llm_usage_log` as `document-structure` but is likewise off the plan counter:
  it is the system deciding what a file is, not a document the customer asked
  to have processed.
- `/admin/revenue` and any future unit-economics (`estimated_cost_usd` sums)
  silently miss this spend; the MRR-vs-COGS picture is optimistic.

This is a **cost-accounting + quota-enforcement** gap, not a correctness bug:
chat and digest work, they are just invisible to metering.

## The mechanism that already exists (reuse, do not rebuild)

| Piece | File | Role |
|---|---|---|
| Provider seam | `src/lib/server/llm-provider.ts` | `LLMProvider.generate(content)` returns `{ text, usage: { inputTokens, outputTokens, model } }`; `estimateCostUsd(model, in, out)` prices via the `COST_PER_MILLION` table. Seam selected by `LLM_PROVIDER` env (only `gemini` today). This is the ADR-007 seam |
| Usage accounting | `src/lib/server/llm-quota.ts` | `recordLlmUsage(restaurantId, usage, callerContext?)` inserts into `llm_usage_log` (cost computed + stored as `estimated_cost_usd`, `caller_context` labels the caller); non-fatal on failure. `checkExtractionQuota` enforces `tenant_llm_quotas` (count + cost) |
| Plan quota | `src/lib/server/llm-quota.ts` | `claimMonthlyExtraction` / `releaseMonthlyExtraction` / `reserveMonthlyExtractions` gate the plan quota on `monthly_usage`; `getMonthlyUsage` is the single read every surface uses (ADR-036) |
| Storage | `src/lib/server/schema/extensions.ts:121-147` | `llm_usage_log` (indexed `(restaurant_id, created_at)`), `tenant_llm_quotas` (per-tenant custom caps), `monthly_usage` (plan counter), `usage_events` (append-only trail the counter sums to) |
| Warning email | `src/lib/server/quota-warning.ts` | `maybeSendQuotaWarning(restaurantId)` — sends one quota warning per month when `monthly_usage` crosses the plan limit (it counted saved invoices until ADR-036, so it warned late or never) |

**Currently-metered paths** (how the seam is used correctly today):
- Extraction: `src/lib/server/extraction-worker.ts:80` calls `checkExtractionQuota`,
  `claimMonthlyExtraction`/`releaseMonthlyExtraction`, and
  `recordLlmUsage(rid, usage, 'extraction-worker')` at line 128.
- Product matching: `src/lib/server/products.ts:642-664` calls
  `recordLlmUsage` (injectable via `deps.recordUsage`).

## The fix (sketch for implementation)

1. **Chat** — replace the raw `GoogleGenAI` usage in
   `src/routes/(app)/api/chat/+server.ts:92-107` with
   `createLLMProvider()` + `provider.generate(...)`, then
   `recordLlmUsage(locals.restaurantId, response.usage, 'chat')` after a
   successful reply. Keep the existing `systemInstruction` handling — verify the
   seam's `generate` accepts a system instruction (it currently takes only
   `content`; a small seam extension may be needed for `config.systemInstruction`
   and for the current object-array parts shape).
2. **Digest** — same in `src/lib/server/weekly-digest.ts:48-49` with
   `callerContext: 'weekly-digest'`.
3. **Decision needed** — should chat/digest count toward
   `tenant_llm_quotas.monthly_extractions` and the plan `monthly_usage` counter?
   Recommendation: count toward the **cost limit** (`monthly_cost_limit_usd`)
   and `llm_usage_log` always; decide separately whether they should consume
   the *extraction* counter (they are a different surface — likely yes for
   `tenant_llm_quotas.monthly_extractions`, no for the plan extraction quota).
   Record the decision in an ADR amendment to ADR-007.
4. Keep `recordLlmUsage` non-fatal (metering must never break chat/digest).
5. Optionally have `maybeSendQuotaWarning`/`checkExtractionQuota` consider
   `caller_context` so quota emails can mention what was consumed.

## Verification / acceptance criteria

- After one chat reply, exactly one new row in `llm_usage_log` with
  `caller_context='chat'` and a positive `estimated_cost_usd`.
- After one digest generation, one row with `caller_context='weekly-digest'`.
- Extraction behavior is unchanged (existing tests stay green):
  `tests/whatsapp-bridge.test.ts`, extraction worker tests.
- Metering failure never throws into the user path (chat/digest still reply
  even if `recordLlmUsage` errors).
- `/admin/revenue` cost lines now include chat/digest spend.

## Tests to add

- Chat endpoint integration test asserting the `llm_usage_log` row (uses the
  `GenerateFn`/provider mock pattern; no live Gemini).
- Digest test asserting the same (currently only `tests/scheduler.test.ts`
  covers digest job registration).
- A unit test that `recordLlmUsage` is idempotent-friendly (safe on failure)
  and tenant-scoped.

## Related docs

- ADR-007 (`docs/06_decisions/extraction/ADR-007-llm-provider-seam.md`) — the seam this gap
  violates; a fix should amend it.
- Feature specs: `docs/03_features/chat.md`, `docs/03_features/digest.md`.
- Monitoring: `docs/05_operations/monitoring.md` (LLM usage row).
- Quota/billing: `docs/03_features/billing.md`, `docs/02_product/plans_and_entitlements.md`.
