# Orchestrator backlog state — mise-en-place-sk

Maintained by the autonomous issue orchestrator. Statuses: PENDING | IN_PROGRESS | DONE | BLOCKED | OBSOLETE | DEFERRED.
Baseline (main @ 71034ef): 1854 tests pass, 305 skipped. Open PRs: #723 (escandallo engine, unmerged), #625 (draft MVP, do-not-merge).

DEFERRED = not actionable right now (e.g. targets PR #723's unmerged branch); re-check when the blocker clears.

## Queue (work top-down within each tier)

| # | Pri | Status | Att | Last result / notes | Title (short) |
|---|-----|--------|-----|---------------------|---------------|
| 463 | P0 | BLOCKED | 0 | Requires human: rotate PAT on owner's local Windows machine (~/.claude/settings.json). Not reachable from CI/cloud. | rotate GitHub PAT in plaintext |
| 486 | P1 | DONE | 1 | Verified: fail-closed + auth-seed trial row + nightly orphan reconciliation (commit 6265af2); 1860 tests pass, svelte-check clean. Known edge: repair path grants non-founder trial length. | getAccessState fails open w/o subscription row |
| 743 | P1 | OBSOLETE | 0 | Closed 2026-08-27 via PR #748 (another session) | unverified email shows wrong login error |
| 742 | P1 | OBSOLETE | 0 | Closed 2026-08-27 via PR #748 | CSP img-src missing blob: blocks camera preview |
| 484 | P1 | DONE | 1 | Verified (commit 29498ff): client pre-upload HEIC rejection w/ iOS guidance, WhatsApp heic/heif no longer saved as .jpg (both drivers); allowlist parity test pre-existed via #520. 1872 tests pass. | .heic accepted by picker, rejected by server |
| 464 | P1 | PENDING | 0 | Infra-heavy (Postgres roles); needs care | split Postgres superuser into runtime+migration roles |
| 649 | P1 | PENDING | 0 | Large tracker issue; treat as umbrella | mobile 390px audit tracker |
| 729 | P1 | DEFERRED | 0 | Escandallo code only on PR #723 branch | recipe name unescaped in emailed escandallo |
| 728 | P1 | DEFERRED | 0 | PR #723 branch | sub-recipe nutrition scales on gross not net |
| 727 | P1 | DEFERRED | 0 | PR #723 branch | MAX_RECIPE_DEPTH understates cost, poisons memo |
| 745 | P2 | OBSOLETE | 0 | Closed 2026-08-27 via PR #748 | trial expiry invisible, upload loses files |
| 744 | P2 | OBSOLETE | 0 | Closed 2026-08-27 via PR #748 | /pending queue position 0 (ms vs µs truncation) |
| 746 | P2 | OBSOLETE | 0 | Closed 2026-08-27 via PR #748 | replace payment lifecycle with review states |
| 502 | P2 | PENDING | 0 | | checkout.session.completed out-of-order guard |
| 495 | P2 | PENDING | 0 | | optimistic locking bypass via non-numeric version |
| 499 | P2 | PENDING | 0 | | addLocation TOCTOU + owner check |
| 496 | P2 | PENDING | 0 | | unrate-limited mail primitives + user enumeration |
| 498 | P2 | PENDING | 0 | | WhatsApp numbers globally unique across tenants |
| 500 | P2 | PENDING | 0 | | X-Forwarded-For trust + published :3000 |
| 494 | P2 | PENDING | 0 | | contentHash misaligned line arrays |
| 493 | P2 | PENDING | 0 | | Excel export unbounded |
| 492 | P2 | PENDING | 0 | | account deletion non-atomic |
| 491 | P2 | PENDING | 0 | | /api/health public + leaks detail |
| 490 | P2 | PENDING | 0 | | locals.restaurantId! opaque 500 on API routes |
| 489 | P2 | PENDING | 0 | | layout runs 13 queries per navigation |
| 501 | P2 | PENDING | 0 | | extraction semaphore no timeout |
| 497 | P2 | PENDING | 0 | | system_notifications.payload text ::json |
| 466 | P2 | PENDING | 0 | | move EXTRACTION_PROMPT to systemInstruction |
| 465 | P2 | PENDING | 0 | | bump @sveltejs/kit ReDoS + overrides + puppeteer |
| 426 | P2 | PENDING | 0 | | chat/digest bypass LLM provider seam |
| 540 | P2 | PENDING | 0 | | extraction spinner runs forever when worker down |
| 539 | P2 | PENDING | 0 | | analytics says "no data" to users with invoices |
| 537 | P2 | PENDING | 0 | | a11y: 33/36 batch review fields unnamed |
| 533 | P2 | PENDING | 0 | | missing $t() keys render raw |
| 532 | P2 | PENDING | 0 | | nav renders literal "0" badge |
| 511 | P2 | DEFERRED | 0 | Likely moot under #746 review-state reframe (PR #748); recheck after merge | three conflicting InvoiceStatus vocabularies |
| 520 | P2 | PENDING | 0 | | tenant-isolation tests cover load() only; silent skips |
| 518 | P2 | PENDING | 0 | | scheduled jobs iterate all tenants sequentially |
| 517 | P2 | PENDING | 0 | | tenant-scoping lint for form actions |
| 570 | P2 | PENDING | 0 | | verify auto-classifier status |
| 567 | P2 | PENDING | 0 | Feature, sizeable | collapsible sidebar |
| 736 | P2 | DEFERRED | 0 | PR #723 branch | escandallo reads load tenant graph too often |
| 733 | P2 | DEFERRED | 0 | PR #723 branch | updateRecipe drops unparseable fields; rename race |
| 732 | P2 | DEFERRED | 0 | PR #723 branch | add-a-line row keeps submitted values |
| 731 | P2 | DEFERRED | 0 | PR #723 branch | printed escandallo repeats prep block |
| 730 | P2 | DEFERRED | 0 | Verify: may be main's products module | no-allergens save blocks extraction |
| 747 | P3 | PENDING | 0 | Bundle of 10 small findings; overlaps PR #748 surfaces — wait for its merge | beta-review polish bundle |
| 720 | P3 | PENDING | 0 | | active nav rows below AA in dark |
| 719 | P3 | PENDING | 0 | | locale hint below AA in dark |
| 718 | P3 | PENDING | 0 | | one neutral PRO chip (ADR-026) |
| 738 | P3 | DEFERRED | 0 | PR #723 branch | escandallo number parsing zero/out-of-range |
| 737 | P3 | DEFERRED | 0 | PR #723 branch | recipe module dead exports/dup waste factor |
| 735 | P3 | DEFERRED | 0 | PR #723 branch | duplicate escandallo 409s second time |
| 734 | P3 | DEFERRED | 0 | PR #723 branch | itemId=0 passes validation |
| 543 | P3 | PENDING | 0 | | /admin pages render empty landmark |
| 542 | P3 | PENDING | 0 | | malformed /invoice/[id] 500s |
| 541 | P3 | PENDING | 0 | | upload silently discards rejected files |
| 546 | P3 | PENDING | 0 | | tier gating inconsistent 402 vs redirect |
| 538 | P3 | PENDING | 0 | | coach mark swallows first click; modal roles |
| 536 | P3 | PENDING | 0 | | notification shows raw enum |
| 535 | P3 | PENDING | 0 | | number formatting hardcoded es-ES |
| 534 | P3 | PENDING | 0 | | language switch misses period labels |
| 515 | P3 | PENDING | 0 | | restaurant name two sources of truth |
| 514 | P3 | PENDING | 0 | | dead code + schema hygiene |
| 512 | P3 | DEFERRED | 0 | Likely moot under #746 reframe (PR #748); recheck after merge | "Vencidas" filter always empty |
| 510 | P3 | PENDING | 0 | | rate-limit buckets consumed after failure |
| 509 | P3 | PENDING | 0 | | auth-seed prod guard swallowed |
| 508 | P3 | PENDING | 0 | | toFloat accepts "12abc"/"1e999" |
| 507 | P3 | PENDING | 0 | | IndexedDB keeps invoice files indefinitely |
| 506 | P3 | PENDING | 0 | | Sentry API URL hardcoded EU |
| 505 | P3 | PENDING | 0 | | WhatsApp token host allowlist |
| 504 | P3 | PENDING | 0 | | Content-Disposition unescaped |
| 503 | P3 | PENDING | 0 | | consumeVerificationToken not atomic |
| 470 | P3 | PENDING | 0 | | Sentry scrubber coverage |
| 469 | P3 | PENDING | 0 | | scope confirm/extract loaders to restaurantId |
| 468 | P3 | PENDING | 0 | | LocalDriver.save path containment |
| 467 | P3 | PENDING | 0 | | chat ACTIONS href allowlist |
| 574 | P3 | PENDING | 0 | | highlight Category field on Clasificar |
| 571 | P3 | PENDING | 0 | | unify logo usage |
| 569 | P3 | PENDING | 0 | | help page docs/tips |
| 568 | P3 | PENDING | 0 | | supplier products hover |
| 524 | P3 | PENDING | 0 | | sql template numeric return types |
| 523 | P3 | PENDING | 0 | Infra/env change | DATABASE_SSL_MODE verify-full |
| 740 | P3 | PENDING | 0 | Deadline 2026-12-01; infra | Railway config-as-code → IaC |
| 565 | P3 | DEFERRED | 0 | #746 says it resolves this question; recheck after PR #748 merges | pagada/no pagada as desvío |
| 564 | P3 | PENDING | 0 | Product question (INC-002) | stock forecast has no data basis |
| 563 | P3 | PENDING | 0 | Legal/date question (INC-001) | B2B e-invoice date unconfirmed |
| 441 | P3 | PENDING | 0 | | retire legacy redirect stubs |
| 440 | P3 | PENDING | 0 | | rate-limit key mixing rule |
| 439 | P3 | PENDING | 0 | | waitlist hardcodes prices |
| 408 | P3 | PENDING | 0 | Question issue | legal-page copy into i18n |
| 407 | P3 | PENDING | 0 | | waitlist copy into i18n table |
| 406 | P3 | PENDING | 0 | Question/copy audit | hero micro-copy audit |
| 405 | P3 | PENDING | 0 | Copy/content | testimonial venue-type context |
| 404 | P3 | PENDING | 0 | Copy/content | trust/support bar |
| 403 | P3 | PENDING | 0 | Copy/content | founders incentive section |
| 402 | P3 | PENDING | 0 | Copy/content | sin vs con comparison |
| 390 | P3 | PENDING | 0 | | shared GDPR traversal for export/delete |
| 356 | P3 | PENDING | 0 | Depends on #354 decision | gate e-invoicing behind flag |
| 354 | P3 | PENDING | 0 | Decision issue | feature-flag mechanism decision |
| 333 | P3 | PENDING | 0 | | testimonial provenance + stale date |
| 329 | P3 | PENDING | 0 | | digest share affordance |
| 328 | P3 | PENDING | 0 | | onboarding captures only name |
| 327 | P3 | PENDING | 0 | | landing copy hardcoded |
| 326 | P3 | PENDING | 0 | | no attribution capture |
| 325 | P3 | PENDING | 0 | Tracking umbrella | relevance media flywheel |
| 236 | P3 | PENDING | 0 | Feature, sizeable | email-in invoice ingest |
| 224 | P3 | PENDING | 0 | Infra config | edge DDoS + Upstash config |
| 222 | P3 | PENDING | 0 | Infra/DB heavy | RLS tenant isolation |
| 332 | P4 | DEFERRED | 0 | labeled `future` | waitlist referral loop |
| 331 | P4 | DEFERRED | 0 | labeled `future` | WhatsApp outbound digest |
| 330 | P4 | DEFERRED | 0 | labeled `future` | public price index |
| 25 | P4 | DEFERRED | 0 | labeled `future` | PO workflow |
