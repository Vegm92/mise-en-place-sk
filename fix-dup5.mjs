import { readFileSync, writeFileSync } from 'fs';

const W = 'C:/Users/victo/Proyectos/in_development/mise_en_place_sk-PF/.claude/worktrees/fix-985-duplication/';

function fix(relPath, transforms) {
  const file = W + relPath;
  let t = readFileSync(file, 'utf8');
  const before = t;
  for (const fn of transforms) t = fn(t);
  if (t === before) {
    console.log(`WARN: no changes in ${relPath}`);
  } else {
    writeFileSync(file, t, 'utf8');
    console.log(`Fixed: ${relPath}`);
  }
}

// ── 1. tests/invoice-save-verifactu.test.ts ──────────────────────────────────
// Extract doSaveVerifactu helper and rewrite all 4 test bodies.
// The clone region matched invoice-amount-validation because of saveReviewedInvoice
// + expect(out.type).toBe('saved') + if (out.type !== 'saved') return.
// Helper removes that pattern from every call site.
fix('tests/invoice-save-verifactu.test.ts', [
  // Insert helper after fetchNotificationPayload function
  t => t.replace(
    `\treturn rows[0]!.payload;\n}\n\ndescribe.skipIf`,
    `\treturn rows[0]!.payload;\n}\n\nasync function doSaveVerifactu(item: BatchItem, fd: FormData) {\n\tconst result = await saveReviewedInvoice(item, fd, rid);\n\tif (result.type !== 'saved') throw new Error(result.type);\n\treturn result.invoiceId;\n}\n\ndescribe.skipIf`
  ),
  // Test 1: flags a real mismatch
  t => t.replace(
    `\t\tconst item = fakeItem({ qr_url: VALID_QR, confidence: 1 });\n\t\tconst out = await saveReviewedInvoice(\n\t\t\titem,\n\t\t\tform({ invoiceNumber: 'FAC-2024-001', invoiceDate: '2024-01-15', totalAmount: '9999.00' }),\n\t\t\trid,\n\t\t);\n\t\texpect(out.type).toBe('saved');\n\t\tif (out.type !== 'saved') return;\n\n\t\tconst verifactuId1 = out.invoiceId;\n\t\tconst mismatchRow = await fetchInvoiceRow(verifactuId1);\n\t\texpect(mismatchRow.qr_url).toBe(VALID_QR);\n\t\texpect(mismatchRow.qr_mismatch).toBe(true);\n\n\t\tconst mismatchPayload = await fetchNotificationPayload(rid, verifactuId1);`,
    `\t\tconst mismatchId = await doSaveVerifactu(\n\t\t\tfakeItem({ qr_url: VALID_QR, confidence: 1 }),\n\t\t\tform({ invoiceNumber: 'FAC-2024-001', invoiceDate: '2024-01-15', totalAmount: '9999.00' }),\n\t\t);\n\t\tconst mismatchRow = await fetchInvoiceRow(mismatchId);\n\t\texpect(mismatchRow.qr_url).toBe(VALID_QR);\n\t\texpect(mismatchRow.qr_mismatch).toBe(true);\n\n\t\tconst mismatchPayload = await fetchNotificationPayload(rid, mismatchId);`
  ),
  // Test 2: flags a tampered invoice number
  t => t.replace(
    `\t\tconst item = fakeItem({ qr_url: VALID_QR, confidence: 1 });\n\t\tconst out = await saveReviewedInvoice(\n\t\t\titem,\n\t\t\tform({ invoiceNumber: 'FAC-2024-TAMPERED', invoiceDate: '2024-01-15', totalAmount: '1250.00' }),\n\t\t\trid,\n\t\t);\n\t\texpect(out.type).toBe('saved');\n\t\tif (out.type !== 'saved') return;\n\n\t\tconst verifactuId2 = out.invoiceId;\n\t\tconst tamperedRow = await fetchInvoiceRow(verifactuId2);\n\t\texpect(tamperedRow.qr_mismatch).toBe(true);\n\n\t\tconst tamperedPayload = await fetchNotificationPayload(rid, verifactuId2);`,
    `\t\tconst tamperedId = await doSaveVerifactu(\n\t\t\tfakeItem({ qr_url: VALID_QR, confidence: 1 }),\n\t\t\tform({ invoiceNumber: 'FAC-2024-TAMPERED', invoiceDate: '2024-01-15', totalAmount: '1250.00' }),\n\t\t);\n\t\tconst tamperedRow = await fetchInvoiceRow(tamperedId);\n\t\texpect(tamperedRow.qr_mismatch).toBe(true);\n\n\t\tconst tamperedPayload = await fetchNotificationPayload(rid, tamperedId);`
  ),
  // Test 3: does not false-positive
  t => t.replace(
    `\t\tconst item = fakeItem({ qr_url: VALID_QR, confidence: 1 });\n\t\tconst out = await saveReviewedInvoice(\n\t\t\titem,\n\t\t\tform({\n\t\t\t\tinvoiceNumber: 'FAC-2024-001',\n\t\t\t\tinvoiceDate: '2024-01-15',\n\t\t\t\ttotalAmount: '1250.00',\n\t\t\t\tsupplier: '__inv_verifactu_sup_match__',\n\t\t\t}),\n\t\t\trid,\n\t\t);\n\t\texpect(out.type).toBe('saved');\n\t\tif (out.type !== 'saved') return;\n\n\t\tconst verifactuId3 = out.invoiceId;\n\t\tconst matchRow = await fetchInvoiceRow(verifactuId3);\n\t\texpect(matchRow.qr_url).toBe(VALID_QR);\n\t\texpect(matchRow.qr_mismatch).toBe(false);\n\n\t\tconst notifications = await testSql\`\n\t\t\tSELECT id FROM system_notifications\n\t\t\tWHERE restaurant_id = \${rid} AND invoice_id = \${out.invoiceId}\n\t\t\t\tAND notification_type = 'verifactu_qr_mismatch'\`;`,
    `\t\tconst matchId = await doSaveVerifactu(\n\t\t\tfakeItem({ qr_url: VALID_QR, confidence: 1 }),\n\t\t\tform({\n\t\t\t\tinvoiceNumber: 'FAC-2024-001',\n\t\t\t\tinvoiceDate: '2024-01-15',\n\t\t\t\ttotalAmount: '1250.00',\n\t\t\t\tsupplier: '__inv_verifactu_sup_match__',\n\t\t\t}),\n\t\t);\n\t\tconst matchRow = await fetchInvoiceRow(matchId);\n\t\texpect(matchRow.qr_url).toBe(VALID_QR);\n\t\texpect(matchRow.qr_mismatch).toBe(false);\n\n\t\tconst notifications = await testSql\`\n\t\t\tSELECT id FROM system_notifications\n\t\t\tWHERE restaurant_id = \${rid} AND invoice_id = \${matchId}\n\t\t\t\tAND notification_type = 'verifactu_qr_mismatch'\`;`
  ),
  // Test 4: no-op when no QR
  t => t.replace(
    `\t\tconst item = fakeItem({ qr_url: null, confidence: 1 });\n\t\tconst out = await saveReviewedInvoice(\n\t\t\titem,\n\t\t\tform({ invoiceNumber: 'FAC-NOQR-001', invoiceDate: '2024-02-01', totalAmount: '50.00' }),\n\t\t\trid,\n\t\t);\n\t\texpect(out.type).toBe('saved');\n\t\tif (out.type !== 'saved') return;\n\n\t\tconst verifactuId4 = out.invoiceId;\n\t\tconst noQrRow = await fetchInvoiceRow(verifactuId4);`,
    `\t\tconst noQrId = await doSaveVerifactu(\n\t\t\tfakeItem({ qr_url: null, confidence: 1 }),\n\t\t\tform({ invoiceNumber: 'FAC-NOQR-001', invoiceDate: '2024-02-01', totalAmount: '50.00' }),\n\t\t);\n\t\tconst noQrRow = await fetchInvoiceRow(noQrId);`
  ),
]);

// ── 2. tests/sentry-api.test.ts ───────────────────────────────────────────────
// Extract callListIssues helper inside the describe to collapse the two
// near-identical test bodies (vi.doMock + import + call = 5 lines, 30+ tokens).
fix('tests/sentry-api.test.ts', [
  t => t.replace(
    `\tbeforeEach(() => {`,
    `\tasync function callListIssues(baseUrl: string) {\n\t\tvi.doMock('../src/lib/server/env', () => ({\n\t\t\tSENTRY_API_BASE_URL: baseUrl,\n\t\t\tSENTRY_AUTH_TOKEN: 'test-token',\n\t\t\tSENTRY_ORG: 'my-org',\n\t\t}));\n\t\tconst { listUnresolvedIssues } = await import('../src/lib/server/sentry-api');\n\t\tawait listUnresolvedIssues(10);\n\t\treturn String(fetchMock.mock.calls[0]![0]);\n\t}\n\n\tbeforeEach(() => {`
  ),
  // Test 1: EU default
  t => t.replace(
    `\tit('uses the EU default when no override is configured', async () => {\n\t\tvi.doMock('../src/lib/server/env', () => ({\n\t\t\tSENTRY_API_BASE_URL: 'https://de.sentry.io/api/0',\n\t\t\tSENTRY_AUTH_TOKEN: 'test-token',\n\t\t\tSENTRY_ORG: 'my-org',\n\t\t}));\n\t\tconst { listUnresolvedIssues } = await import('../src/lib/server/sentry-api');\n\n\t\tawait listUnresolvedIssues(10);\n\n\t\tconst [euUrl] = fetchMock.mock.calls[0]!;\n\t\texpect(euUrl).toBe(\n\t\t\t'https://de.sentry.io/api/0/organizations/my-org/issues/?query=is:unresolved&sort=freq&limit=10',\n\t\t);\n\t});`,
    `\tit('uses the EU default when no override is configured', async () => {\n\t\tconst euUrl = await callListIssues('https://de.sentry.io/api/0');\n\t\texpect(euUrl).toBe(\n\t\t\t'https://de.sentry.io/api/0/organizations/my-org/issues/?query=is:unresolved&sort=freq&limit=10',\n\t\t);\n\t});`
  ),
  // Test 2: overridden region
  t => t.replace(
    `\tit('hits the overridden region when SENTRY_API_BASE_URL is set', async () => {\n\t\tvi.doMock('../src/lib/server/env', () => ({\n\t\t\tSENTRY_API_BASE_URL: 'https://sentry.io/api/0',\n\t\t\tSENTRY_AUTH_TOKEN: 'test-token',\n\t\t\tSENTRY_ORG: 'my-org',\n\t\t}));\n\t\tconst { listUnresolvedIssues } = await import('../src/lib/server/sentry-api');\n\n\t\tawait listUnresolvedIssues(10);\n\n\t\tconst [overrideUrl] = fetchMock.mock.calls[0]!;\n\t\texpect(overrideUrl).toBe(\n\t\t\t'https://sentry.io/api/0/organizations/my-org/issues/?query=is:unresolved&sort=freq&limit=10',\n\t\t);\n\t});`,
    `\tit('hits the overridden region when SENTRY_API_BASE_URL is set', async () => {\n\t\tconst overrideUrl = await callListIssues('https://sentry.io/api/0');\n\t\texpect(overrideUrl).toBe(\n\t\t\t'https://sentry.io/api/0/organizations/my-org/issues/?query=is:unresolved&sort=freq&limit=10',\n\t\t);\n\t});`
  ),
]);

// ── 3. tests/whatsapp-api.test.ts ─────────────────────────────────────────────
// Extract setupWhatsAppSend helper at module level to remove the 3 identical
// lines (mockResolvedValue + import + sendWhatsAppMessage) from tests 1 and 2.
fix('tests/whatsapp-api.test.ts', [
  t => t.replace(
    `const fetchMock = vi.fn();\n\nbeforeEach`,
    `const fetchMock = vi.fn();\n\nasync function setupWhatsAppSend() {\n\tfetchMock.mockResolvedValue({ ok: true, text: async () => '' });\n\tconst { sendWhatsAppMessage } = await import('../src/lib/server/whatsapp');\n\tawait sendWhatsAppMessage('34612345678', 'hola');\n}\n\nbeforeEach`
  ),
  // Test 1: posts to configured version
  t => t.replace(
    `\t\tfetchMock.mockResolvedValue({ ok: true, text: async () => '' });\n\t\tconst { sendWhatsAppMessage } = await import('../src/lib/server/whatsapp');\n\n\t\tawait sendWhatsAppMessage('34612345678', 'hola');\n\n\t\tconst [apiUrl, apiInit] = fetchMock.mock.calls[0]!;`,
    `\t\tawait setupWhatsAppSend();\n\n\t\tconst [apiUrl, apiInit] = fetchMock.mock.calls[0]!;`
  ),
  // Test 2: never targets expired version
  t => t.replace(
    `\t\tfetchMock.mockResolvedValue({ ok: true, text: async () => '' });\n\t\tconst { sendWhatsAppMessage } = await import('../src/lib/server/whatsapp');\n\n\t\tawait sendWhatsAppMessage('34612345678', 'hola');\n\n\t\t// v19.0 expired`,
    `\t\tawait setupWhatsAppSend();\n\n\t\t// v19.0 expired`
  ),
]);

console.log('fix-dup5 done.');
