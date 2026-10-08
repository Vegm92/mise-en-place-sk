---
tags: [mep, audit, pr-review, security, mime-type, webp, upload-endpoint, headers]
related: PR #1212, Commit 5c474e6
---

# Post-Merge Review Report: PR #1212 / Commit 5c474e6 (Add .webp MIME Type Mapping to Batch File Upload & Media Endpoints)

**Reviewed PR:** #1212 (`security: add .webp MIME type mapping to batch file upload endpoint`)
**Merge Commit:** `5c474e609dfe550d3cc406c2026babda11b6d2ef`
**Branch:** `Vegm92/sentinel-security-audit-webp-mime-7184722047331617789`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-10-07

---

## 01. Executive Summary

Commit `5c474e6` (PR #1212) resolves a MIME-type mapping gap for `.webp` image assets served via batch item upload and invoice file download endpoints (`/api/upload/[id]/[file]` and `/invoice/[id]/file`).

Prior to PR #1212, while the upload intake guard and magic byte checker recognized WebP image files (RIFF / WEBP headers), served media endpoints (`/api/upload/[id]/[file]` and `/invoice/[id]/file`) lacked `.webp` in their internal extension-to-MIME-type lookup maps (`MIME`). Consequently, requests retrieving uploaded `.webp` invoice images fell back to `application/octet-stream`. When combined with security headers such as `X-Content-Type-Options: nosniff`, browsers were prevented from inline image rendering, causing images to download as raw binaries instead of displaying in the UI.

PR #1212 enforced consistent `.webp` -> `image/webp` MIME mapping across download handlers and test suites:
1. **Invoice Source File Endpoint (`src/routes/(app)/invoice/[id]/file/+server.ts`):** Added `webp: 'image/webp'` mapping.
2. **Batch Upload Media Endpoint (`src/routes/api/upload/[id]/[file]/+server.ts`):** Added `'.webp': 'image/webp'` mapping.
3. **Automated Unit Tests (`tests/upload-endpoint.test.ts` & `tests/supported-file-types.test.ts`):** Extended MIME resolution assertions to cover `.webp` -> `image/webp`.

This report provides a master architectural review of PR #1212, evaluating implementation correctness, MIME security posture, test coverage, and residual backlog items for future engineering sessions.

---

## 02. Technical Analysis of Code Changes

### 1. Invoice File Handler (`src/routes/(app)/invoice/[id]/file/+server.ts`)

```typescript
const MIME: Record<string, string> = {
	pdf:  'application/pdf',
	jpg:  'image/jpeg',
	jpeg: 'image/jpeg',
	png:  'image/png',
	webp: 'image/webp',
	xml:  'application/xml',
};
```

**Key Technical Findings:**
- Maps file extensions without leading dot (e.g. `ext = path.extname(key).toLowerCase().replace('.', '')`) to standard MIME types.
- Correctly maps `webp` to `image/webp`.
- Retains fallback to `application/octet-stream` for unexpected extensions.
- Enforces `X-Content-Type-Options: nosniff` and tenant rate limiting (`invoice-file-download`).

### 2. Batch Upload Media Handler (`src/routes/api/upload/[id]/[file]/+server.ts`)

```typescript
const MIME: Record<string, string> = {
	'.pdf':  'application/pdf',
	'.jpg':  'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png':  'image/png',
	'.webp': 'image/webp',
};
```

**Key Technical Findings:**
- Maps extensions with leading dot (e.g. `ext = path.extname(filename).toLowerCase()`).
- Correctly maps `.webp` to `image/webp`.
- Works in tandem with `UUID_RE.test(params.id)` validation, tenant authorization (`item.restaurantId === locals.restaurantId`), and path traversal checks.

---

## 03. Vulnerability & Risk Assessment

| Risk Domain | Evaluation | Findings & Verification |
|---|---|---|
| **Content-Type Mismatch / Inline Display** | **Resolved** | Serves `image/webp` for `.webp` files, allowing browsers to render WebP images inline while satisfying `nosniff`. |
| **Path Traversal & Authorization** | **Pass** | Endpoint verifies `item.restaurantId === locals.restaurantId` and path safety before reading from storage. |
| **MIME Sniffing (CWE-693)** | **Pass** | Both endpoints attach `X-Content-Type-Options: nosniff` alongside appropriate `Content-Type` headers. |
| **Duplication of MIME Lookup Tables** | **Low Risk** | `MIME` maps are defined locally in both endpoints with slight key format differences (leading dot vs no dot). Candidate for centralizing in `$lib/server/file-validation.ts`. |

---

## 04. Test Coverage & Quality Verification

- **Automated Tests (`tests/upload-endpoint.test.ts` & `tests/supported-file-types.test.ts`):**
  - Updated `resolveMime` test table to assert `['photo.webp', 'image/webp']`.
  - Verified `UNSUPPORTED` array in file types suite correctly handles WebP intake vs display.
- **Codebase Invariants:**
  - `pnpm lint:no-comments` strictly maintained (0 inline comments added in `src/`).
  - `pnpm lint:tenant-scope` passes cleanly.

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Centralize Server-Side MIME Mapping Helper**
   - **Context:** Multiple endpoints (`src/routes/(app)/invoice/[id]/file/+server.ts` and `src/routes/api/upload/[id]/[file]/+server.ts`) define separate `MIME` record objects.
   - **Action:** Create a centralized helper `resolveMimeType(filename: string)` in `$lib/server/file-validation.ts` or `$lib/server/storage.ts` to unify extension-to-MIME lookup across all file serving endpoints.

2. **Task 2: Audit WhatsApp & External Media Download Handlers for WebP MIME Consistency**
   - **Context:** External media ingestion (such as WhatsApp media downloads in `src/lib/server/whatsapp.ts`) should ensure incoming `image/webp` media is preserved with correct `.webp` extension rather than defaulting to `.jpg`.
   - **Action:** Audit `downloadWhatsAppMedia` and related helpers to ensure `image/webp` content types map cleanly to `.webp`.
