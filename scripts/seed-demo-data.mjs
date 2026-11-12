#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seeds a local database with one approved user and enough tenant data for the
 * app routes to render non-empty. Used by scripts/mobile-tap-target-audit.mjs; never run
 * against anything but a local Postgres.
 *
 * Usage: node scripts/seed-demo-data.mjs
 * Reads DATABASE_URL from .env. Idempotent: re-running reuses the same rows.
 */
import 'dotenv/config';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';
import {
	OLIVE_OIL,
	documentNumberFor,
	documentTypeFor,
	invoiceTotals,
	lineDescription,
	lineTotal,
	normalizeAliasKey,
	oliveOilPriceFor,
	supplierSku,
} from './seed-demo-fixtures.mjs';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1', 'host.docker.internal'].includes(host)) {
	throw new Error(`refusing to seed a non-local database: ${host}`);
}

export const DEMO_EMAIL = 'test@example.com';
export const DEMO_PASSWORD = 'Test1234!';

const sql = postgres(url, { ssl: false, max: 1 });

const CATEGORIES = [
	'Frutas y Verduras',
	'Carnes y Derivados',
	'Pescados y Mariscos',
	'Lácteos',
	'Bebidas',
	'Panadería y Bollería',
];
const UNITS = ['kg', 'ud', 'l', 'caja'];

function isoDay(offset) {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + offset);
	return d.toISOString().slice(0, 10);
}

function monthKey(offset) {
	const d = new Date();
	d.setUTCDate(1);
	d.setUTCMonth(d.getUTCMonth() + offset);
	return d.toISOString().slice(0, 7);
}

async function main() {
	const [restaurant] = await sql`
		INSERT INTO restaurants (name, slug)
		VALUES ('Demo Bistro', 'demo-bistro')
		ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
		RETURNING id`;
	const rid = restaurant.id;

	const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
	const [user] = await sql`
		INSERT INTO users (email, name, password_hash, email_verified, access_status)
		VALUES (${DEMO_EMAIL}, 'Demo User', ${hash}, NOW(), 'approved')
		ON CONFLICT (email) DO UPDATE
			SET password_hash = EXCLUDED.password_hash,
			    email_verified = NOW(),
			    access_status = 'approved'
		RETURNING id`;

	await sql`
		INSERT INTO user_restaurants (user_id, restaurant_id, role)
		VALUES (${user.id}, ${rid}, 'owner')
		ON CONFLICT (user_id, restaurant_id) DO UPDATE SET role = 'owner'`;

	const settings = [
		['has_completed_onboarding', 'true'],
		['locale', 'es'],
		['tutorial_step', 'done'],
		['monthly_budget', '18000'],
		['alert_price_shock_pct', '15'],
	];
	for (const [key, value] of settings) {
		await sql`
			INSERT INTO settings (restaurant_id, key, value)
			VALUES (${rid}, ${key}, ${value})
			ON CONFLICT (restaurant_id, key) DO UPDATE SET value = EXCLUDED.value`;
	}

	await sql`
		INSERT INTO subscriptions (restaurant_id, plan_tier, status, current_period_end)
		VALUES (${rid}, 'business', 'active', NOW() + INTERVAL '30 days')
		ON CONFLICT (restaurant_id) DO UPDATE
			SET plan_tier = 'business', status = 'active', current_period_end = NOW() + INTERVAL '30 days'`;

	const supplierIds = [];
	for (let i = 0; i < 8; i++) {
		const name = `Proveedor ${String.fromCharCode(65 + i)}`;
		const [row] = await sql`
			INSERT INTO suppliers (restaurant_id, name, category, contact_email, contact_phone, cif, payment_terms, delivery_days, outstanding_balance)
			VALUES (${rid}, ${name}, ${CATEGORIES[i % CATEGORIES.length]},
			        ${`ventas${i}@proveedor.example`}, ${`+34 600 000 0${i}0`},
			        ${`B0000000${i}`}, ${'30'}, ${'lun,mie,vie'}, ${(i * 137.5).toFixed(2)})
			ON CONFLICT (restaurant_id, lower(name)) DO UPDATE SET category = EXCLUDED.category
			RETURNING id`;
		supplierIds.push(row.id);
	}

	const productIds = [];
	for (let i = 0; i < 24; i++) {
		const canonical = `Producto ${i + 1}`;
		const [row] = await sql`
			INSERT INTO products (restaurant_id, canonical_name, name_key, category, canonical_unit, base_unit, units_per_pack)
			VALUES (${rid}, ${canonical}, ${`producto-${i + 1}`}, ${CATEGORIES[i % CATEGORIES.length]},
			        ${UNITS[i % UNITS.length]}, ${UNITS[i % UNITS.length]}, ${1})
			ON CONFLICT (restaurant_id, name_key) DO UPDATE SET category = EXCLUDED.category
			RETURNING id`;
		productIds.push(row.id);
	}

	const [olive] = await sql`
		INSERT INTO products (restaurant_id, canonical_name, name_key, category, canonical_unit, base_unit, units_per_pack)
		VALUES (${rid}, ${OLIVE_OIL.canonical}, ${OLIVE_OIL.nameKey}, ${OLIVE_OIL.category},
		        ${OLIVE_OIL.unit}, ${OLIVE_OIL.unit}, ${1})
		ON CONFLICT (restaurant_id, name_key) DO UPDATE SET category = EXCLUDED.category
		RETURNING id`;
	const aliases = new Map();

	const statuses = ['confirmed', 'pending', 'exported', 'confirmed', 'pending'];
	for (let i = 0; i < 30; i++) {
		const supplierId = supplierIds[i % supplierIds.length];
		const status = statuses[i % statuses.length];
		const invoiceDate = isoDay(-(i * 3));
		const dueDate = isoDay(-(i * 3) + (i % 4 === 0 ? -5 : 25));
		const supplierIndex = i % supplierIds.length;
		const lines = [];
		for (let j = 0; j < 4; j++) {
			const productIndex = (i * 4 + j) % productIds.length;
			const sku = supplierSku(supplierIndex, productIndex + 1);
			const unitPrice = 3.5 + ((i + j) % 11);
			lines.push({
				productId: productIds[productIndex],
				sku,
				description: lineDescription(`Producto ${productIndex + 1}`, sku),
				qty: 1 + ((i + j) % 9),
				unit: UNITS[j % UNITS.length],
				unitPrice,
			});
		}
		const olivePrice = oliveOilPriceFor(i);
		if (olivePrice !== null) {
			const sku = supplierSku(supplierIndex, productIds.length + 1);
			lines.push({
				productId: olive.id,
				sku,
				description: lineDescription(OLIVE_OIL.canonical, sku),
				qty: OLIVE_OIL.quantity,
				unit: OLIVE_OIL.unit,
				unitPrice: olivePrice,
			});
		}
		for (const line of lines) line.total = lineTotal(line.qty, line.unitPrice);
		const totals = invoiceTotals(lines.map((l) => l.total));
		const [inv] = await sql`
			INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, due_date,
			                      total_amount, tax_base, tax_breakdown, status, confidence, content_hash, document_type)
			VALUES (${rid}, ${supplierId}, ${documentNumberFor(i)}, ${invoiceDate}, ${dueDate},
			        ${totals.totalAmount}, ${totals.taxBase}, ${totals.taxBreakdown}, ${status}, ${0.92},
			        ${`seed-hash-${i}`}, ${documentTypeFor(i)})
			ON CONFLICT (restaurant_id, content_hash) WHERE content_hash IS NOT NULL AND deleted_at IS NULL
			DO UPDATE SET status = EXCLUDED.status, due_date = EXCLUDED.due_date,
			              invoice_number = EXCLUDED.invoice_number, invoice_date = EXCLUDED.invoice_date,
			              total_amount = EXCLUDED.total_amount, tax_base = EXCLUDED.tax_base,
			              tax_breakdown = EXCLUDED.tax_breakdown, document_type = EXCLUDED.document_type
			RETURNING id`;

		await sql`DELETE FROM invoice_line_items WHERE invoice_id = ${inv.id}`;
		for (const line of lines) {
			await sql`
				INSERT INTO invoice_line_items (restaurant_id, invoice_id, description, quantity, unit,
				                                unit_price, total_price, tax_rate, product_id, base_unit,
				                                normalized_unit_price, supplier_sku)
				VALUES (${rid}, ${inv.id}, ${line.description},
				        ${line.qty}, ${line.unit}, ${line.unitPrice.toFixed(2)},
				        ${line.total}, ${10}, ${line.productId},
				        ${line.unit}, ${line.unitPrice.toFixed(2)}, ${line.sku})`;
			aliases.set(`${line.productId}|${supplierId}`, { ...line, supplierId });
		}
	}

	for (const alias of aliases.values()) {
		await sql`
			INSERT INTO product_aliases (restaurant_id, product_id, supplier_id, raw_key, raw_text, supplier_sku,
			                             source, original_source, confirmed_at)
			VALUES (${rid}, ${alias.productId}, ${alias.supplierId}, ${normalizeAliasKey(alias.description)},
			        ${alias.description}, ${alias.sku}, 'exact', 'exact', NOW())
			ON CONFLICT (restaurant_id, raw_key) DO UPDATE
				SET product_id = EXCLUDED.product_id, supplier_id = EXCLUDED.supplier_id,
				    supplier_sku = EXCLUDED.supplier_sku, raw_text = EXCLUDED.raw_text`;
	}

	for (const offset of [-1, 0]) {
		const month = monthKey(offset);
		for (const [i, category] of CATEGORIES.entries()) {
			await sql`
				INSERT INTO category_budgets (restaurant_id, category, monthly_budget, month)
				VALUES (${rid}, ${category}, ${(800 + i * 350).toFixed(2)}, ${month})
				ON CONFLICT (restaurant_id, category, month) DO UPDATE SET monthly_budget = EXCLUDED.monthly_budget`;
		}
	}

	const canned = await sql`
		SELECT id FROM chat_sessions WHERE restaurant_id = ${rid} AND title = 'Consultas de compras'`;
	for (const { id } of canned) {
		await sql`DELETE FROM chat_messages WHERE session_id = ${id}`;
		await sql`DELETE FROM chat_sessions WHERE id = ${id}`;
	}

	await sql`SELECT refresh_analytics_rollups()`;
	await sql`
		INSERT INTO app_flags (key, value)
		VALUES ('analytics_rollup_refreshed_at', ${new Date().toISOString()})
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`;

	console.log(`seeded restaurant ${rid} for ${DEMO_EMAIL}`);
	await sql.end();
}

main().catch(async (err) => {
	console.error(err);
	await sql.end();
	process.exit(1);
});
