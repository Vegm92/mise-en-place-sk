import { readFileSync, writeFileSync } from 'fs';

const W = 'C:/Users/victo/Proyectos/in_development/mise_en_place_sk-PF/.claude/worktrees/fix-985-duplication/';

function fix(relPath, transforms) {
  const file = W + relPath;
  let t = readFileSync(file, 'utf8');
  for (const fn of transforms) t = fn(t);
  writeFileSync(file, t, 'utf8');
  console.log(`Fixed: ${relPath}`);
}

// ── batch-model.test.ts ─────────────────────────────────────────────────────
fix('tests/batch-model.test.ts', [
  // Hoist id from itemIds[0]
  t => t.replace(
    /(\t\t)const \{ itemIds: \[id\] \} = (await store\.createBatch\([^;]+\));/g,
    (_, ind, expr) => `${ind}const { itemIds } = ${expr};\n${ind}const id = itemIds[0]!;`
  ),
  t => t.replaceAll('store.markQueued(id!)', 'store.markQueued(id)'),
  t => t.replaceAll('store.markExtracting(id!)', 'store.markExtracting(id)'),
  t => t.replaceAll('store.markDone(id!, ', 'store.markDone(id, '),
  t => t.replaceAll('store.markFailed(id!, ', 'store.markFailed(id, '),
  t => t.replaceAll('store.markConfirmed(id!)', 'store.markConfirmed(id)'),
  t => t.replaceAll('store.getItem(id!)', 'store.getItem(id)'),
  t => t.replaceAll('store.markDiscarded(id!)', 'store.markDiscarded(id)'),
  t => t.replaceAll('store.requeueStalled(id!)', 'store.requeueStalled(id)'),
  t => t.replaceAll('store.removeItem(id!, ', 'store.removeItem(id, '),
  t => t.replaceAll('${id!}', '${id}'),
  t => t.replaceAll('return id!;', 'return id;'),
  // Hoist items[0]! in creation test
  t => t.replace(
    "\t\texpect(items[0]!.fileKey).toBe('ns/a.pdf');\n\t\texpect(items[0]!.restaurantId).toBe(rid);",
    "\t\tconst item0 = items[0]!;\n\t\texpect(item0.fileKey).toBe('ns/a.pdf');\n\t\texpect(item0.restaurantId).toBe(rid);"
  ),
  // Hoist itemIds[0]! and itemIds[1]! (full-array tests)
  t => t.replaceAll('itemIds[0]!', 'itemIds[0]').replaceAll('itemIds[1]!', 'itemIds[1]'),
]);

// ── invoice-save-verifactu.test.ts ──────────────────────────────────────────
fix('tests/invoice-save-verifactu.test.ts', [
  // Change const [invoiceRow] = testSql to use index access with !
  t => t.replace(
    /(\t\t)const \[invoiceRow\] = (await testSql`[^`]+`);/gs,
    (_, ind, expr) => `${ind}const invoiceRow = (${expr})[0]!;`
  ),
  t => t.replaceAll('invoiceRow!.', 'invoiceRow.'),
  // Fix notifications[0]!.payload — hoist per occurrence
  t => t.replaceAll(
    'const payload = notifications[0]!.payload;',
    'const [_notif] = notifications;\n\t\tconst payload = _notif!.payload;'
  ),
]);

// ── money-numeric-honesty.test.ts ────────────────────────────────────────────
fix('tests/money-numeric-honesty.test.ts', [
  // Change const [row] = testSql/testDb to index access
  t => t.replace(
    /(\t\t)const \[row\] = (await testSql`[^`]+`);/gs,
    (_, ind, expr) => `${ind}const row = (${expr})[0]!;`
  ),
  t => t.replace(
    /(\t\t)const \[row\] = (await testDb\b[\s\S]+?\.groupBy\(suppliers\.id\));/gs,
    (_, ind, expr) => `${ind}const row = (${expr})[0]!;`
  ),
  t => t.replace(
    /(\t\t)const \[row\] = (await testDb\b[\s\S]+?\.where\([^)]+\));/gs,
    (_, ind, expr) => `${ind}const row = (${expr})[0]!;`
  ),
  t => t.replaceAll('row!.total', 'row.total'),
  t => t.replaceAll('row!.amount', 'row.amount'),
  // Fix other ! patterns
  t => t.replaceAll('supplier!.id', 'supplier.id').replaceAll('invoice!.id', 'invoice.id'),
]);

console.log('All fixes applied.');
