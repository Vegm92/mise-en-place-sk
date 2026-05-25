// Multi-file upload pipeline check
// Verifies: 2 files → /confirm/:id → queue state → /extract/:id
//
// Usage:
//   node scripts/check-multi-upload.mjs            # routing only (fast, no AI)
//   node scripts/check-multi-upload.mjs --full     # includes AI extraction + chain
//   node scripts/check-multi-upload.mjs --headed   # show browser window
import { chromium } from 'playwright';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const BASE   = process.env.TEST_BASE_URL ?? 'http://localhost:5173';
const EMAIL  = process.env.AUTH_ADMIN_EMAIL ?? 'admin@gmail.com';
const PASS   = process.env.AUTH_ADMIN_PASSWORD ?? 'adminpass';
const FULL   = process.argv.includes('--full');
const HEADED = process.argv.includes('--headed');

// Minimal valid 1×1 white PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADklEQVQI12P4' +
  'z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function tempPng(name) {
  const p = join(tmpdir(), name);
  writeFileSync(p, TINY_PNG);
  return p;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function login(page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10_000 });
  console.log('  ✓ Logged in');
}

async function uploadTwo(page, f1, f2) {
  await page.goto(BASE);
  await page.locator('input[type="file"]').first().setInputFiles([f1, f2]);
  const btn = page.locator('button').filter({ hasText: /extraer|extract/i }).last();
  await btn.waitFor({ state: 'visible', timeout: 5_000 });
  await btn.click();
  await page.waitForURL(url => url.toString().includes('/confirm/'), { timeout: 15_000 });
}

const results = [];
function check(label, got, expected) {
  const ok = expected === true ? !!got : got === expected;
  results.push({ label, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  ← got: ${JSON.stringify(got)}`}`);
  return ok;
}

// ── Main ─────────────────────────────────────────────────────────────────────

const f1 = tempPng('mep-test-invoice-1.png');
const f2 = tempPng('mep-test-invoice-2.png');

const browser = await chromium.launch({ headless: !HEADED });
const page    = await browser.newPage();

try {
  await login(page);

  // ── Phase 1: Routing ────────────────────────────────────────────────────
  console.log('\n── Phase 1: Upload routing ──');
  await uploadTwo(page, f1, f2);
  check('2 files → /confirm/:id  (not /extract/)', page.url().includes('/confirm/'), true);

  // ── Phase 2: Confirm page state ─────────────────────────────────────────
  console.log('\n── Phase 2: Confirm page state ──');

  // Queue pill badge shows totalInvoices = 2
  const badge = (await page.locator('.num[style*="999px"]').textContent().catch(() => '')).trim();
  check('Queue badge = "2"', badge, '2');

  // "Factura 1 de 2" (es) or "Invoice 1 of 2" (en) text visible
  const body = (await page.textContent('body')) ?? '';
  check('"1 de/of 2" progress text visible', /\b1\s*(de|of)\s*2\b/i.test(body), true);

  // Extract button text: "Extraer 2 facturas" / "Extract 2 invoices"
  const extractBtnText = (
    await page.locator('form[action="?/extract"] button[type="submit"]').textContent().catch(() => '')
  ).trim();
  check('Extract button text includes "2"', extractBtnText.includes('2'), true);

  // Current-session file has a remove button; queued files show "En cola" tag instead
  const removeForms = await page.locator('form[action="?/remove"]').count();
  check('Remove button count = 1 (current session only)', removeForms, 1);

  const queuedTags = await page.locator('span:has-text("En cola"), span:has-text("In queue")').count();
  check('Queued tag visible for remaining file', queuedTags, 1);

  // ── Phase 3: Discard ────────────────────────────────────────────────────
  console.log('\n── Phase 3: Discard clears batch and returns home ──');
  await page.locator('form[action="?/discard"] button[type="submit"]').click();
  await page.waitForURL(url => /\/$|\/?$/.test(new URL(url.toString()).pathname), { timeout: 8_000 });
  check('Discard → home (/)', new URL(page.url()).pathname === '/', true);

  // ── Phase 4: Extract navigates into the chain ────────────────────────────
  console.log('\n── Phase 4: Extract → /extract/:id ──');
  await uploadTwo(page, f1, f2);
  await page.locator('form[action="?/extract"] button[type="submit"]').click();
  await page.waitForURL(url => url.toString().includes('/extract/'), { timeout: 15_000 });
  check('/confirm → /extract/:id after extract click', page.url().includes('/extract/'), true);

  const firstExtractId = page.url().split('/extract/')[1];
  check('Session ID is 32-char hex', /^[0-9a-f]{32}$/.test(firstExtractId), true);

  // ── Phase 5 (--full): AI extraction + remaining chain ───────────────────
  if (FULL) {
    console.log('\n── Phase 5 (full): AI extraction + chain ──');
    console.log('  Waiting for extraction up to 90s…');
    await page.waitForLoadState('networkidle', { timeout: 90_000 });

    const hasSaveForm  = await page.locator('form[action*="save"]').count() > 0;
    const hasError     = await page.locator('[class*="error"],[style*="--mep-neg"]').count() > 0;
    check('Extract page 1 settled (save form or error shown)', hasSaveForm || hasError, true);

    if (hasSaveForm) {
      // Discard invoice 1 → should redirect to /extract/:remainingId (invoice 2)
      await page.locator('form[action*="discard"] button[type="submit"]').click();
      await page.waitForURL(
        url => !url.toString().includes(`/extract/${firstExtractId}`),
        { timeout: 15_000 }
      );
      const nextUrl = page.url();
      // Single-invoice discard goes home; batch remaining should go to next extract
      check(
        'After discard invoice 1: navigated away from first extract',
        !nextUrl.includes(`/extract/${firstExtractId}`),
        true
      );
    }
  }

} catch (err) {
  console.error('\n  ✗ FATAL:', err.message);
  results.push({ label: 'FATAL', ok: false });
} finally {
  await browser.close();
  try { unlinkSync(f1); } catch { /* already cleaned */ }
  try { unlinkSync(f2); } catch { /* already cleaned */ }
}

// ── Summary ──────────────────────────────────────────────────────────────────
const passed = results.filter(r => r.ok).length;
const failed = results.filter(r => !r.ok).length;
console.log(
  `\n── ${passed} passed, ${failed} failed` +
  (FULL ? ' (full mode)' : ' — routing only, use --full to include AI extraction') +
  ' ──'
);
if (failed > 0) process.exit(1);
