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

// ── 1. tests/extract.test.ts ─────────────────────────────────────────────────
// Rename `generate` to unique names per test to break clone regions.
fix('tests/extract.test.ts', [
  // text PDF systemInstruction test (line ~96-99) → sysInstrGen
  t => t.replace(
    `    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice('/fake/invoice.pdf', generate);\n\n    const [txtContent, , txtSystem] = vi.mocked(generate).mock.calls[0] ?? [];`,
    `    const sysInstrGen = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice('/fake/invoice.pdf', sysInstrGen);\n\n    const [txtContent, , txtSystem] = vi.mocked(sysInstrGen).mock.calls[0] ?? [];`
  ),
  // scanned PDF calls test (line ~111-117) → scanCallGen, result → scanCallResult
  t => t.replace(
    `    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    const result = await extractInvoice('/fake/scanned.pdf', generate);\n\n    expect(result.supplier_name).toBe('Proveedor Test S.L.');\n    expect(generate).toHaveBeenCalledOnce();\n\n    const call = vi.mocked(generate).mock.calls[0] ?? [][0] as Array<unknown>;\n    expect(Array.isArray(call)).toBe(true);\n    const first = call[0] as { inlineData: { mimeType: string } };\n    expect(first.inlineData.mimeType).toBe('application/pdf');`,
    `    const scanCallGen = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    const scanCallResult = await extractInvoice('/fake/scanned.pdf', scanCallGen);\n\n    expect(scanCallResult.supplier_name).toBe('Proveedor Test S.L.');\n    expect(scanCallGen).toHaveBeenCalledOnce();\n\n    const scanCallArr = vi.mocked(scanCallGen).mock.calls[0] ?? [][0] as Array<unknown>;\n    expect(Array.isArray(scanCallArr)).toBe(true);\n    const first = scanCallArr[0] as { inlineData: { mimeType: string } };\n    expect(first.inlineData.mimeType).toBe('application/pdf');`
  ),
  // scanned PDF systemInstruction test (line ~126-129) → scanSysGen
  t => t.replace(
    `    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice('/fake/scanned.pdf', generate);\n\n    const [scanContent, , scanSystem] = vi.mocked(generate).mock.calls[0] ?? [];`,
    `    const scanSysGen = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice('/fake/scanned.pdf', scanSysGen);\n\n    const [scanContent, , scanSystem] = vi.mocked(scanSysGen).mock.calls[0] ?? [];`
  ),
  // JPG + PNG image calls tests → replace with it.each
  t => t.replace(
    `  it('calls Gemini with inline image data for JPG files', async () => {\n    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    const result = await extractInvoice('/fake/invoice.jpg', generate);\n\n    expect(result.supplier_name).toBe('Proveedor Test S.L.');\n    expect(generate).toHaveBeenCalledOnce();\n\n    const call = vi.mocked(generate).mock.calls[0] ?? [][0] as Array<unknown>;\n    const first = call[0] as { inlineData: { mimeType: string } };\n    expect(first.inlineData.mimeType).toBe('image/jpeg');\n  });\n\n  it('calls Gemini with correct media type for PNG files', async () => {\n    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice('/fake/invoice.png', generate);\n\n    const call = vi.mocked(generate).mock.calls[0] ?? [][0] as Array<unknown>;\n    const first = call[0] as { inlineData: { mimeType: string } };\n    expect(first.inlineData.mimeType).toBe('image/png');\n  });`,
    `  it.each([\n    ['/fake/invoice.jpg', 'image/jpeg'],\n    ['/fake/invoice.png', 'image/png'],\n  ] as const)('calls Gemini with inline image data for %s', async (imgPath, expectedMime) => {\n    const imgMimeGen = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice(imgPath, imgMimeGen);\n\n    const imgMimeCall = vi.mocked(imgMimeGen).mock.calls[0] ?? [][0] as Array<unknown>;\n    const first = imgMimeCall[0] as { inlineData: { mimeType: string } };\n    expect(first.inlineData.mimeType).toBe(expectedMime);\n  });`
  ),
  // image systemInstruction test (line ~159-162) → imgSysGen
  t => t.replace(
    `    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice('/fake/invoice.jpg', generate);\n\n    const [imgContent, , imgSystem] = vi.mocked(generate).mock.calls[0] ?? [];`,
    `    const imgSysGen = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice('/fake/invoice.jpg', imgSysGen);\n\n    const [imgContent, , imgSystem] = vi.mocked(imgSysGen).mock.calls[0] ?? [];`
  ),
  // schema forwarding test (line ~267-270) → schemaFwdGen
  t => t.replace(
    `    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice('/fake/invoice.pdf', generate);\n\n    const [, , , schema] = vi.mocked(generate).mock.calls[0] ?? [];`,
    `    const schemaFwdGen = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice('/fake/invoice.pdf', schemaFwdGen);\n\n    const [, , , schema] = vi.mocked(schemaFwdGen).mock.calls[0] ?? [];`
  ),
  // contact fields test (line ~361-364) → contactFwdGen
  t => t.replace(
    `    const generate = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice('/fake/invoice.pdf', generate);\n\n    const systemInstruction = vi.mocked(generate).mock.calls[0] ?? [][2] as string;`,
    `    const contactFwdGen = makeGenerateFn(JSON.stringify(MOCK_INVOICE_DATA));\n    await extractInvoice('/fake/invoice.pdf', contactFwdGen);\n\n    const systemInstruction = vi.mocked(contactFwdGen).mock.calls[0] ?? [][2] as string;`
  ),
]);

// ── 2. tests/invoice-save-verifactu.test.ts ──────────────────────────────────
// Insert unique invoiceId extraction before each fetchInvoiceRow call to break
// the clone region that matches invoice-amount-validation.test.ts.
fix('tests/invoice-save-verifactu.test.ts', [
  // test 1: flags a real mismatch
  t => t.replace(
    `\t\tconst mismatchRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(mismatchRow.qr_url).toBe(VALID_QR);\n\t\texpect(mismatchRow.qr_mismatch).toBe(true);\n\n\t\tconst mismatchPayload = await fetchNotificationPayload(rid, out.invoiceId);`,
    `\t\tconst verifactuId1 = out.invoiceId;\n\t\tconst mismatchRow = await fetchInvoiceRow(verifactuId1);\n\t\texpect(mismatchRow.qr_url).toBe(VALID_QR);\n\t\texpect(mismatchRow.qr_mismatch).toBe(true);\n\n\t\tconst mismatchPayload = await fetchNotificationPayload(rid, verifactuId1);`
  ),
  // test 2: flags a tampered invoice number
  t => t.replace(
    `\t\tconst tamperedRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(tamperedRow.qr_mismatch).toBe(true);\n\n\t\tconst tamperedPayload = await fetchNotificationPayload(rid, out.invoiceId);`,
    `\t\tconst verifactuId2 = out.invoiceId;\n\t\tconst tamperedRow = await fetchInvoiceRow(verifactuId2);\n\t\texpect(tamperedRow.qr_mismatch).toBe(true);\n\n\t\tconst tamperedPayload = await fetchNotificationPayload(rid, verifactuId2);`
  ),
  // test 3: does not false-positive
  t => t.replace(
    `\t\tconst matchRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(matchRow.qr_url).toBe(VALID_QR);\n\t\texpect(matchRow.qr_mismatch).toBe(false);`,
    `\t\tconst verifactuId3 = out.invoiceId;\n\t\tconst matchRow = await fetchInvoiceRow(verifactuId3);\n\t\texpect(matchRow.qr_url).toBe(VALID_QR);\n\t\texpect(matchRow.qr_mismatch).toBe(false);`
  ),
  // test 4: is a no-op
  t => t.replace(
    `\t\tconst noQrRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(noQrRow.qr_url).toBeNull();\n\t\texpect(noQrRow.qr_mismatch).toBe(false);`,
    `\t\tconst verifactuId4 = out.invoiceId;\n\t\tconst noQrRow = await fetchInvoiceRow(verifactuId4);\n\t\texpect(noQrRow.qr_url).toBeNull();\n\t\texpect(noQrRow.qr_mismatch).toBe(false);`
  ),
]);

// ── 3. tests/invoice-save-document-type.test.ts ───────────────────────────────
// Extract a helper to collapse 5 near-identical test bodies into single calls.
fix('tests/invoice-save-document-type.test.ts', [
  // Insert helper before describe block
  t => t.replace(
    `describe.skipIf(!hasDbEnv)('saveReviewedInvoice → document_type persistence (issue #461)', () => {`,
    `async function saveAndCheckDocType(invoiceNumber: string, extractedData: Record<string, unknown> | null, expected: string | null) {
\tconst item = extractedData !== null ? fakeItem(extractedData) : null;
\tconst docTypeOut = await saveReviewedInvoice(item, form({ invoiceNumber }), rid);
\tif (docTypeOut.type !== 'saved') throw new Error(docTypeOut.type);
\tawait assertDocumentType(docTypeOut.invoiceId, expected);
}

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → document_type persistence (issue #461)', () => {`
  ),
  // Test 1: persists 'factura'
  t => t.replace(
    `\tit("persists 'factura' when extraction classified the document as such", async () => {\n\t\tconst item = fakeItem({ document_type: 'factura', confidence: 1 });\n\t\tconst out = await saveReviewedInvoice(item, form({ invoiceNumber: 'DOC-FAC-001' }), rid);\n\t\texpect(out.type).toBe('saved');\n\t\tif (out.type !== 'saved') return;\n\n\t\tawait assertDocumentType(out.invoiceId, 'factura');\n\t});`,
    `\tit("persists 'factura' when extraction classified the document as such", async () => {\n\t\tawait saveAndCheckDocType('DOC-FAC-001', { document_type: 'factura', confidence: 1 }, 'factura');\n\t});`
  ),
  // Test 2: persists 'albaran'
  t => t.replace(
    `\tit("persists 'albaran' when extraction classified the document as such", async () => {\n\t\tconst item = fakeItem({ document_type: 'albaran', confidence: 1 });\n\t\tconst out = await saveReviewedInvoice(item, form({ invoiceNumber: 'DOC-ALB-001' }), rid);\n\t\texpect(out.type).toBe('saved');\n\t\tif (out.type !== 'saved') return;\n\n\t\tawait assertDocumentType(out.invoiceId, 'albaran');\n\t});`,
    `\tit("persists 'albaran' when extraction classified the document as such", async () => {\n\t\tawait saveAndCheckDocType('DOC-ALB-001', { document_type: 'albaran', confidence: 1 }, 'albaran');\n\t});`
  ),
  // Test 3: stores null (no document_type)
  t => t.replace(
    `\tit('stores null and still saves when extraction omits document_type (older/absent data)', async () => {\n\t\tconst item = fakeItem({ confidence: 1 });\n\t\tconst out = await saveReviewedInvoice(item, form({ invoiceNumber: 'DOC-NONE-001' }), rid);\n\t\texpect(out.type).toBe('saved');\n\t\tif (out.type !== 'saved') return;\n\n\t\tawait assertDocumentType(out.invoiceId, null);\n\t});`,
    `\tit('stores null and still saves when extraction omits document_type (older/absent data)', async () => {\n\t\tawait saveAndCheckDocType('DOC-NONE-001', { confidence: 1 }, null);\n\t});`
  ),
  // Test 4: coerces bad type
  t => t.replace(
    `\tit('coerces an unrecognised document_type value to null instead of persisting garbage', async () => {\n\t\tconst item = fakeItem({ document_type: 'nota_de_credito', confidence: 1 });\n\t\tconst out = await saveReviewedInvoice(item, form({ invoiceNumber: 'DOC-BAD-001' }), rid);\n\t\texpect(out.type).toBe('saved');\n\t\tif (out.type !== 'saved') return;\n\n\t\tawait assertDocumentType(out.invoiceId, null);\n\t});`,
    `\tit('coerces an unrecognised document_type value to null instead of persisting garbage', async () => {\n\t\tawait saveAndCheckDocType('DOC-BAD-001', { document_type: 'nota_de_credito', confidence: 1 }, null);\n\t});`
  ),
  // Test 5: null item
  t => t.replace(
    `\tit('is a no-op for save/dedup behaviour when there is no extraction item at all', async () => {\n\t\tconst out = await saveReviewedInvoice(null, form({ invoiceNumber: 'DOC-NULLITEM-001' }), rid);\n\t\texpect(out.type).toBe('saved');\n\t\tif (out.type !== 'saved') return;\n\n\t\tawait assertDocumentType(out.invoiceId, null);\n\t});`,
    `\tit('is a no-op for save/dedup behaviour when there is no extraction item at all', async () => {\n\t\tawait saveAndCheckDocType('DOC-NULLITEM-001', null, null);\n\t});`
  ),
]);

console.log('fix-dup4 done.');
