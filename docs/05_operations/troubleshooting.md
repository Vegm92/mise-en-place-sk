---
tags: [mep, operations]
related: "[[CONTEXT]]"
---

# Troubleshooting

Quick triage matrix. For deployment-specific failures, read `DEPLOYMENT.md`.
For deep per-file explanations, see the per-subsystem `## Code notes` sections.

## Symptom → cause → fix

| Symptom | Likely cause | Fix / check |
|---|---|---|
| "No module / import not found" at boot | Lockfile drift or missing dep | `pnpm install --frozen-lockfile`; CI installs frozen |
| `db:check-sync` fails | schema.ts drifted from committed migrations (ADR-003) | `pnpm db:generate` → review SQL → `db:migrate` → re-check |
| Migrate fails mid-apply | Non-idempotent / invalid SQL migration | Roll forward with an additive migration; never hand-edit prod |
| Extraction stuck `pending/queued` | Worker down or dead-letter growth | Check worker logs, `/admin` queue counts, DLQ rows |
| Duplicate invoice after retry | content-hash gate bypassed (write outside `invoice-save.ts`) | Ensure all creates go through the single write path (ADR-008) |
| Webhook "signature invalid" | Secret mismatch / URL wrong / event type unregistered | Compare env, dashboard URL + subscribed events; a 400 signature failure is permanent (Stripe won't retry) |
| Webhook 200 but tier never updates | Payload missing `restaurantId`/`subscriptionId` metadata, or price-id mismatch | Look for `[billing] ... ignored: missing metadata` / `matches no configured tier` in logs/Sentry; check `subscriptions.stripePriceId` vs `STRIPE_PRICE_ID_*` env |
| Chat 503 | Missing `GEMINI_API_KEY` | Set env on both units |
| Chat 429 | Rate limit (user RPM) | Wait; check `checkRateLimit` key scope (#440) |
| Billing tier wrong after upgrade | Out-of-order webhook or unknown price id | Check the `stripe-webhook` scope in `idempotency_keys` + `lastEventAt` guard; unknown → loud log (intended) |
| Prices page redirects `?upgrade=prices` | `supplierScores` feature missing | Expected gating — upgrade tier |
| Budget alert missing | Dedup per category+level+month; threshold changed | Confirmed alert already exists for the month? Threshold setting |
| WhatsApp silent | Number health RED/YELLOW, verify token, HMAC secret in prod | `/admin` health; env; Meta dashboard |
| `pnpm test` DB suites skip | No local Postgres / remote host blocked | Set `DATABASE_TEST_URL`; or `ALLOW_REMOTE_DB_TESTS=1` (dev) |
| Analytics stale | MV nightly refresh missed (worker cron) | Re-run `refresh_analytics_rollups()`; confirm worker up |
| Login loop with Google | `AUTH_SECRET` changed / callback URL mismatch | Keep secret stable; check OAuth callback config |
| Slow page load | Missing index on `(rid, status, created_at)`-style queries | Add index (ADR-003 migration) |

## Diagnostic queries

```sql
select status, count(*) from batch_items group by status;
select name, count(*) from pgboss.job group by name;
select notificationType, status, count(*) from system_notifications group by 1,2;
select scope, count(*) from idempotency_keys where claimed_at > now() - interval '1 day' group by scope;
select * from mrr_snapshots order by month desc limit 6;
```

## Golden rules

- **Read source before believing any doc.** Docs can drift; the `## Code notes` sections +
  code are the map.
- Never bypass a guard (signature, scope, dedup, content-hash) to "unblock".
- `sql<number>` aggregates are strings — wrap in `Number(...)`.
- When in doubt, check the dedup/idempotency tables first — most "duplicated
  X" reports are actually replay, not double-write.
