# Feature Spec — Supplier Claim Email (issue #887)

## Purpose

When reconciliation finds a real problem with a document — a missing item, a
wrong quantity — offer a one-click way to draft and send a claim email to the
supplier, pre-filled from the already-extracted data and always editable
before sending. Never sent silently, and never offered for an
extraction/read problem (issue #879's `lectura` kind) since there is nothing
for the supplier to fix in that case.

## Actors

- Signed-in member of the active restaurant, from the invoice detail page.

## Preconditions

- An invoice flagged `review_state = 'incidencia'` with `incidence_kind =
  'documento'` (issue #879), and its supplier has a `contact_email`.
- No claim has been sent for this invoice yet.

## Inputs

- `subject`, `body` — the user-edited draft, prefilled from a default
  template built from the extracted supplier/document/line data.

## Outputs

- A `supplier_claim` transactional email to the supplier's contact address.
- An `invoice_audit_log` row (`action = 'claim_email_sent'`) — the send
  receipt and the dedup guard in one.

## Business rules

- **Eligibility** — a single pure function, `claimEligibility(invoice,
  supplier, alreadySentAt)` (`src/lib/server/supplier-claim.ts`), is the only
  place this is decided: `reviewState === 'incidencia' && incidenceKind ===
  'documento' && supplier.contactEmail` truthy, and no prior
  `claim_email_sent` row. The load function and the `requestCorrection` action
  both call it — there is no second copy of the rule.
- **Default draft**: `defaultClaimDraft(...)` renders `inv.claim.template.subject`
  / `inv.claim.template.body` (`src/lib/i18n-messages.ts` `renderTemplate`,
  locale from `locals.locale`, falling back to `es`) with `{supplier}`,
  `{restaurant}`, `{document}`, `{date}`, `{lines}` vars. `{lines}` is built
  from a pending `system_notifications` row of type `line_item_mismatch` for
  the same invoice, if one exists (payload `missingInInvoice` /
  `quantityMismatches` — issue #886, read opportunistically and tolerantly:
  `parseMismatchPayload` drops anything malformed rather than throwing).
  Without that row the body just names the document — there is nothing more
  specific to say. Per-line phrasing (`Falta en el albarán (…)`, `Cantidad
  distinta — …`) is itself templated per locale
  (`inv.claim.template.lineMissing(NoQty)`/`lineMismatch`/`noLines`), so an
  English-locale user gets a fully English draft, not a Spanish body with
  English boilerplate around it.
- **Never sent silently**: the draft only ever prefills a form; sending is one
  explicit submit of `?/requestCorrection`. The route never calls `sendEmail`
  from a load function or a background job for this feature.
- **Dedup / audit**: `invoiceAuditLog` is reused (no new table) with `action:
  'claim_email_sent'`, `reason` = the sent subject, `snapshot` = `{ to,
  subject, body }`. `requestCorrection` takes a Postgres advisory
  transaction lock (`pg_advisory_xact_lock(hashtext('claim:<rid>:<id>'))` —
  the same pattern as `billing.ts`/`llm-quota.ts`/`onboarding`) and, while
  still holding it, re-checks for an existing row, awaits `sendEmail`, and
  only then inserts the audit row — all inside the one transaction. Two
  concurrent submits still cannot both pass the check (the lock is held for
  the whole operation, not released after the check), so the second always
  gets `fail(409, { claim: 'alreadySent' })`; and because the insert comes
  *after* the send, a transport exception rolls the transaction back with no
  audit row written, so `fail(502, { claim: 'sendFailed' })` is genuinely
  retriable rather than leaving a false "already sent" that blocks the
  invoice forever.
- **Rate limit**: `rateLimitScoped({ scope: 'tenant', name: 'invoice-claim',
  max: 20 })`, same shape as `invoice-relink`.
- **Email**: `supplierClaimEmail(...)` (`src/lib/server/email.ts`) adds
  `EmailKind = 'supplier_claim'` and builds the HTML with the existing
  `renderEmailLayout`/`dataTable`/`callout` helpers — no new email
  infrastructure. The user-edited body is HTML-escaped and rendered with
  `\n` → `<br>` (a local `preserveLineBreaks`, escape-then-substitute so no
  markup can be injected through the textarea) before being wrapped in a
  paragraph; any parsed missing/mismatch lines also render as a small table
  for context.
- **UI** (ADR-020, both viewports): `invoice/[id]/+page.svelte` and
  `MobileInvoiceDetail.svelte` show a "Reclamar al proveedor" button when
  `claim.eligible && !claim.sentAt`; clicking reveals the inline form
  (recipient read-only, subject + body editable, a hint that nothing sends
  until submit, submit + cancel). Once sent, a compact "Reclamación enviada
  el {date}" line replaces it. No inline `style=`; layout and color come from
  Tailwind utilities generated off the `--mep-*` tokens (`app.css`'s `@theme`
  block), type sizes from the existing `.label`/`.body`/`.body-strong`
  classes only; the mobile buttons and inputs carry `min-h-11` (44px) for the
  tap-target rule.
- **i18n**: namespace `inv.claim.*` in both `src/lib/messages/es.ts` (first)
  and `en.ts` — button/form labels/hint/sent line, errors
  (`alreadySent`/`notEligible`/`invalid`/`sendFailed`), and the template keys.

## Code notes

### `src/lib/server/supplier-claim.ts`

**`claimEligibility`**

- The one gate. `alreadySentAt` is a parameter rather than a DB read inside
  the function so it stays pure and unit-testable without fixtures; both call
  sites pass in whatever they already looked up.

**`buildClaimLines` / `formatClaimLinesText`**

- Two steps on purpose: `buildClaimLines` turns the raw mismatch payload into
  `{description, detail}` pairs (also handed to `supplierClaimEmail` for its
  table), and `formatClaimLinesText` turns those into the bulleted `{lines}`
  text for the template body. Splitting them means the email's table and the
  draft's plain-text body never drift from the same source data.

**`formatClaimDate`**

- Reuses `toIntlLocale` from `src/lib/formatters.ts` rather than naming
  `es-ES`/`en-GB` itself (`tests/formatters.test.ts` enforces that only
  `formatters.ts` may hardcode those Intl locale tags) — `es` renders
  `es-ES`, `en` renders `en-GB` (`dd/mm/yyyy` either way, deliberately not
  `en-US`, so the date reads unambiguously regardless of which locale
  rendered it).

**`parseMismatchPayload`**

- Defensive by construction: `system_notifications.payload` is untyped
  `jsonb`, and issue #886 (the producer) is not merged on this branch, so a
  malformed or absent payload degrades to empty arrays rather than throwing.

### `src/routes/(app)/invoice/[id]/+page.server.ts`

**`requestCorrection`**

- Reads the invoice + supplier tenant-scoped, checks `claimEligibility`, then
  opens one transaction that takes the advisory lock, re-checks for an
  existing `claim_email_sent` row, sends the email, and only then inserts the
  row — all inside the same transaction/lock. See "Dedup / audit" above for
  why the send precedes the insert.
- `pendingMismatchPayload`/`latestClaimSentAt` are shared between `load` and
  the action so the eligibility/prefill data the user saw and the data the
  action re-derives never diverge.

### `src/lib/server/email.ts`

**`supplierClaimEmail`**

- The only email builder whose body text is user-authored freeform prose
  rather than a fixed template — hence the explicit `preserveLineBreaks`
  (escape first, then substitute `\n`, so escaping can't be bypassed by
  crafting `\n` sequences).
