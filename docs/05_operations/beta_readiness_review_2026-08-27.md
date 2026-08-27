# Beta-readiness review — 2026-08-27

Hands-on QA pass over the full running app (local Postgres, seeded data, Playwright at 390×844 and 1280×800, es-ES). Every public, authenticated, Pro and admin surface was driven in a real browser; 157 screenshots captured. Verdict: **go for private beta after the two High fixes below.**

## Product alignment (founder direction, 27 Aug): drop the payment model

The app tracks albaranes, productos y proveedores — not payments. States must be **revisado · por revisar · con incidencias**, but a payment lifecycle (`invoices.status = 'pending'|'paid'` + `due_date`) is woven through the UI:

- `/invoices` KPI tiles "PENDIENTE € / VENCIDAS / PAGADAS" (`inv.kpi.*`) → Revisados / Por revisar / Con incidencias.
- The "Por revisar" status chip everywhere is driven by `status='pending'` (= unpaid) — the double meaning behind the dashboard-ribbon confusion below.
- Mark-paid actions: `?/markPaid` (`invoices/+page.server.ts:196`, `reminders/+page.server.ts:86`), bulk "Marcar todas pagadas", mobile alerts "Marcar como pagada" → replace with review/incidence actions.
- Dashboard "SALE DE CAJA · 14 D", "POR REVISAR €", turno "{n} albaranes vencidos sin pagar" (`turno.due.*`) → review-state tiles; keep the spend-pace tiles.
- `/reminders` is a payment-due page → refocus on incidencias (duplicados, descuadres, sin clasificar, extracciones fallidas).
- Alert pref + worker email "albaranes vencidos sin pagar" (`invoice_reminders`) → retire or make an incidencias digest.
- Excel export "Estado" column exports payment status (`export/download/+server.ts:67`) → review state.
- Smaller echoes: chat chip "¿Qué albaranes están vencidos?", supplier "Pendiente €" stat, report "lo que vence", `help.tip.reminders.body`.

Data model: `batch_items.review_status` exists unused; map *revisado* on confirm, *incidencia* when a save carries duplicate/total-mismatch/low-confidence/conversion warnings (already in `system_notifications`), *por revisar* otherwise. Keep `due_date` as data, stop building UX on it.

**"Factura" leaks in ES copy** (should say albarán): `login.aside.title` ("Tus facturas ya están leídas"), WhatsApp notifs (`notif.msg.whatsapp*`, `notif.openBatch` "Abrir factura"), `set.alertPrefs.type.invoice_reminders` ("Recordatorios de facturas"), `inv.trend.title` ("Evolución de facturas"), `turno.missing.*` ("no factura desde hace…" → "no trae albaranes desde…"). The document-type badge (`field.documentType.factura`) is semantically correct — founder call. Suggest extending `lint:i18n` to flag "factura" in new ES strings.

## High — fix before the first tester

1. **Camera photo preview is blocked by the app's own CSP.**
   `Tomar foto` previews the capture via `URL.createObjectURL`, but CSP is `img-src 'self' data:` — no `blob:` — so the browser refuses the preview image (`Refused to load the image 'blob:…'`). Mobile camera capture is the primary upload path.
   Fix: `svelte.config.js:24` → `'img-src': ['self', 'data:', 'blob:']`.

2. **Correct password + unverified email → "Email o contraseña incorrectos".**
   `src/lib/server/auth-credentials.ts:11` returns `null` for unverified users, which Auth.js reports as wrong credentials. Reproduced E2E: sign up, skip the email, log in — the app claims the password is wrong. Testers whose verification email lands in spam get locked out with no hint.
   Fix: detect valid-password-but-unverified and show a distinct `/login` error with a resend-verification action.

## Medium

3. **`/chat` Pro gate dead-ends on a raw English 403.** `/reports`, `/digest`, `/analytics/prices` redirect to `/billing?upgrade=…`; `/chat` goes through `requireFeature()` (`src/lib/server/billing.ts:323`) and throws the untranslated "This feature requires a higher plan tier" with no upgrade CTA. Fix: redirect page loads to `/billing?upgrade=chat`; keep 403 for APIs but i18n the message.

4. **Help promises HEIC; the app rejects it.** Help says "PDF, JPG, PNG, HEIC y XML"; `SUPPORTED_UPLOAD_EXTENSIONS` (`src/lib/upload-formats.ts:1`) has no `.heic`. iPhone camera-roll photos are HEIC by default. The dropzone hint is a third list ("PDF, JPG, PNG"). Fix: support HEIC (best) or align all copy with the real list.

5. **`/pending` queue position shows 0.** Postgres stores `created_at` with microseconds; Drizzle returns ms-truncated `Date`, so `lte(users.createdAt, me.createdAt)` misses the user's own row (`src/routes/pending/+page.server.ts`). First waiting users see "0 EN LA COLA · de 1 en espera". Fix: count `lt(...)` and add 1.

6a. **Dashboard mislabels unpaid invoices as "sin confirmar".** The "POR REVISAR" ribbon counts `status='pending'` (unpaid) invoices but labels them `turno.ribbon.reviewNote` ("N albaranes sin confirmar") — right after the user confirmed them in review. Fix: payment wording ("pendientes de pago") or count actual unreviewed items.

7. **Save-success toast dumps raw event identifiers.** After saving an invoice, the `/invoices` toast shows chips reading literally `invoice_saved`, `invoice_corrected`, `supplier_uncategorized: <name>`. The loader (`src/routes/(app)/invoices/+page.server.ts:122`) selects every `system_notifications.message` for the saved invoice — including internal audit events — and `message` stores the raw type string. Fix: filter to user-facing alert types and map `notification_type` through i18n.

## Low / polish

- CSV export: client-side `SvelteKitError: Not found: /invoices/export/download` in console (add `data-sveltekit-reload`); delivered file is `.xlsx` — align copy.
- 404 page heading "Not Found" untranslated.
- Failed-extraction view: sticky header names the first (confirmed) file while the error card names the failed one.
- Sidebar logout/switch-account: ~13px icon-only buttons, `title` only — add `aria-label`, grow tap targets.
- `/invoices/export` native date inputs showed `mm/dd/yyyy` under es-ES in headless Chromium — verify on real devices.
- Budgets sum net line totals (525,17 €) while the dashboard ribbon sums gross (609,90 €) — unlabeled basis mismatch; add "(sin IVA)"/"(con IVA)".
- Reminders page with nothing due shows only classification nudges — add an empty state for the payments section.
- `verification_tokens.token` stores the raw secret (1 h TTL) — store a sha256 hash and compare on consume.
- Desktop invoice list rows render `123.40 EUR` and ISO dates (`2026-09-24`) where mobile and the KPI tiles show `123,40 €` / `24 sept`; supplier names truncate to "Verdu…" despite ample width.
- "Descargar PDF" on an XML e-invoice downloads the original `.xml` — label it "Descargar original" or derive from file type.
- Invoice preview pane titles the document with its raw storage hash and shows an empty box for XML — show the display name and a "sin vista previa" note.

## Verified working

- Review UX: per-field confidence, totals-reconcile check, suggested-due-date labeling, low-confidence ack modal, guided tour.
- Auth boundaries: anonymous 303→login / 401 on APIs; non-admin bounced from all 7 `/admin` routes; cross-tenant IDs 404; reset + verify-email E2E with anti-enumeration copy.
- Graceful degradation: dead Gemini key → chat "Algo salió mal" and stays usable; Sentry unconfigured → plain admin notice; worker down → WARN heartbeat, 2-min "slow" notice, 15-min hard fail with retry/discard.
- i18n & layout: full ES/EN coverage (two leaks noted above), zero horizontal overflow on 17 routes × 2 viewports, complete dark theme.
- Trial/billing: quota chip, trial countdown, per-feature upsells, admin access queue approve flow.

## Verified in second pass (worker running, no Gemini key)

- Facturae 3.2.2 XML e-invoice: upload → pg-boss queue → worker parse (no AI) → review (totals reconcile) → saved invoice, end to end.
- Forced Gemini failure on a PNG: item lands in "Extracción fallida" with retry/discard, dead-letter recorded.
- Duplicate detection: re-uploaded supplier+number shows "Podría ser un duplicado" with a link to the existing invoice.
- Bulk mark-paid / per-row mark-paid exist on the invoices list (row expansion + bulk bar).

## Not covered (needs real credentials/history)

Real Gemini extraction & digest, Google OAuth, Stripe checkout, WhatsApp bot, email delivery, PWA offline queue, price-shock alerts over history, multi-restaurant, rate limits under load. Recommend a staging smoke pass with live keys before invites.
