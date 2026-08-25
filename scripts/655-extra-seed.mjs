#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Issue #655 verification data. Copy of the scripts/seed-demo-data.mjs invoice
 * loop, adjusted to push the tenant past one /invoices page (PAGE_SIZE = 50)
 * with 'overdue' and 'paid' rows whose created_at rank them beyond page 1 of
 * the default uploaded_desc listing. Idempotent via content_hash upserts.
 *
 * Usage: node scripts/655-extra-seed.mjs
 */
import 'dotenv/config';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
	throw new Error(`refusing to seed a non-local database: ${host}`);
}

const sql = postgres(url, { ssl: false, max: 1 });

const EXTRA_COUNT = 45;
const STATUSES = ['overdue', 'paid', 'pending'];

function isoDay(offset) {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + offset);
	return d.toISOString().slice(0, 10);
}

async function main() {
	const [restaurant] = await sql`SELECT id FROM restaurants WHERE slug = 'demo-bistro'`;
	if (!restaurant) throw new Error('run scripts/seed-demo-data.mjs first');
	const rid = restaurant.id;
	const supplierRows = await sql`SELECT id FROM suppliers WHERE restaurant_id = ${rid} ORDER BY id`;
	const supplierIds = supplierRows.map(r => r.id);

	for (let i = 0; i < EXTRA_COUNT; i++) {
		const supplierId = supplierIds[i % supplierIds.length];
		const status = STATUSES[i % STATUSES.length];
		const invoiceDate = isoDay(-(i * 2));
		const dueDate = isoDay(-(i * 2) - (status === 'overdue' ? 10 : -25));
		const total = 150 + i * 21.4;
		const createdAt = new Date(Date.now() - (24 + i) * 3600 * 1000);
		await sql`
			INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, due_date,
			                      total_amount, tax_base, status, confidence, content_hash, document_type, created_at)
			VALUES (${rid}, ${supplierId}, ${`X-2026-${2000 + i}`}, ${invoiceDate}, ${dueDate},
			        ${total.toFixed(2)}, ${(total / 1.1).toFixed(2)}, ${status}, ${0.92},
			        ${`655-extra-hash-${i}`}, ${'invoice'}, ${createdAt})
			ON CONFLICT (restaurant_id, content_hash) WHERE content_hash IS NOT NULL AND deleted_at IS NULL
			DO UPDATE SET status = EXCLUDED.status, due_date = EXCLUDED.due_date, created_at = EXCLUDED.created_at`;
	}

	const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM invoices WHERE restaurant_id = ${rid} AND deleted_at IS NULL`;
	const [{ overdue }] = await sql`SELECT COUNT(*)::int AS overdue FROM invoices WHERE restaurant_id = ${rid} AND deleted_at IS NULL AND status = 'overdue'`;
	const ranked = await sql`
		SELECT rank, invoice_number FROM (
			SELECT ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rank, invoice_number, status
			FROM invoices WHERE restaurant_id = ${rid} AND deleted_at IS NULL
		) t WHERE status = 'overdue' AND rank > 50 ORDER BY rank LIMIT 5`;
	console.log(`total=${count} overdue=${overdue}`);
	console.log('overdue rows ranked beyond page 1 (uploaded_desc):', ranked.map(r => `#${r.rank} ${r.invoice_number}`).join(', '));
	await sql.end();
}

main().catch(async (err) => {
	console.error(err);
	await sql.end();
	process.exit(1);
});
