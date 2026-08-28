# Orchestrator backlog state — mise-en-place-sk

Maintained by the autonomous issue orchestrator. Statuses: PENDING | IN_PROGRESS | DONE | BLOCKED | OBSOLETE | DEFERRED.
Baseline (main @ 71034ef): 1854 tests pass, 305 skipped. Open PRs: #723 (escandallo engine, unmerged), #625 (draft MVP, do-not-merge).

DEFERRED = not actionable right now (e.g. targets PR #723's unmerged branch); re-check when the blocker clears.

MERGE HAZARD: PR #748 adds migration drizzle/0045_graceful_virginia_dare.sql; this branch adds 0045_whatsapp_pairing_invite_phone.sql + 0046_system_notifications_payload_jsonb.sql. Whichever merges second must renumber its migrations and reconcile drizzle/meta/_journal.json before merging.

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
| 502 | P2 | DONE | 1 | Verified (commit 2a81ceb): setWhere ordering predicate + side effects gated on returning(); stale-event test proven failing pre-fix. Full DB-backed suite 2179/2179 (worker stood up local Postgres — now available for later cycles). | checkout.session.completed out-of-order guard |
| 495 | P2 | DONE | 1 | Verified (commit 912cf2f): positive-int validation + unconditional predicate; bypass proven pre-fix. 2183/2183. | optimistic locking bypass via non-numeric version |
| 499 | P2 | DONE | 1 | Verified (commit fd0d9ad): requireOwner + advisory-lock txn + BILLING_PARENT-scoped count; parallel-at-limit test. 2188/2188. | addLocation TOCTOU + owner check |
| 496 | P2 | DONE | 1 | Verified (commit fb0f33c): saveEmail rate-limited (user+address), resend gated on existing unverified account, neutral signup response + unverified reclaim. 2199/2199. Residual: timing side-channel (pre-existing pattern), per-address cap on signUp not added. | unrate-limited mail primitives + user enumeration |
| 498 | P2 | DONE | 1 | Verified (commit d85b253): binding only via redeemPairingCode (targeted invites, migration 0045), generic taken responses, audited owner/admin release, ADR-019 updated. 2214/2214. | WhatsApp numbers globally unique across tenants |
| 500 | P2 | DONE | 1 | Verified (commit d612085): option B — compose no longer sets ADDRESS_HEADER/XFF_DEPTH, docs updated, tested boot warning for set-without-known-proxy. 2218/2218. | X-Forwarded-For trust + published :3000 |
| 494 | P2 | DONE | 1 | Core bug already fixed by 1187278; acceptance tests added (commit 827a998), bug re-proven by revert. 2223/2223. Operational note: run pnpm db:backfill-content-hash in prod if not done when 1187278 shipped. | contentHash misaligned line arrays |
| 493 | P2 | DONE | 1 | Verified (commit b3412ca): 5/min rate limit, EXPORT_ROW_CAP(10k)+1 truncation marker, 400 on bad supplier_id/dates. 2234/2234. | Excel export unbounded |
| 492 | P2 | DONE | 1 | Verified (commit db92e3d): re-auth (password/typed fallback), single txn incl. users row, post-commit account-cleanup pg-boss job w/ dead-letter. 2248/2248. Residual: enqueue-failure only logged+Sentry. | account deletion non-atomic |
| 491 | P2 | DONE | 1 | Verified (commit 08deaf2): public status-only 200/503 + per-IP rate limit; detail behind isAdminUser or X-Health-Token. 2258/2258. Note: external monitors parsing old JSON need HEALTH_CHECK_TOKEN. | /api/health public + leaks detail |
| 490 | P2 | DONE | 1 | Verified (commit 39228ec): hooks-level tenant gate via route.id — 409 JSON for (app)/api/*, 303 /onboarding for pages; route-tree-walking tests. 2266/2266. | locals.restaurantId! opaque 500 on API routes |
| 489 | P2 | DONE | 1 | Verified (commit 1ea714f): 11→6 queries, sargable month filter (EXPLAIN: idx bitmap scan, ~25x), merged settings/badges, explicit columns. 2282/2282. | layout runs 13 queries per navigation |
| 501 | P2 | DONE | 1 | Verified (commit 05fdd46): in-memory waiters share SLOT_MAX_WAIT_MS, timed-out release is a no-op (no leak/double-grant), semaphore counts in health detail. 2285/2285. | extraction semaphore no timeout |
| 497 | P2 | DONE | 1 | Verified (commit d927fa8): payload → jsonb (migration 0046, USING cast), all casts/parses removed, partial index for layout level filter. 2274/2274. | system_notifications.payload text ::json |
| 466 | P2 | DONE | 1 | Verified (commit eb020bd): systemInstruction on all 3 extraction paths + XML/Gemini sanitation seam (length caps, control-char/newline normalization). 2298/2298. | move EXTRACTION_PROMPT to systemInstruction |
| 465 | P2 | DONE | 1 | Verified (commit 759b8d2): kit ^2.70.3, overrides fixed (fast-uri/brace-expansion) + nanoid added; puppeteer already gone (64fbe26). pnpm audit: 0 findings. 2298/2298. | bump @sveltejs/kit ReDoS + overrides + puppeteer |
| 426 | P2 | DONE | 1 | Verified (commit c6d7f7a): both via createGeminiProvider + recordLlmUsage ('chat'/'weekly-digest'), logging only, ADR-007/018 updated. 2306/2306. | chat/digest bypass LLM provider seam |
| 540 | P2 | DONE | 1 | Already fixed on main (ea1c329, pre-dates this session); verified against acceptance criteria + tests; GitHub issue closed with explanation. | extraction spinner runs forever when worker down |
| 539 | P2 | DONE | 1 | Verified (commit e3723c7): spend+dashboard get out-of-range states w/ count + widen action; /analytics/extraction verified already correct (unwindowed MV). 2315/2315. | analytics says "no data" to users with invoices |
| 537 | P2 | DONE | 1 | Verified (commit f4878ff): labels/aria on all batch fields, th scope, sr-only h2s; live Playwright audit clean both viewports; AST regression test. 2322/2322. Global icon buttons were already labeled (#460). | a11y: 33/36 batch review fields unnamed |
| 533 | P2 | DONE | 1 | Already satisfied on main (e6c10d0 + a735941): keys present, lint:i18n key-resolution pass with deliberate-miss proof. GitHub issue closed with explanation. | missing $t() keys render raw |
| 532 | P2 | DONE | 1 | Fixed incidentally by #489's layout rewrite (1ea714f): all COUNTs ::int + Number(), strict-equality DB tests pin the type. Close GitHub issue when branch merges. | nav renders literal "0" badge |
| 511 | P2 | DEFERRED | 0 | Likely moot under #746 review-state reframe (PR #748); recheck after merge | three conflicting InvoiceStatus vocabularies |
| 520 | P2 | DONE | 1 | Verified (commit 42dfafc): 6/7 acceptance items already covered by intervening work (evidence per item); dead extraction retry policy fixed via perJobResults wiring. 2327/2327. | tenant-isolation tests cover load() only; silent skips |
| 518 | P2 | DONE | 1 | Already solved on main (542ebc6 + ADR-025, full dispatcher); added missing concurrency-proof test (4c5b269). GitHub issue closed. 2328/2328. | scheduled jobs iterate all tenants sequentially |
| 517 | P2 | DONE | 1 | Verified (commit c1e9b7c): action-authz lint gate (49 actions audited, 2 honest escape comments, CI-wired), ADR-001 amended. 2327/2327. | tenant-scoping lint for form actions |
| 570 | P2 | DONE | 1 | Verified working (supplier inline via extraction; product via pg-boss categorize job); trigger-chain test added (99a172c); GitHub issue closed with architecture answers. 2331/2331. | verify auto-classifier status |
| 567 | P2 | DONE | 1 | Verified (commit 8111b97): shell pre-existed (#572); added settings persistence (merged query + /api/sidebar), collapsed badges, collapsed footer, spec'd icons+aria. 2338/2338. | collapsible sidebar |
| 736 | P2 | DEFERRED | 0 | PR #723 branch | escandallo reads load tenant graph too often |
| 733 | P2 | DEFERRED | 0 | PR #723 branch | updateRecipe drops unparseable fields; rename race |
| 732 | P2 | DEFERRED | 0 | PR #723 branch | add-a-line row keeps submitted values |
| 731 | P2 | DEFERRED | 0 | PR #723 branch | printed escandallo repeats prep block |
| 730 | P2 | DEFERRED | 0 | Verify: may be main's products module | no-allergens save blocks extraction |
| 747 | P3 | PENDING | 0 | Bundle of 10 small findings; overlaps PR #748 surfaces — wait for its merge | beta-review polish bundle |
| 720 | P3 | DONE | 1 | Verified (commit 32aec64): slate acc-soft alpha 0.16→0.10, 4.18→4.58:1; ADR-026 amended w/ on-tint table; contrast test harness added. Note: slate accent is inert (all routes use tinta/ADR-028). 2344/2344. | active nav rows below AA in dark |
| 749 | P3 | DONE | 1 | Verified (commit 57b2d3e): neg-soft dark 0.18→0.12 (4.57:1), caution-soft light 0.14→0.11 (4.53:1); full usage sweep, assertions upgraded, ADR amended. 2349/2349. Close GitHub issue when branch merges. | severity tokens below AA on own tints |
| 719 | P3 | DONE | 1 | Verified (commit 18152ac): fg-4→fg-3 (3.92→5.21:1 dark), pinning tests. 2347/2347. Noted: location-switcher locked items still fg-4 (separate component). | locale hint below AA in dark |
| 718 | P3 | DONE | 1 | Verified (commit ba89db6): #711's rebase had reintroduced the accent chip in the dialog — now neutral, guard test added. 2352/2352. Note: help-page .help-tip-pro still accent (predates scope; fold into #569's help work). | one neutral PRO chip (ADR-026) |
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
| 510 | P3 | DONE | 1 | Verified (commit 1c19fc2): IP-first sort + short-circuit, accurate scope attribution. 2354/2354. | rate-limit buckets consumed after failure |
| 509 | P3 | PENDING | 0 | | auth-seed prod guard swallowed |
| 508 | P3 | PENDING | 0 | Also cover: computeFormContentHash uses toMoneyString(raw) vs inserted toMoneyString(toFloat(raw)) — diverges on comma-decimal input (found during #494) | toFloat accepts "12abc"/"1e999" |
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
