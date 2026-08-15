# Business Rules

The product rules the implementation actually enforces. Thresholds are exact and
come from source (file:line); change them through the settings keys shown, or
with an ADR if structural. Feature-level detail lives in `docs/03_features/`.

## Ingestion & extraction

| Rule | Value | Where |
|---|---|---|
| Uploaded types | PDF/JPG/PNG; `.xml` not allowed via web upload (e-invoices enter via WhatsApp/media or direct parse) | `sessions.ts` |
| Max file size | 20 MB | `sessions.ts` |
| Validation | extension whitelist + magic-byte check | `sessions.ts` |
| Upload rate limit | `upload:{rid}` 10/min | `(app)/+page.server.ts` |
| Extraction concurrency | Global cap `MAX_CONCURRENT_EXTRACTIONS` (default 3) enforced by a distributed semaphore; worker `batchSize` follows the cap | `worker.ts`, `rate-limiter.ts` |
| Retries | 429/503 → 3 attempts (1 s/2 s/4 s); 60 s wall-clock timeout | `extract.ts` |
| Classification | `text_pdf` (≥50 chars), `scanned_pdf`, `image`, `xml` | `extract.ts` |
| Stale cleanup | batches not confirmed > 24 h are deleted by scheduled job | `batch-core.ts` |

## Confirmation & save

| Rule | Value | Where |
|---|---|---|
| Low-confidence gate | blocked unless `low_confidence_ack`; header field < 0.85 or overall < 0.85 | `invoice-save.ts` |
| Duplicate gate | SHA-256 content hash on canonicalized content; `contentDuplicate` | `dedup.ts` |
| Supplier+number duplicate | unique `(rid, supplier_id, invoice_number)` | `invoice-save.ts` |
| Idempotency | `idempotency_keys` claim-once (`form-submit` scope), client UUID | `idempotency.ts` |
| First-invoice onboarding | sets `has_completed_onboarding`, redirects `/dashboard?first_invoice=1` | `invoice-save.ts` |

## Alerts (computed on save, persisted)

| Alert | Rule | Default | Where |
|---|---|---|---|
| `price_shock` | deviation ≥ threshold vs median of ≤3 previous same-supplier prices; prefers €/base-unit when both normalized | 15% (`price_alert_threshold`) | `alerts.ts` |
| `low_stock_forecast` | `(currentStock + addedQty) / dailyBurnRate < 3` days | 3 days | `alerts.ts` |
| `budget_overage` | spend ≥ 80% warning, ≥ 100% exceeded; once per category+level+month | 80% (`budget_warning_threshold`) | `alerts.ts` |
| `supplier_uncategorized` | category `Other`/unset with ≤ 1 invoice | — | `alerts.ts` |
| `supplier_category_suggested` | proposed category ∈ `VALID_CATEGORIES`, confidence ≥ 0.6 | — | `alerts.ts` |
| `unit_conversion_needed` | line has unknown unit | — | `invoice-save.ts` |
| `verifactu_qr_mismatch` | QR payload `numserie`/`fecha`/`importe` ≠ submitted (amount tol > €0.005) | — | `qr.ts` |

## Products & units

| Rule | Value | Where |
|---|---|---|
| Fuzzy match threshold | `pg_trgm similarity ≥ 0.42` (exact alias first, LLM last) | `products.ts` |
| LLM match threshold | ≥ 0.8, against candidate list only | `products.ts` |
| Category confidence | ≥ 0.6 to accept extracted category | `constants.ts` |
| Normalized price | `unitPrice / baseQuantity`, 4 dp | `products.ts` |
| Conversion | supplier-scoped override wins over name-matched | `unit_conversions` |

## Billing

| Rule | Value | Where |
|---|---|---|
| Trial | 30 days from first contact; locked when `trialEndsAt` passes | `billing.ts` |
| Quotas | trial 20, starter 100, pro 300, business unlimited (null) | `billing.ts` |
| Feature flags | digest, stock, supplierScores, multiLocation, aiAssistant per tier | `billing.ts` |
| Provisional prices | starter 29 / pro 59 / business 129 € (override via `PLAN_PRICE_*_EUR`) | `billing-plans.ts` |
| Webhook dedup | `idempotency_keys` (`stripe-webhook` scope); claim deleted on error → Stripe retries | `billing.ts` |
| Out-of-order guard | only apply when `lastEventAt <= event.created` | `billing.ts` |

## Notifications & reminders

| Rule | Value | Where |
|---|---|---|
| Nav badge | overdue invoices + pending `budget_overage` (level `exceeded`) | `+layout.server.ts` |
| Reminders scope | `status IN (pending, accepted)` and `due_date <= now + 7 d` | `reminders` route |
| E-invoice working days | 4 working days acceptance deadline (Spanish calendar) | `working-days.ts` |

## Data retention / lifecycle

| Rule | Value | Where |
|---|---|---|
| Invoice deletion | soft delete (`deletedAt`) | `invoices` |
| Processed requests purge | > 48 h | `idempotency.ts` |
| Dead letters | pending kept 180 d, resolved 90 d | `dead-letter.ts` |
| Old files | `DELETED_FILE_RETENTION_DAYS` cron purge | `alerts.ts` |
| Account deletion | owner-only, cancels Stripe, deletes files + rows | `api/user/delete` |

## See also

- Per-feature contracts: `docs/03_features/`
- Plans/entitlements detail: `docs/02_product/plans_and_entitlements.md`
- Domain vocabulary: `docs/00_system/terminology.md`
