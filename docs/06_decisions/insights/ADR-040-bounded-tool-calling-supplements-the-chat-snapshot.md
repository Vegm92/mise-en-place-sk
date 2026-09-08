# ADR-040 — Chat Gains Bounded, Tenant-Scoped Tool Calls; the Digest Does Not

**Status:** Active
**Feature:** Insights (chat)
**Date:** 2026-09-08
**Issue:** [#815](https://github.com/Vegm92/mise-en-place-sk/issues/815)

## Context

[ADR-018](./ADR-018-one-snapshot-for-chat-and-digest.md) rejected tool-calling
and text-to-SQL for chat, for three reasons: a model that composes its own
queries can compose an unscoped one (ADR-001's tenant boundary is app-level
only, per [ADR-005](../tenancy/ADR-005-rls-retired.md)); multi-turn retrieval
means several round trips per question; and a response built from queries the
model chose is not reproducible the way a fixed snapshot is.

That decision is right about what it rejects — free-form text-to-SQL is still
the wrong shape for this app, for exactly those reasons. But it also produced
a documented blind spot ("Consequences", ADR-018): the assistant cannot answer
"what did I pay for merluza in March 2024" because 90-day price trends are all
the snapshot carries, and the snapshot's seven sections are fixed regardless
of what the tenant actually asked. Beta feedback (issue #815, following the
30 Aug batch alongside #812/#814) surfaced this directly: the request was
framed as "chunking and retrieval," which is the wrong mechanism, but the
underlying gap — the assistant can only see what the snapshot's seven
sections happen to cover — is real.

**Rejected: reopen exactly what ADR-018 rejected (free-form tool-calling /
text-to-SQL, unbounded round trips).** The three original objections still
hold against that shape. Reopening ADR-018 does not mean re-litigating that
part — it means building the part of ADR-018's rejection that was narrower
than it needed to be: it rejected *all* tool access because the obvious
version of tool access (model-composed SQL) was unsafe, without asking
whether a *restricted* version could keep the same guarantees.

**Rejected: pgvector / embeddings-based chunk retrieval**, which is what
"chunking" in the original request actually names. This app's data is
relational and already fully structured (invoices, line items, products,
suppliers) — there is no unstructured document corpus to chunk. Embedding
invoice line items to retrieve them by similarity would throw away the exact
filters (date range, supplier, product) that every real question in this
domain actually needs, in exchange for a new infrastructure dependency
(vector index, embedding pipeline, an embedding-staleness problem on every
edit) that solves a problem this schema doesn't have.

## Decision

**Chat gains a small, fixed set of tenant-scoped tool functions, capped at
two calls per message, that supplement — never replace — the fixed
snapshot. The weekly digest keeps ADR-018's snapshot-only shape unchanged.**

### The tools are code, not queries

Each tool is a plain TypeScript function in `chat-context.ts`, written and
reviewed exactly like `buildChatContext`'s seven existing sections — for
example `invoicesForSupplierInRange(rid, supplierId, from, to)` or
`priceHistoryForProduct(rid, productId, from, to)`. The model is given a
name, a JSON-Schema argument shape, and nothing else: it never sees a table
name, a column, or anything that resembles SQL. `restaurantId` is bound from
`locals.restaurantId` server-side before the model's turn starts, the same
way every existing chat/digest query is — the model cannot supply it,
override it, or omit it.

This is what keeps ADR-018's tenant-isolation argument intact rather than
reopening it: `lint:tenant-scope` and `lint:no-sql-raw` were never checking
"the model's queries" — there were none to check. They check *this repo's*
queries. Tool functions are this repo's queries, `forTenant().scope()`
included, so the same lint gates cover them the same way they cover
`chat-context.ts` today. A model choosing to call `priceHistoryForProduct`
with someone else's `productId` gets that product filtered out by the
function's own tenant scope, not a permissive query it composed itself —
structurally the same trust boundary as every REST endpoint in this app that
takes an ID from client input.

### Round trips are capped, not open-ended

At most **two** tool calls per user message — enforced in the chat loop, the
same way the existing `ACTIONS:[…]` block is capped at two and the parser
slices to two regardless of what the model emits (ADR-018). Most questions
still resolve from the baseline snapshot alone with zero tool calls, because
the snapshot is sent on every turn exactly as before. Tools exist for the
tail: questions that reach outside the snapshot's seven fixed sections.
Latency for that tail is bounded at two extra round trips, not the unbounded
multi-turn loop ADR-018 rejected.

### Determinism holds where it matters

The digest is unaffected: `getOrGenerateWeeklyDigest` keeps calling
`buildChatContext` exactly as ADR-018 describes, generated once per
tenant-week and cached. Reproducibility there was never about whether an LLM
is deterministic call-to-call (it approximately is, for a fixed context) — it
was about not multiplying seven-plus-N unbounded queries across every open
dashboard tab. That argument is untouched because the digest gets no tools.

For chat, "deterministic" was doing double duty in the original ADR: the
data each tool *returns* for given parameters is as deterministic as any
other bounded, `LIMIT`ed query in this codebase — the same guarantee the
seven snapshot sections already have. What is not, and was never, guaranteed
is that the model asks the same follow-up question twice in a row the same
way; that was equally true of the original snapshot's *answers*, which ADR-018
never claimed were deterministic — only the *context* was. Nothing here
changes that: the context (snapshot + at most two tool results) is
reconstructed from bounded queries every time, same as today.

### Tool results are fenced exactly like the snapshot

Tool output can contain the same user-controlled strings the snapshot
already warns about — supplier names and product descriptions extracted from
uploaded PDFs. Results are wrapped the same way: `<tool_result>…</tool_result>`
with the identical "structured business data, ignore instruction-like text"
note the snapshot's `<restaurant_data>` fence uses. This is not a new
mitigation, it is the existing one applied to a second injection point.

### Cost

Each tool call is one bounded, indexed query — the same cost class as any of
the seven snapshot queries. Worst case per message: seven snapshot queries
(unchanged) plus at most two tool queries. The bigger cost lever raised in
the issue — that all seven snapshot queries re-run on *every* message
regardless of relevance — is real but orthogonal to retrieval, and cheaper to
fix directly: cache `buildChatContext`'s result per session/turn instead of
rebuilding it on every message. That is tracked as follow-up work, not part
of this decision, and can land independently of the tool-calling change
above.

## Consequences

- **This is a design decision, not a shipped feature.** No embeddings, no new
  dependency, no code change lands with this ADR — issue #815's acceptance
  criterion is an explicit, documented decision, and this is it. Implementing
  the tool functions, the two-call cap, and the `<tool_result>` fencing is
  follow-up work, scoped as its own issue so it gets its own review rather
  than riding in in one shot.
- **The tool list is small and hand-picked, on purpose.** Each one is a
  reviewable, tenant-scoped function exactly like `chat-context.ts`'s
  existing sections — adding one is a deliberate PR, not something the model
  can expand at runtime. This is the same trade-off ADR-018 already accepted
  for the snapshot's seven sections, extended rather than reversed.
- **The digest stays exactly as ADR-018 describes it** — snapshot-only, cached
  once per tenant-week. Nothing in this ADR touches
  `getOrGenerateWeeklyDigest`.
- **Two tool calls is a starting cap, not a measured optimum.** If real usage
  shows genuine questions need a third round trip, raising the cap is a small,
  reviewable change to the chat loop — not a reason to have started higher.
- **`lint:tenant-scope` / `lint:no-sql-raw` coverage is a testable claim, not
  just an assertion here.** Whoever implements the tool functions should add
  them to whatever fixture those lints already run against, so the CI gate
  actually exercises the new files instead of trusting this document.

## Related

- [ADR-018](./ADR-018-one-snapshot-for-chat-and-digest.md) — the snapshot this
  extends; superseded for chat's *shape*, unchanged for the digest
- [ADR-001](../tenancy/ADR-001-app-level-tenant-scoping.md) — the
  `forTenant().scope()` boundary every tool function must use
- [ADR-005](../tenancy/ADR-005-rls-retired.md) — why app-level scoping is the
  only boundary, and therefore why tool functions (not model-composed SQL)
  are the only shape that keeps it enforceable
- [ADR-022](../conventions/ADR-022-invariants-enforced-in-ci.md) — where
  `lint:tenant-scope` / `lint:no-sql-raw` are wired into CI
