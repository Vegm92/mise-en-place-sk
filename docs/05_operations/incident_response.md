---
tags: [mep, operations]
related: "[[CONTEXT]]"
---

# Incident Response

A minimal, practical incident flow for this system. Keep it short and data-driven.

## Severity levels

| Severity | Meaning | Example |
|---|---|---|
| SEV-1 | Data integrity / security / total outage | Invoice cross-tenant leak; webhook replay creating duplicates; prod DB down |
| SEV-2 | Major feature degraded | Extraction queue backed up; digest emails not sending; Stripe checkout failing |
| SEV-3 | Minor / watch-item | Unknown price id fallback logs; stale MV for one tenant |

## Response steps

1. **Detect** — Sentry alert, `/admin` health, cron-miss check, or user report.
2. **Assess** — confirm scope (single tenant? all?) and severity. Check the
   dedup/idempotency guards first: `idempotency_keys` (filter by `scope`),
   `contentHash` duplicates.
3. **Contain** — if a retry storm is possible, pause the consumer/webhook
   intake before anything else (webhooks redeliver safely — the dedup tables
   make replay idempotent).
4. **Diagnose** — use `docs/05_operations/troubleshooting.md` matrix; pull the
   relevant queue/job rows and Sentry event; confirm whether the trigger was a
   deployment, a migration, an env change, or an external provider.
5. **Fix** — prefer additive migrations + forward-fixes (never hand-edit prod
   schema); redeploy the app or worker; wait for the retry queue to drain.
6. **Verify** — confirm queues at 0, dedup tables growing (not errors),
   affected tenant data correct.
7. **Debrief** — record in CONTEXT.md audit items / GitHub issue; update the
   affected feature spec or its `## Code notes` section if behaviour was wrong; add a test for
   the failure mode.

## Specific plays

- **Stripe webhook errors**: handler failure deletes the claim →
  `idempotency_keys` shows no `stripe-webhook` row for the event id; Stripe
  retries for 3 days. Confirm the secret is set in prod and the URL + event types are
  correct in the Stripe dashboard.
- **WhatsApp not ingesting**: check `WHATSAPP_*` env, verify token, number
  health in `/admin` (RED/YELLOW), and that the `whatsapp` scope isn't choking
  on an unhandled event shape (always returns 200).
- **Extraction queue backed up**: worker restarting? pg-boss health? batch
  size is 1 by design; check dead-letter growth before blaming load.
- **Digest / cron missed**: verify the worker is running and
  `registerScheduledJobs` didn't throw at startup (ADR-011). A missed run just
  re-claims next time via `claimDigestWeek`.
- **Rate-limit surprise**: in-memory limiter under multi-instance → deploy
  with Upstash Redis configured.

## Communication

- Escalate to the owner; keep the audit item in CONTEXT.md updated; link the
  GitHub issue with repro + timeline.
- Post-incident: verify the final audit checklist (`docs/07_ai/agent_workflow.md`
  steps) still holds.
