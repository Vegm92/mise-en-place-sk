// Visual verification script — screenshots all 3 upload flow pages
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const BASE = 'http://localhost:5174';
const SESSION_ID = 'visual-verify-001';

const browser = await chromium.launch({ headless: true });

// Authenticate via API
const reqCtx = await browser.newContext();
const authResp = await reqCtx.request.post(`${BASE}/api/auth/sign-in/email`, {
  data: { email: 'admin@gmail.com', password: 'adminpass' },
  headers: { 'Content-Type': 'application/json' },
});
const cookies = await reqCtx.cookies();
console.log('Auth status:', authResp.status(), '| Cookies:', cookies.map(c => c.name).join(', '));
await reqCtx.close();

const ctx = await browser.newContext();
await ctx.addCookies(cookies.map(c => ({ ...c, domain: 'localhost', path: '/' })));
const page = await ctx.newPage();
await page.setViewportSize({ width: 1280, height: 800 });

const errors = [];
page.on('pageerror', err => errors.push(err.message));

// Step 1 — upload drop zone
await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
writeFileSync('screenshots/step1-upload.png', await page.screenshot({ fullPage: true }));
console.log('screenshots/step1-upload.png ✓ | body:', (await page.$eval('body', el => el.innerHTML)).length);

// Step 2 — confirm page
await page.goto(`${BASE}/confirm/${SESSION_ID}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
writeFileSync('screenshots/step2-confirm.png', await page.screenshot({ fullPage: true }));
console.log('screenshots/step2-confirm.png ✓ | body:', (await page.$eval('body', el => el.innerHTML)).length);

// Step 3 — extract review page
errors.length = 0;
await page.goto(`${BASE}/extract/${SESSION_ID}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
const bodyLen = (await page.$eval('body', el => el.innerHTML)).length;
console.log('step3 body length:', bodyLen);
console.log('step3 errors:', errors.join(' | '));
writeFileSync('screenshots/step3-review.png', await page.screenshot({ fullPage: true }));
console.log('screenshots/step3-review.png ✓');

// Also dump page source for step3 if blank
if (bodyLen < 1000) {
  const html = await page.content();
  writeFileSync('screenshots/step3-debug.html', html);
  console.log('Saved step3-debug.html for inspection');
}

await browser.close();
