---
tags: [mep, audit, pr-review, security, mime-type, webp, upload-endpoint, whatsapp, file-validation]
related: Commit b8efda3, PR #1212, Issue pr_1212_review_issue
---

# Post-Merge Review Report: Commit b8efda3 / Centralize MIME Type Resolution & WhatsApp WebP Media Ingestion

**Reviewed PR / Branch:** `origin/jules/centralize-mime-type-resolution-12887432189583763685`
**Commit Hash:** `b8efda3a550b4242de1f024953a866be55ce143c`
**Subject:** `refactor: centralize MIME type resolution and add WebP to WhatsApp ingestion`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-10-12

---

## 01. Executive Summary

Commit `b8efda3` addresses architectural debt and MIME-type ingestion gaps identified during the post-merge review of PR #1212 (`docs/08_audits/pr_1212_webp_mime_review.md` and `docs/08_audits/pr_1212_review_issue.md`).

Prior to commit `b8efda3`, file serving endpoints (`/invoice/[id]/file` and `/api/upload/[id]/[file]`) defined separate, un-unified extension-to-MIME record objects (`MIME`). Furthermore, external WhatsApp media ingestion (`src/lib/server/whatsapp.ts`) lacked `image/webp` in its `MIME_TO_EXT` record, causing incoming `.webp` image assets from WhatsApp webhooks to fall back to `.jpg` extensions.

Commit `b8efda3` resolved both gaps by:
1. **Centralizing Server-Side MIME Resolution:** Exporting `resolveMimeType(filename: string): string` from `$lib/server/file-validation.ts` and refactoring file serving handlers to import this single-source helper.
2. **Expanding WhatsApp Media Ingestion:** Adding `'image/webp': 'webp'` mapping to `downloadWhatsAppMedia` in `$lib/server/whatsapp.ts`.
3. **Updating Unit Test Suites:** Refactoring `tests/upload-endpoint.test.ts` to test `resolveMimeType` directly and updating `tests/whatsapp-api.test.ts` to assert `image/webp` -> `.webp`.

This report provides a master post-PR review of commit `b8efda3`, evaluating implementation correctness, security alignment, test coverage, and residual operational findings for future engineering sessions.

---

## 02. Technical Analysis of Code Changes

### 1. Centralized Helper (`src/lib/server/file-validation.ts`)

```typescript
const MIME_MAP: Record<string, string> = {
	'.pdf':  'application/pdf',
	'.jpg':  'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png':  'image/png',
	'.webp': 'image/webp',
	'.xml':  'application/xml',
};

export function resolveMimeType(filename: string): string {
	const ext = path.extname(filename).toLowerCase();
	return MIME_MAP[ext] ?? 'application/octet-stream';
}
```

**Key Improvements:**
- Single source of truth for filename-to-MIME lookup across server modules.
- Handles case-insensitivity (`.toLowerCase()`) and returns standard fallback (`application/octet-stream`) for unmapped file extensions.
- Includes `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`, and `.xml`.

### 2. File Serving Endpoints Refactoring
- **Invoice Source File Endpoint (`src/routes/(app)/invoice/[id]/file/+server.ts`):** Removed local `MIME` dictionary and called `resolveMimeType(key)`.
- **Batch Upload Media Endpoint (`src/routes/api/upload/[id]/[file]/+server.ts`):** Removed local `MIME` dictionary and called `resolveMimeType(filename)`.

### 3. WhatsApp Inbound Media Ingestion (`src/lib/server/whatsapp.ts`)

```typescript
const MIME_TO_EXT: Record<string, string> = {
	'image/jpeg':      'jpg',
	'image/png':       'png',
	'image/webp':      'webp',
	'application/pdf': 'pdf',
	'application/xml': 'xml',
	'text/xml':        'xml',
};
```

**Key Improvements:**
- Correctly preserves `.webp` file extensions for incoming WebP images received via WhatsApp webhooks.

---

## 03. Vulnerability & Risk Assessment

| Domain | Evaluation | Key Findings |
|---|---|---|
| **MIME Sniffing (CWE-693)** | **Pass** | `resolveMimeType` returns precise `Content-Type` headers for uploaded images and document files, working in tandem with `X-Content-Type-Options: nosniff`. |
| **Code Duplication (DRY)** | **Pass** | Redundant local `MIME` lookup tables were removed from route handlers, eliminating risk of divergent MIME mappings across endpoints. |
| **External Media Integrity** | **Pass** | WebP media received via WhatsApp is stored with its proper `.webp` extension, preventing file format corruption or MIME type mismatch upon subsequent download. |

---

## 04. Test Coverage & Quality Verification

- **Upload Endpoint Suite (`tests/upload-endpoint.test.ts`):**
  - Updated `resolveMimeType` test table to verify `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`, and `.xml`.
  - Confirmed case-insensitive extension matching and fallback behavior for `.bin` and extensionless files.
- **WhatsApp API Suite (`tests/whatsapp-api.test.ts`):**
  - Added explicit test case asserting `downloadWhatsAppMedia` maps `image/webp` to `webp`.
  - Refactored `mockMediaFetch` helper to simplify test case assertions.
- **Codebase Invariants:**
  - Standard linter checks (`pnpm lint:no-comments`, `pnpm check`) pass cleanly.

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Implement Static Analysis Linter for Centralized MIME Lookup**
   - **Context:** While `resolveMimeType` was introduced, no static linter prevents new routes from creating duplicate `MIME: Record<string, string>` maps.
   - **Action:** Add a static check in `tests/upload-endpoint.test.ts` scanning `src/routes/` to enforce that route handlers do not define local `MIME` lookup dictionaries.

2. **Task 2: Audit Dynamic Route Discovery for Export & Download Endpoints**
   - **Action:** Continue refining export endpoint rate limiting and header enforcement tests to ensure all file download endpoints use single-source MIME resolution and attach `nosniff` headers.
