# Feature Specifications — Index

One specification per major product feature. Each file defines the contract an AI
agent must preserve when working on that feature: actors, preconditions, inputs,
outputs, business rules, state transitions, data/API/UI/background/external
dependencies, validation, error states, edge cases, security, idempotency,
observability and acceptance criteria.

Specs are **derived from the implementation** (source > docs). When a spec
disagrees with code, treat it as the audit entry point — do not silently choose
either side; follow `docs/07_ai/specification_audit.md`.

| Feature spec | Covers | Key files |
|---|---|---|
| [invoice_ingestion.md](../03_features/invoice_ingestion.md) | Upload, storage, batches, offline queue, extraction queueing | `sessions.ts`, `storage.ts`, `batch-core.ts`, `extract-batch.ts`, `queue.ts` |
| [invoice_extraction.md](../03_features/invoice_extraction.md) | File classification, Gemini extraction, XML e-invoices, VERI\*FACTU QR, retries | `extract.ts`, `extraction-worker.ts`, `einvoice-parser.ts`, `qr.ts`, `llm-provider.ts` |
| [invoice_confirmation.md](../03_features/invoice_confirmation.md) | Review, save, dedup, idempotency, low-confidence gate, status transitions | `invoice-save.ts`, `dedup.ts`, `idempotency.ts`, `invoice-status.ts`, `batch/[id]` |
| [invoice_management.md](../03_features/invoice_management.md) | List/detail/edit/export/status, optimistic-lock versioning, soft delete | `invoices` routes, `xlsx-export` |
| [suppliers.md](../03_features/suppliers.md) | Auto-creation, categories, reliability scores, contact data | `supplier.ts`, `supplier-reliability.ts`, `constants.ts` |
| [products.md](../03_features/products.md) | Product identity tiers, aliases, normalization, units, packs, LLM matching | `products.ts`, `normalize.ts`, `unit_conversions` |
| [price_alerts.md](../03_features/price_alerts.md) | Price-shock engine, history window, thresholds, per-base-unit basis | `alerts.ts` (`runPriceShock`) |
| [stock.md](../03_features/stock.md) | Stock levels, burn rate, low-stock forecast, unit conversions | `stock_levels`, `alerts.ts` (`runStockForecast`), `api/stock-levels` |
| [budgets.md](../03_features/budgets.md) | Monthly category budgets, spend aggregation, overage alerts | `category_budgets`, `alerts.ts` (`runBudgetCheck`), `budgets` routes |
| [analytics.md](../03_features/analytics.md) | Spend/prices/extraction analytics, trend buckets, materialized views | `trend.ts`, `mv_*`, `analytics/*` routes |
| [notifications.md](../03_features/notifications.md) | Notification lifecycle, bell, badge, reminders hub, i18n rendering | `system_notifications`, `notification-display.ts`, `reminders` routes |
| [chat.md](../03_features/chat.md) | Chat assistant, context snapshot, actions, session persistence | `chat-context.ts`, `api/chat`, `chat` routes |
| [digest.md](../03_features/digest.md) | Weekly digest generation, claiming, scheduling, email | `weekly-digest.ts`, `scheduler.ts`, `digest` routes |
| [billing.md](../03_features/billing.md) | Tiers, trial, quotas, entitlements, Stripe checkout/webhook | `billing.ts`, `billing-plans.ts`, `stripe-webhook` |
| [whatsapp.md](../03_features/whatsapp.md) | WhatsApp ingestion, phone-as-tenant-key, pairing, dedup, health | `whatsapp-bot.ts`, `whatsapp-pairing.ts`, `whatsapp.ts` |

Related indexes:

- Domain vocabulary: `../00_system/terminology.md`
- Blast radius: `../00_system/dependency_map.md`
- Invariants: `../00_system/architectural_invariants.md`
- "Why" decisions: `../06_decisions/README.md`
