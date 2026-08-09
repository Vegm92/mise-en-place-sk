# ADR-007 — A Provider Seam, Not a Provider Abstraction

**Status:** Active
**Feature:** Extraction
**Date:** 2026-08-09

## Context

Three features call an LLM: invoice extraction, the weekly digest, and the chat
assistant. All three call Gemini directly through `@google/genai`. That is fine
until you need the two things a direct SDK call cannot give you:

1. **Token accounting per tenant.** Extraction is the app's main variable cost
   and the thing plan quotas are sold against. Cost has to be attributable to a
   `restaurant_id` at the moment it is incurred, not reconstructed later from a
   provider invoice.
2. **A place to change providers.** Not because a switch is planned, but because
   a model deprecation or a regional-availability problem should be a change in
   one file rather than a change in every call site.

The temptation at this point is a full provider abstraction — a normalised
message format, capability negotiation, per-provider prompt adaptation. That is
a large amount of speculative structure for one provider.

## Decision

**A one-method seam.** `LLMProvider` is:

```typescript
interface LLMProvider {
  readonly model: string;
  generate(content: string | object[]): Promise<LLMResponse>;
}
```

`content` is either a prompt string or the provider's own parts array. The seam
deliberately does **not** normalise multimodal content: the parts array is passed
through as Gemini shapes it. Normalising it would mean inventing a format with
exactly one implementation to validate it against.

`createLLMProvider(name)` switches on `LLM_PROVIDER` and throws on an unknown
value rather than defaulting. An unrecognised provider name is a misconfigured
deployment, and failing at construction is better than silently extracting with
the wrong model.

**Cost is estimated locally, not read from the provider.** `COST_PER_MILLION`
holds per-model input/output rates; `estimateCostUsd` computes from the token
counts the API returns. Unknown models fall back to the cheapest historical rate
rather than throwing — a cost estimate must never be the reason an extraction
fails.

**Usage is recorded where the tenant is known.** `extractWithProvider` returns
`{ invoice, usage }` as a pair, so the worker — which holds `restaurantId` —
writes `llm_usage_log` and `monthly_usage` itself. The provider never sees a
tenant id and has no database access.

## Quota enforcement is a claim, not a check

The worker runs three gates before spending a token, in order:

1. `getAccessState` — subscription active? (trial expiry and inactive
   subscription produce distinct error keys)
2. `checkExtractionQuota` — tenant-level extraction and cost ceilings
3. `claimMonthlyExtraction` — the plan quota

The third is the load-bearing one, and it is a **conditional upsert**, not a
read-then-write:

```sql
INSERT INTO monthly_usage (restaurant_id, month, used) VALUES (…, 1)
ON CONFLICT (restaurant_id, month)
DO UPDATE SET used = used + 1 WHERE monthly_usage.used < :limit
RETURNING used
```

An empty `RETURNING` means the limit was already reached. Because the increment
and the limit test are one statement, two workers racing on a tenant's last
remaining slot cannot both win. A read-then-increment would let them.

The claim is **released** (`releaseMonthlyExtraction`) when extraction fails, so
a provider outage does not consume the tenant's quota. The release is wrapped in
a try/catch that only logs: failing to release must not turn a recoverable
extraction failure into a crashed job. The worst case is a tenant losing one slot
for the month, which is the correct direction to fail.

## Consequences

- Two entry points exist and both are live: `extractInvoice()` (no usage
  reporting, used by tests and the `generateOverride` path) and
  `extractWithProvider()` (usage-reporting, the production path). The override
  parameter is also how the worker skips quota gates for injected fakes — see
  `processExtractionJob`, where `generateOverride` bypasses billing entirely.
- `COST_PER_MILLION` is a hardcoded price table and will drift from real Gemini
  pricing. It is an internal cost signal for dashboards and tenant ceilings, not
  an accounting record. Treat divergence from the provider invoice as expected.
- The digest (`weekly-digest.ts`) and chat (`api/chat`) still construct
  `GoogleGenAI` directly and are **not** behind the seam, so their tokens are not
  in `llm_usage_log`. Extraction is the dominant cost and was addressed first;
  bringing the other two behind `createLLMProvider` is a known follow-up, not an
  oversight of this decision.
- Adding a provider means: one `create<X>Provider` function, one `switch` case,
  and its rates in `COST_PER_MILLION`. It does *not* mean touching extraction
  routing, because [ADR-006](./ADR-006-file-classification-routes-extraction.md)
  keeps classification above the seam.

## Related

- [ADR-006](./ADR-006-file-classification-routes-extraction.md) — extraction routing
- [ADR-013](../billing/ADR-013-tiers-trial-and-quota.md) — where the quota numbers come from
