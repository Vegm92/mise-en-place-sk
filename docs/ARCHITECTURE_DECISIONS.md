# Architecture Decisions — moved to `doc/`

ADRs now live in [`doc/`](../doc/README.md), one file per decision, grouped into
a folder per feature area. This file is a redirect; nothing new is added here.

ADR numbers are unchanged, so any existing reference to "ADR-001" still resolves
to the same decision.

| ADR | New location |
|---|---|
| ADR-001 — Tenant isolation: app-level scoping | [`doc/tenancy/ADR-001-app-level-tenant-scoping.md`](../doc/tenancy/ADR-001-app-level-tenant-scoping.md) |
| ADR-002 — Durable extraction pipeline | [`doc/ingestion/ADR-002-durable-extraction-pipeline.md`](../doc/ingestion/ADR-002-durable-extraction-pipeline.md) |
| ADR-003 — Committed migrations are canonical | [`doc/data/ADR-003-committed-migrations-are-canonical.md`](../doc/data/ADR-003-committed-migrations-are-canonical.md) |
| ADR-004 — WhatsApp converges on the batch pipeline | [`doc/whatsapp/ADR-004-whatsapp-converges-on-batch-pipeline.md`](../doc/whatsapp/ADR-004-whatsapp-converges-on-batch-pipeline.md) |
| ADR-005 — Railway Postgres: RLS retired | [`doc/tenancy/ADR-005-rls-retired.md`](../doc/tenancy/ADR-005-rls-retired.md) |

ADR-006 onwards were written directly in `doc/` and were never part of this file.
See the [index](../doc/README.md) for the full list.
