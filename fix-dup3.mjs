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
fix('tests/extract.test.ts', [
  // text PDF systemInstruction test (line ~99)
  t => t.replace(
    `    const [content, , systemInstruction] = vi.mocked(generate).mock.calls[0] ?? [];\n    expect(content).not.toContain('invoice data extraction specialist');\n    expect(content).not.toContain('supplier_nif');\n    expect(systemInstruction).toContain('invoice data extraction specialist');\n    expect(systemInstruction).toContain('supplier_nif');`,
    `    const [txtContent, , txtSystem] = vi.mocked(generate).mock.calls[0] ?? [];\n    expect(txtContent).not.toContain('invoice data extraction specialist');\n    expect(txtContent).not.toContain('supplier_nif');\n    expect(txtSystem).toContain('invoice data extraction specialist');\n    expect(txtSystem).toContain('supplier_nif');`
  ),
  // scanned PDF systemInstruction test (line ~129)
  t => t.replace(
    `    const [content, , systemInstruction] = vi.mocked(generate).mock.calls[0] ?? [];\n    const parts = content as Array<unknown>;\n    expect(parts).toHaveLength(1);\n    expect(systemInstruction).toContain('invoice data extraction specialist');\n  });\n});\n\ndescribe('extractInvoice — image path'`,
    `    const [scanContent, , scanSystem] = vi.mocked(generate).mock.calls[0] ?? [];\n    const scanParts = scanContent as Array<unknown>;\n    expect(scanParts).toHaveLength(1);\n    expect(scanSystem).toContain('invoice data extraction specialist');\n  });\n});\n\ndescribe('extractInvoice — image path'`
  ),
  // image path systemInstruction test (line ~162)
  t => t.replace(
    `    const [content, , systemInstruction] = vi.mocked(generate).mock.calls[0] ?? [];\n    const parts = content as Array<unknown>;\n    expect(parts).toHaveLength(1);\n    expect(systemInstruction).toContain('invoice data extraction specialist');\n  });\n});\n\ndescribe('extractWithProvider`,
    `    const [imgContent, , imgSystem] = vi.mocked(generate).mock.calls[0] ?? [];\n    const imgParts = imgContent as Array<unknown>;\n    expect(imgParts).toHaveLength(1);\n    expect(imgSystem).toContain('invoice data extraction specialist');\n  });\n});\n\ndescribe('extractWithProvider`
  ),
  // provider text PDF test (line ~177)
  t => t.replace(
    `    const [content, , systemInstruction] = provider.generate.mock.calls[0] ?? [];\n    expect(content).not.toContain('invoice data extraction specialist');\n    expect(systemInstruction).toContain('invoice data extraction specialist');`,
    `    const [pvContent, , pvSystem] = provider.generate.mock.calls[0] ?? [];\n    expect(pvContent).not.toContain('invoice data extraction specialist');\n    expect(pvSystem).toContain('invoice data extraction specialist');`
  ),
  // provider scanned PDF test (line ~188)
  t => t.replace(
    `    const [content, , systemInstruction] = provider.generate.mock.calls[0] ?? [];\n    const parts = content as Array<unknown>;\n    expect(parts).toHaveLength(1);\n    expect(systemInstruction).toContain('invoice data extraction specialist');\n  });\n\n  it('image path`,
    `    const [pvScanContent, , pvScanSystem] = provider.generate.mock.calls[0] ?? [];\n    const pvScanParts = pvScanContent as Array<unknown>;\n    expect(pvScanParts).toHaveLength(1);\n    expect(pvScanSystem).toContain('invoice data extraction specialist');\n  });\n\n  it('image path`
  ),
  // provider image path test (line ~198)
  t => t.replace(
    `    const [content, , systemInstruction] = provider.generate.mock.calls[0] ?? [];\n    const parts = content as Array<unknown>;\n    expect(parts).toHaveLength(1);\n    expect(systemInstruction).toContain('invoice data extraction specialist');\n  });\n});\n\ndescribe('extractInvoice — response parsing'`,
    `    const [pvImgContent, , pvImgSystem] = provider.generate.mock.calls[0] ?? [];\n    const pvImgParts = pvImgContent as Array<unknown>;\n    expect(pvImgParts).toHaveLength(1);\n    expect(pvImgSystem).toContain('invoice data extraction specialist');\n  });\n});\n\ndescribe('extractInvoice — response parsing'`
  ),
]);

// ── 2. tests/invoice-save-verifactu.test.ts ──────────────────────────────────
fix('tests/invoice-save-verifactu.test.ts', [
  // test 1: "flags a real mismatch"
  t => t.replace(
    `\t\tconst invoiceRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(invoiceRow.qr_url).toBe(VALID_QR);\n\t\texpect(invoiceRow.qr_mismatch).toBe(true);\n\n\t\tconst payload = await fetchNotificationPayload(rid, out.invoiceId);\n\t\texpect(payload.mismatches)`,
    `\t\tconst mismatchRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(mismatchRow.qr_url).toBe(VALID_QR);\n\t\texpect(mismatchRow.qr_mismatch).toBe(true);\n\n\t\tconst mismatchPayload = await fetchNotificationPayload(rid, out.invoiceId);\n\t\texpect(mismatchPayload.mismatches)`
  ),
  // test 2: "flags a tampered invoice number"
  t => t.replace(
    `\t\tconst invoiceRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(invoiceRow.qr_mismatch).toBe(true);\n\n\t\tconst payload = await fetchNotificationPayload(rid, out.invoiceId);\n\t\texpect(payload.mismatches`,
    `\t\tconst tamperedRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(tamperedRow.qr_mismatch).toBe(true);\n\n\t\tconst tamperedPayload = await fetchNotificationPayload(rid, out.invoiceId);\n\t\texpect(tamperedPayload.mismatches`
  ),
  // test 3: "does not false-positive"
  t => t.replace(
    `\t\tconst invoiceRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(invoiceRow.qr_url).toBe(VALID_QR);\n\t\texpect(invoiceRow.qr_mismatch).toBe(false);`,
    `\t\tconst matchRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(matchRow.qr_url).toBe(VALID_QR);\n\t\texpect(matchRow.qr_mismatch).toBe(false);`
  ),
  // test 4: "is a no-op"
  t => t.replace(
    `\t\tconst invoiceRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(invoiceRow.qr_url).toBeNull();\n\t\texpect(invoiceRow.qr_mismatch).toBe(false);`,
    `\t\tconst noQrRow = await fetchInvoiceRow(out.invoiceId);\n\t\texpect(noQrRow.qr_url).toBeNull();\n\t\texpect(noQrRow.qr_mismatch).toBe(false);`
  ),
]);

// ── 3. tests/542-malformed-route-params.test.ts ──────────────────────────────
fix('tests/542-malformed-route-params.test.ts', [
  // Insert buildSentinelArgs helper before ROUTES array
  t => t.replace(
    'const ROUTES: RouteCase[] = [',
    `function buildSentinelArgs(id: string, sentinel: ReturnType<typeof sentinelRequest> | undefined) {
	return { params: { id }, locals: { restaurantId: RID }, request: sentinel!.request } as never;
}

const ROUTES: RouteCase[] = [`
  ),
  // /products/[id] action update
  t => t.replace(
    `\t\trun: async (id, { sentinel }) =>\n\t\t\t(await productDetail()).actions.update!(\n\t\t\t\t{ params: { id }, locals: { restaurantId: RID }, request: sentinel!.request } as never,\n\t\t\t),\n\t\tvalidEvent: () => ({ id: '5', sentinel: sentinelRequest() }),\n\t},\n\t{\n\t\tname: '/products/[id] action unlinkSupplier'`,
    `\t\trun: async (id, { sentinel }) =>\n\t\t\t(await productDetail()).actions.update!(buildSentinelArgs(id, sentinel)),\n\t\tvalidEvent: () => ({ id: '5', sentinel: sentinelRequest() }),\n\t},\n\t{\n\t\tname: '/products/[id] action unlinkSupplier'`
  ),
  // /products/[id] action unlinkSupplier
  t => t.replace(
    `\t\trun: async (id, { sentinel }) =>\n\t\t\t(await productDetail()).actions.unlinkSupplier!(\n\t\t\t\t{ params: { id }, locals: { restaurantId: RID }, request: sentinel!.request } as never,\n\t\t\t),\n\t\tvalidEvent: () => ({ id: '5', sentinel: sentinelRequest() }),\n\t},\n\t{\n\t\tname: '/products/[id] action delete'`,
    `\t\trun: async (id, { sentinel }) =>\n\t\t\t(await productDetail()).actions.unlinkSupplier!(buildSentinelArgs(id, sentinel)),\n\t\tvalidEvent: () => ({ id: '5', sentinel: sentinelRequest() }),\n\t},\n\t{\n\t\tname: '/products/[id] action delete'`
  ),
  // /suppliers/[id] action update
  t => t.replace(
    `\t\trun: async (id, { sentinel }) =>\n\t\t\t(await supplierDetail()).actions.update!(\n\t\t\t\t{ params: { id }, locals: { restaurantId: RID }, request: sentinel!.request } as never,\n\t\t\t),\n\t\tvalidEvent: () => ({ id: '5', sentinel: sentinelRequest() }),\n\t},\n\t{\n\t\tname: '/suppliers/[id] action addConversion'`,
    `\t\trun: async (id, { sentinel }) =>\n\t\t\t(await supplierDetail()).actions.update!(buildSentinelArgs(id, sentinel)),\n\t\tvalidEvent: () => ({ id: '5', sentinel: sentinelRequest() }),\n\t},\n\t{\n\t\tname: '/suppliers/[id] action addConversion'`
  ),
  // /suppliers/[id] action addConversion
  t => t.replace(
    `\t\trun: async (id, { sentinel }) =>\n\t\t\t(await supplierDetail()).actions.addConversion!(\n\t\t\t\t{ params: { id }, locals: { restaurantId: RID }, request: sentinel!.request } as never,\n\t\t\t),\n\t\tvalidEvent: () => ({ id: '5', sentinel: sentinelRequest() }),\n\t},\n\t{\n\t\tname: '/suppliers/[id] action deleteConversion'`,
    `\t\trun: async (id, { sentinel }) =>\n\t\t\t(await supplierDetail()).actions.addConversion!(buildSentinelArgs(id, sentinel)),\n\t\tvalidEvent: () => ({ id: '5', sentinel: sentinelRequest() }),\n\t},\n\t{\n\t\tname: '/suppliers/[id] action deleteConversion'`
  ),
  // /suppliers/[id] action deleteConversion
  t => t.replace(
    `\t\trun: async (id, { sentinel }) =>\n\t\t\t(await supplierDetail()).actions.deleteConversion!(\n\t\t\t\t{ params: { id }, locals: { restaurantId: RID }, request: sentinel!.request } as never,\n\t\t\t),\n\t\tvalidEvent: () => ({ id: '5', sentinel: sentinelRequest() }),\n\t},\n\t{\n\t\tname: '/suppliers/[id] action delete'`,
    `\t\trun: async (id, { sentinel }) =>\n\t\t\t(await supplierDetail()).actions.deleteConversion!(buildSentinelArgs(id, sentinel)),\n\t\tvalidEvent: () => ({ id: '5', sentinel: sentinelRequest() }),\n\t},\n\t{\n\t\tname: '/suppliers/[id] action delete'`
  ),
]);

// ── 4. tests/product-normalizer.test.ts ──────────────────────────────────────
fix('tests/product-normalizer.test.ts', [
  // Insert countSysNotifs helper before describeDb orchestration block
  t => t.replace(
    'function fakeProvider(text: string): LLMProvider {',
    `async function countSysNotifs(restaurantId: string) {
	const [row] = await testSql\`SELECT COUNT(*)::int AS cnt FROM system_notifications WHERE restaurant_id = \${restaurantId}\`;
	return (row!.cnt as number);
}

function fakeProvider(text: string): LLMProvider {`
  ),
  // Replace all 3 occurrences of the inline COUNT query
  t => t.replaceAll(
    `const count = (await testSql\`SELECT COUNT(*)::int AS cnt FROM system_notifications WHERE restaurant_id = \${rid}\`)[0]!.cnt;`,
    'const count = await countSysNotifs(rid);'
  ),
]);

// ── 5. tests/invoice-save-document-type.test.ts ───────────────────────────────
fix('tests/invoice-save-document-type.test.ts', [
  // test "stores null when extraction omits" — replace inline query with helper
  t => t.replace(
    `\t\tconst [row] = await testSql\`SELECT document_type FROM invoices WHERE id = \${out.invoiceId}\`;\n\t\texpect(row!.document_type).toBeNull();\n\t});\n\n\tit('coerces`,
    `\t\tawait assertDocumentType(out.invoiceId, null);\n\t});\n\n\tit('coerces`
  ),
  // test "coerces an unrecognised document_type value" — replace inline query
  t => t.replace(
    `\t\tconst [row] = await testSql\`SELECT document_type FROM invoices WHERE id = \${out.invoiceId}\`;\n\t\texpect(row!.document_type).toBeNull();\n\t});\n\n\tit('is a no-op`,
    `\t\tawait assertDocumentType(out.invoiceId, null);\n\t});\n\n\tit('is a no-op`
  ),
  // test "is a no-op for null item" — replace inline query
  t => t.replace(
    `\t\tconst [row] = await testSql\`SELECT document_type FROM invoices WHERE id = \${out.invoiceId}\`;\n\t\texpect(row!.document_type).toBeNull();\n\t});\n});`,
    `\t\tawait assertDocumentType(out.invoiceId, null);\n\t});\n});`
  ),
]);

// ── 6. tests/settings-alert-preferences.test.ts ──────────────────────────────
fix('tests/settings-alert-preferences.test.ts', [
  // Fix user!.id in beforeAll
  t => t.replace(
    `\tconst [user] = await testSql\`\n\t\tINSERT INTO users (email, name) VALUES (\${email}, ${'Chef'}) RETURNING id\`;\n\tuserId = user!.id;`,
    `\tconst [settingsUser] = await testSql\`\n\t\tINSERT INTO users (email, name) VALUES (\${email}, ${'Chef'}) RETURNING id\`;\n\tuserId = settingsUser!.id;`
  ),
  // Fix alert label locale test — rename table to alertTable
  t => t.replace(
    `\tit.each(['es', 'en'] as const)('has every key in %s', (locale) => {\n\t\tconst table = translations[locale] as Record<string, string>;\n\t\tconst missing = keys.filter((k) => !(k in table) || table[k]!.trim() === '');\n\t\texpect(missing).toEqual([]);\n\t});\n\n\tit('names the three groups`,
    `\tit.each(['es', 'en'] as const)('has every key in %s', (locale) => {\n\t\tconst alertTable = translations[locale] as Record<string, string>;\n\t\tconst missing = keys.filter((k) => !(k in alertTable) || alertTable[k]!.trim() === '');\n\t\texpect(missing).toEqual([]);\n\t});\n\n\tit('names the three groups`
  ),
  // Fix field visibility locale test — rename table to fieldTable
  t => t.replace(
    `\tit.each(['es', 'en'] as const)('has every key in %s', (locale) => {\n\t\tconst table = translations[locale] as Record<string, string>;\n\t\tconst missing = keys.filter((k) => !(k in table) || table[k]!.trim() === '');\n\t\texpect(missing).toEqual([]);\n\t});\n});`,
    `\tit.each(['es', 'en'] as const)('has every key in %s', (locale) => {\n\t\tconst fieldTable = translations[locale] as Record<string, string>;\n\t\tconst missing = keys.filter((k) => !(k in fieldTable) || fieldTable[k]!.trim() === '');\n\t\texpect(missing).toEqual([]);\n\t});\n});`
  ),
]);

// ── 7. src/lib/server/products.ts ────────────────────────────────────────────
fix('src/lib/server/products.ts', [
  // previewOne: hoist aliasRows[0]! into named var
  t => t.replace(
    `\tif (aliasRows.length > 0) {\n\t\treturn {\n\t\t\tdescription: raw,\n\t\t\tproductId: aliasRows[0]!.product_id,\n\t\t\tproductName: aliasRows[0]!.canonical_name,\n\t\t\tstatus: 'exact',`,
    `\tif (aliasRows.length > 0) {\n\t\tconst previewAlias = aliasRows[0]!;\n\t\treturn {\n\t\t\tdescription: raw,\n\t\t\tproductId: previewAlias.product_id,\n\t\t\tproductName: previewAlias.canonical_name,\n\t\t\tstatus: 'exact',`
  ),
  // previewOne: hoist fuzzyRows[0]! into named var
  t => t.replace(
    `\tif (fuzzyRows.length > 0) {\n\t\treturn {\n\t\t\tdescription: raw,\n\t\t\tproductId: fuzzyRows[0]!.id,\n\t\t\tproductName: fuzzyRows[0]!.canonical_name,\n\t\t\tstatus: 'fuzzy',\n\t\t\tscore: Number(fuzzyRows[0]!.score),`,
    `\tif (fuzzyRows.length > 0) {\n\t\tconst previewFuzzy = fuzzyRows[0]!;\n\t\treturn {\n\t\t\tdescription: raw,\n\t\t\tproductId: previewFuzzy.id,\n\t\t\tproductName: previewFuzzy.canonical_name,\n\t\t\tstatus: 'fuzzy',\n\t\t\tscore: Number(previewFuzzy.score),`
  ),
  // rejectProductAlias: rename alias to rejectAlias
  t => t.replace(
    `\t\tif (aliasRows.length === 0) return { ok: false, reason: 'not_found' } as AliasDecision;\n\t\tconst alias = aliasRows[0]!;\n\n\t\tconst created`,
    `\t\tif (aliasRows.length === 0) return { ok: false, reason: 'not_found' } as AliasDecision;\n\t\tconst rejectAlias = aliasRows[0]!;\n\n\t\tconst created`
  ),
  t => t.replace(
    `\t\tconst newProductId = created[0]!.id;\n\n\t\tawait tx.execute(sql\`\n\t\t\tUPDATE product_aliases\n\t\t\tSET product_id = \${newProductId}, source = 'user', confirmed_at = now(),\n\t\t\t\treview_outcome = CASE\n\t\t\t\t\tWHEN original_source = 'fuzzy' AND review_outcome IS NULL THEN 'rejected'\n\t\t\t\t\tELSE review_outcome\n\t\t\t\tEND\n\t\t\tWHERE id = \${alias.id}`,
    `\t\tconst newProductId = created[0]!.id;\n\n\t\tawait tx.execute(sql\`\n\t\t\tUPDATE product_aliases\n\t\t\tSET product_id = \${newProductId}, source = 'user', confirmed_at = now(),\n\t\t\t\treview_outcome = CASE\n\t\t\t\t\tWHEN original_source = 'fuzzy' AND review_outcome IS NULL THEN 'rejected'\n\t\t\t\t\tELSE review_outcome\n\t\t\t\tEND\n\t\t\tWHERE id = \${rejectAlias.id}`
  ),
  // Also fix raw_text usage in rejectProductAlias
  t => t.replace(
    `VALUES (\${restaurantId}, \${alias.raw_text ?? description.trim()}, \${rawKey})`,
    `VALUES (\${restaurantId}, \${rejectAlias.raw_text ?? description.trim()}, \${rawKey})`
  ),
  // mergeIntoProduct: rename alias to mergeAlias
  t => t.replace(
    `\t\tif (aliasRows.length === 0) return { ok: false, reason: 'not_found' } as AliasDecision;\n\t\tconst alias = aliasRows[0]!;\n\t\tconst oldProductId = alias.product_id;`,
    `\t\tif (aliasRows.length === 0) return { ok: false, reason: 'not_found' } as AliasDecision;\n\t\tconst mergeAlias = aliasRows[0]!;\n\t\tconst oldProductId = mergeAlias.product_id;`
  ),
  // Fix alias.id usages in mergeIntoProduct
  t => t.replace(/(\t\t\tWHERE id = \$\{alias\.id\})/g, (m, s) => s.replace('alias.id', 'mergeAlias.id')),
]);

// ── 8. tests/money-numeric-honesty.test.ts ───────────────────────────────────
fix('tests/money-numeric-honesty.test.ts', [
  // test 1 (control: uncast numeric)
  t => t.replace(
    `\t\tconst row = (await testSql\`\n\t\t\tSELECT COALESCE(SUM(total_amount), 0) AS total FROM invoices WHERE restaurant_id = \${restaurantId}\n\t\t\`)[0]!;\n\t\texpect(typeof row.total).toBe('string');\n\t\texpect(row.total).toBe('99.99');`,
    `\t\tconst sqlRow = (await testSql\`\n\t\t\tSELECT COALESCE(SUM(total_amount), 0) AS total FROM invoices WHERE restaurant_id = \${restaurantId}\n\t\t\`)[0]!;\n\t\texpect(typeof sqlRow.total).toBe('string');\n\t\texpect(sqlRow.total).toBe('99.99');`
  ),
  // test 2 (fixed: SUM cast ::float8)
  t => t.replace(
    `\t\tconst row = (await testSql\`\n\t\t\tSELECT COALESCE(SUM(total_amount), 0)::float8 AS total FROM invoices WHERE restaurant_id = \${restaurantId}\n\t\t\`)[0]!;\n\t\texpect(typeof row.total).toBe('number');\n\t\texpect(row.total).toBe(99.99);\n\t});\n\n\tit('supplierTotalSpendExpr`,
    `\t\tconst float8Row = (await testSql\`\n\t\t\tSELECT COALESCE(SUM(total_amount), 0)::float8 AS total FROM invoices WHERE restaurant_id = \${restaurantId}\n\t\t\`)[0]!;\n\t\texpect(typeof float8Row.total).toBe('number');\n\t\texpect(float8Row.total).toBe(99.99);\n\t});\n\n\tit('supplierTotalSpendExpr`
  ),
]);

// ── 9. tests/product-catalog.test.ts ─────────────────────────────────────────
fix('tests/product-catalog.test.ts', [
  // test 1 "stamps units_per_pack"
  t => t.replace(
    `\t\tconst [prod] = await testSql\`\n\t\t\tSELECT units_per_pack, base_unit FROM products WHERE restaurant_id = \${rid} AND id = \${r.productId}\`;\n\t\texpect(prod!.units_per_pack).toBe(6);\n\t\texpect(prod!.base_unit).toBe('L');`,
    `\t\tconst [packProd] = await testSql\`\n\t\t\tSELECT units_per_pack, base_unit FROM products WHERE restaurant_id = \${rid} AND id = \${r.productId}\`;\n\t\texpect(packProd!.units_per_pack).toBe(6);\n\t\texpect(packProd!.base_unit).toBe('L');`
  ),
  // test 2 "leaves units_per_pack null"
  t => t.replace(
    `\t\tconst [prod] = await testSql\`\n\t\t\tSELECT units_per_pack, base_unit FROM products WHERE restaurant_id = \${rid} AND id = \${r.productId}\`;\n\t\texpect(prod!.units_per_pack).toBeNull();\n\t\texpect(prod!.base_unit).toBeNull();`,
    `\t\tconst [nullProd] = await testSql\`\n\t\t\tSELECT units_per_pack, base_unit FROM products WHERE restaurant_id = \${rid} AND id = \${r.productId}\`;\n\t\texpect(nullProd!.units_per_pack).toBeNull();\n\t\texpect(nullProd!.base_unit).toBeNull();`
  ),
]);

// ── 10. tests/sentry-api.test.ts ─────────────────────────────────────────────
fix('tests/sentry-api.test.ts', [
  // test 1 "EU default"
  t => t.replace(
    `\t\tconst [url] = fetchMock.mock.calls[0]!;\n\t\texpect(url).toBe(\n\t\t\t'https://de.sentry.io/api/0/organizations/my-org/issues/?query=is:unresolved&sort=freq&limit=10',`,
    `\t\tconst [euUrl] = fetchMock.mock.calls[0]!;\n\t\texpect(euUrl).toBe(\n\t\t\t'https://de.sentry.io/api/0/organizations/my-org/issues/?query=is:unresolved&sort=freq&limit=10',`
  ),
  // test 2 "overridden region"
  t => t.replace(
    `\t\tconst [url] = fetchMock.mock.calls[0]!;\n\t\texpect(url).toBe(\n\t\t\t'https://sentry.io/api/0/organizations/my-org/issues/?query=is:unresolved&sort=freq&limit=10',`,
    `\t\tconst [overrideUrl] = fetchMock.mock.calls[0]!;\n\t\texpect(overrideUrl).toBe(\n\t\t\t'https://sentry.io/api/0/organizations/my-org/issues/?query=is:unresolved&sort=freq&limit=10',`
  ),
]);

// ── 11. tests/settings-profile.test.ts ───────────────────────────────────────
fix('tests/settings-profile.test.ts', [
  // saveEmail rate-limit test — rename result
  t => t.replace(
    `\t\tconst result = await actions.saveEmail!(formEvent({ email: 'new@example.com' }));\n\t\texpect(result).toMatchObject({ status: 429, data: { error: 'set.profile.err.rateLimited' } });\n\t\texpect(rateLimitMock).toHaveBeenCalledWith('email-change:user:user-1', 5);`,
    `\t\tconst emailRateLimitResult = await actions.saveEmail!(formEvent({ email: 'new@example.com' }));\n\t\texpect(emailRateLimitResult).toMatchObject({ status: 429, data: { error: 'set.profile.err.rateLimited' } });\n\t\texpect(rateLimitMock).toHaveBeenCalledWith('email-change:user:user-1', 5);`
  ),
  // saveEmail per-address rate-limit test — rename result
  t => t.replace(
    `\t\tconst result = await actions.saveEmail!(formEvent({ email: 'new@example.com' }));\n\t\texpect(result).toMatchObject({ status: 429, data: { error: 'set.profile.err.rateLimited' } });\n\t\texpect(rateLimitMock).toHaveBeenCalledWith('email-change:address:new@example.com', 5);`,
    `\t\tconst emailAddrRateResult = await actions.saveEmail!(formEvent({ email: 'new@example.com' }));\n\t\texpect(emailAddrRateResult).toMatchObject({ status: 429, data: { error: 'set.profile.err.rateLimited' } });\n\t\texpect(rateLimitMock).toHaveBeenCalledWith('email-change:address:new@example.com', 5);`
  ),
  // changePassword rate-limit test — rename result
  t => t.replace(
    `\t\tconst result = await actions.changePassword!(formEvent(good));\n\t\texpect(result).toMatchObject({ status: 429, data: { error: 'set.profile.err.rateLimited' } });\n\t\texpect(rateLimitMock).toHaveBeenCalledWith('password-change:user-1', 5);`,
    `\t\tconst pwRateLimitResult = await actions.changePassword!(formEvent(good));\n\t\texpect(pwRateLimitResult).toMatchObject({ status: 429, data: { error: 'set.profile.err.rateLimited' } });\n\t\texpect(rateLimitMock).toHaveBeenCalledWith('password-change:user-1', 5);`
  ),
]);

// ── 12. tests/signup.test.ts ─────────────────────────────────────────────────
fix('tests/signup.test.ts', [
  // "sends nothing for a non-existent account" test
  t => t.replace(
    `\t\tconst result = await actions.resend!(signupEvent(RESEND));\n\t\texpect(result).toEqual({ success: true, email: RESEND.email, resent: true });\n\t\texpect(sendEmailMock).not.toHaveBeenCalled();\n\t});\n\n\tit('sends nothing for an already-verified`,
    `\t\tconst nonExistResult = await actions.resend!(signupEvent(RESEND));\n\t\texpect(nonExistResult).toEqual({ success: true, email: RESEND.email, resent: true });\n\t\texpect(sendEmailMock).not.toHaveBeenCalled();\n\t});\n\n\tit('sends nothing for an already-verified`
  ),
  // "sends nothing for an already-verified" test
  t => t.replace(
    `\t\tconst result = await actions.resend!(signupEvent(RESEND));\n\t\texpect(result).toEqual({ success: true, email: RESEND.email, resent: true });\n\t\texpect(sendEmailMock).not.toHaveBeenCalled();\n\t});\n\n\tit('resends for an existing`,
    `\t\tconst alreadyVerifiedResult = await actions.resend!(signupEvent(RESEND));\n\t\texpect(alreadyVerifiedResult).toEqual({ success: true, email: RESEND.email, resent: true });\n\t\texpect(sendEmailMock).not.toHaveBeenCalled();\n\t});\n\n\tit('resends for an existing`
  ),
]);

// ── 13. tests/sitemap-robots.test.ts ─────────────────────────────────────────
fix('tests/sitemap-robots.test.ts', [
  // test "sitemap <loc> uses APP_BASE_URL" — rename locs
  t => t.replace(
    `\t\tconst locs = await withConfiguredOrigin(CONFIGURED, async ({ sitemapGet: get }) => {\n\t\t\tconst xml = await (await get(fakeEvent(REQUEST_HOST))).text();\n\t\t\treturn [...xml.matchAll(/<loc>([^<]+)<\\/loc>/g)].map((m) => m[1]);\n\t\t});\n\t\texpect(locs.length).toBeGreaterThan(0);\n\t\tfor (const loc of locs) {\n\t\t\texpect(loc!.startsWith(\`\${CONFIGURED}/\`),`,
    `\t\tconst configuredLocs = await withConfiguredOrigin(CONFIGURED, async ({ sitemapGet: get }) => {\n\t\t\tconst xml = await (await get(fakeEvent(REQUEST_HOST))).text();\n\t\t\treturn [...xml.matchAll(/<loc>([^<]+)<\\/loc>/g)].map((m) => m[1]);\n\t\t});\n\t\texpect(configuredLocs.length).toBeGreaterThan(0);\n\t\tfor (const loc of configuredLocs) {\n\t\t\texpect(loc!.startsWith(\`\${CONFIGURED}/\`),`
  ),
  t => t.replace(
    `\t\texpect(locs.join('\\n')).not.toContain(REQUEST_HOST);`,
    `\t\texpect(configuredLocs.join('\\n')).not.toContain(REQUEST_HOST);`
  ),
  // test "falls back to request origin" — rename locs
  t => t.replace(
    `\t\tconst locs = await withConfiguredOrigin('', async ({ sitemapGet: get }) => {\n\t\t\tconst xml = await (await get(fakeEvent(REQUEST_HOST))).text();\n\t\t\treturn [...xml.matchAll(/<loc>([^<]+)<\\/loc>/g)].map((m) => m[1]);\n\t\t});\n\t\texpect(locs.length).toBeGreaterThan(0);\n\t\tfor (const loc of locs) {\n\t\t\texpect(loc!.startsWith(\`\${REQUEST_HOST}/\`)).toBe(true);`,
    `\t\tconst fallbackLocs = await withConfiguredOrigin('', async ({ sitemapGet: get }) => {\n\t\t\tconst xml = await (await get(fakeEvent(REQUEST_HOST))).text();\n\t\t\treturn [...xml.matchAll(/<loc>([^<]+)<\\/loc>/g)].map((m) => m[1]);\n\t\t});\n\t\texpect(fallbackLocs.length).toBeGreaterThan(0);\n\t\tfor (const loc of fallbackLocs) {\n\t\t\texpect(loc!.startsWith(\`\${REQUEST_HOST}/\`)).toBe(true);`
  ),
]);

// ── 14. tests/whatsapp-api.test.ts ───────────────────────────────────────────
fix('tests/whatsapp-api.test.ts', [
  // test 1 "posts to configured Graph API version" — rename [url, init]
  t => t.replace(
    `\t\tconst [url, init] = fetchMock.mock.calls[0]!;\n\t\texpect(url).toBe('https://graph.facebook.com/v25.0/123456/messages');`,
    `\t\tconst [apiUrl, apiInit] = fetchMock.mock.calls[0]!;\n\t\texpect(apiUrl).toBe('https://graph.facebook.com/v25.0/123456/messages');`
  ),
  t => t.replace(
    `\t\texpect(init.headers.Authorization).toBe('Bearer test-token');\n\t\texpect(JSON.parse(init.body))`,
    `\t\texpect(apiInit.headers.Authorization).toBe('Bearer test-token');\n\t\texpect(JSON.parse(apiInit.body))`
  ),
  // test 2 "never targets expired" — rename url
  t => t.replace(
    `\t\tconst url = String(fetchMock.mock.calls[0]![0]);\n\t\tconst version = Number(url.match`,
    `\t\tconst versionUrl = String(fetchMock.mock.calls[0]![0]);\n\t\tconst version = Number(versionUrl.match`
  ),
]);

// ── 15. tests/whatsapp-webhook.test.ts ───────────────────────────────────────
fix('tests/whatsapp-webhook.test.ts', [
  // Change "tolerates a malformed envelope" assertion to toHaveBeenCalledTimes(0)
  t => t.replace(
    `\tit('tolerates a malformed envelope without throwing', async () => {\n\t\tconst res = await POST(postEvent({ not: 'what we expect' }));\n\t\texpect(res.status).toBe(200);\n\t\texpect(handleMock).not.toHaveBeenCalled();\n\t});`,
    `\tit('tolerates a malformed envelope without throwing', async () => {\n\t\tconst res = await POST(postEvent({ not: 'what we expect' }));\n\t\texpect(res.status).toBe(200);\n\t\texpect(handleMock).toHaveBeenCalledTimes(0);\n\t});`
  ),
]);

// ── 16. tests/chat-endpoint.test.ts ──────────────────────────────────────────
fix('tests/chat-endpoint.test.ts', [
  // Hoist rows[0]! to a named variable
  t => t.replace(
    `\t\texpect(rows).toHaveLength(1);\n\t\texpect(rows[0]!.restaurant_id).toBe(rid);\n\t\texpect(rows[0]!.model).toBe('gemini-test');\n\t\texpect(rows[0]!.input_tokens).toBe(111);\n\t\texpect(rows[0]!.output_tokens).toBe(22);\n\t\texpect(rows[0]!.caller_context).toBe('chat');`,
    `\t\texpect(rows).toHaveLength(1);\n\t\tconst chatLog = rows[0]!;\n\t\texpect(chatLog.restaurant_id).toBe(rid);\n\t\texpect(chatLog.model).toBe('gemini-test');\n\t\texpect(chatLog.input_tokens).toBe(111);\n\t\texpect(chatLog.output_tokens).toBe(22);\n\t\texpect(chatLog.caller_context).toBe('chat');`
  ),
]);

// ── 17. tests/weekly-digest.test.ts ──────────────────────────────────────────
fix('tests/weekly-digest.test.ts', [
  // Hoist rows[0]! to a named variable
  t => t.replace(
    `\t\texpect(rows).toHaveLength(1);\n\t\texpect(rows[0]!.restaurant_id).toBe(rid);\n\t\texpect(rows[0]!.model).toBe('gemini-digest');\n\t\texpect(rows[0]!.input_tokens).toBe(555);\n\t\texpect(rows[0]!.output_tokens).toBe(77);\n\t\texpect(rows[0]!.caller_context).toBe('weekly-digest');`,
    `\t\texpect(rows).toHaveLength(1);\n\t\tconst digestLog = rows[0]!;\n\t\texpect(digestLog.restaurant_id).toBe(rid);\n\t\texpect(digestLog.model).toBe('gemini-digest');\n\t\texpect(digestLog.input_tokens).toBe(555);\n\t\texpect(digestLog.output_tokens).toBe(77);\n\t\texpect(digestLog.caller_context).toBe('weekly-digest');`
  ),
]);

// ── 18. tests/budgets.test.ts ────────────────────────────────────────────────
fix('tests/budgets.test.ts', [
  // test 1 "inserts a budget" — rename cat to insertCat, rows to insertRows
  t => t.replace(
    `\t\tconst cat = VALID_CATEGORIES[0]!;\n\t\tawait testDb.insert(categoryBudgets)\n\t\t\t.values({ restaurantId: rid1, category: cat, month: MONTH, monthlyBudget: '1500.00' })\n\t\t\t.onConflictDoUpdate({\n\t\t\t\ttarget: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],\n\t\t\t\tset: { monthlyBudget: '1500.00' },\n\t\t\t});\n\n\t\tconst rows = await testDb.select().from(categoryBudgets)\n\t\t\t.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, cat)));\n\n\t\texpect(rows).toHaveLength(1);\n\t\texpect(rows[0]!.monthlyBudget).toBe('1500.00');`,
    `\t\tconst insertCat = VALID_CATEGORIES[0]!;\n\t\tawait testDb.insert(categoryBudgets)\n\t\t\t.values({ restaurantId: rid1, category: insertCat, month: MONTH, monthlyBudget: '1500.00' })\n\t\t\t.onConflictDoUpdate({\n\t\t\t\ttarget: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],\n\t\t\t\tset: { monthlyBudget: '1500.00' },\n\t\t\t});\n\n\t\tconst insertRows = await testDb.select().from(categoryBudgets)\n\t\t\t.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, insertCat)));\n\n\t\texpect(insertRows).toHaveLength(1);\n\t\texpect(insertRows[0]!.monthlyBudget).toBe('1500.00');`
  ),
  // test 2 "updates an existing budget" — rename cat to updateCat, rows to updateRows
  t => t.replace(
    `\t\tconst cat = VALID_CATEGORIES[0]!;\n\t\tawait testDb.insert(categoryBudgets)\n\t\t\t.values({ restaurantId: rid1, category: cat, month: MONTH, monthlyBudget: '2000.00' })\n\t\t\t.onConflictDoUpdate({\n\t\t\t\ttarget: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],\n\t\t\t\tset: { monthlyBudget: '2000.00' },\n\t\t\t});\n\n\t\tconst rows = await testDb.select().from(categoryBudgets)\n\t\t\t.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, cat)));\n\n\t\texpect(rows).toHaveLength(1);\n\t\texpect(rows[0]!.monthlyBudget).toBe('2000.00');`,
    `\t\tconst updateCat = VALID_CATEGORIES[0]!;\n\t\tawait testDb.insert(categoryBudgets)\n\t\t\t.values({ restaurantId: rid1, category: updateCat, month: MONTH, monthlyBudget: '2000.00' })\n\t\t\t.onConflictDoUpdate({\n\t\t\t\ttarget: [categoryBudgets.restaurantId, categoryBudgets.category, categoryBudgets.month],\n\t\t\t\tset: { monthlyBudget: '2000.00' },\n\t\t\t});\n\n\t\tconst updateRows = await testDb.select().from(categoryBudgets)\n\t\t\t.where(and(eq(categoryBudgets.restaurantId, rid1), eq(categoryBudgets.category, updateCat)));\n\n\t\texpect(updateRows).toHaveLength(1);\n\t\texpect(updateRows[0]!.monthlyBudget).toBe('2000.00');`
  ),
]);

// ── 19. tests/alert-engine-price-history.test.ts ─────────────────────────────
fix('tests/alert-engine-price-history.test.ts', [
  // Hoist alerts[0]! to named var
  t => t.replace(
    `\t\texpect(alerts[0]!.payload.oldPrice).toBeCloseTo(1.00, 2);\n\t\texpect(alerts[0]!.payload.newPrice).toBe(1.50);`,
    `\t\tconst priceAlert = alerts[0]!;\n\t\texpect(priceAlert.payload.oldPrice).toBeCloseTo(1.00, 2);\n\t\texpect(priceAlert.payload.newPrice).toBe(1.50);`
  ),
]);

console.log('All fixes applied.');
