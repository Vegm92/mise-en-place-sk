// Seeds a local database with an admin user plus enough rows for every admin
// console table to render. Used by scripts/admin-mobile-audit.mjs (issue #657).
//
//   AUTH_ADMIN_EMAIL=admin@mep.test AUTH_ADMIN_PASSWORD='Test1234!' \
//     node scripts/admin-mobile-audit-seed.mjs
//
// Admin access is gated on AUTH_ADMIN_EMAIL (src/lib/server/admin.ts), so the
// seeded address must match the value the dev server runs with.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import bcrypt from 'bcryptjs';

const ROOT = path.resolve(import.meta.dirname, '..');

function loadEnvFile() {
	try {
		for (const line of readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
			const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
			if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
		}
	} catch { /* no .env — rely on the ambient environment */ }
}

loadEnvFile();

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL = process.env.AUTH_ADMIN_EMAIL || 'admin@mep.test';
const ADMIN_PASSWORD = process.env.AUTH_ADMIN_PASSWORD || 'Test1234!';

if (!DATABASE_URL) {
	console.error('[seed] DATABASE_URL is not set');
	process.exit(1);
}

const sql = postgres(DATABASE_URL, { max: 1 });

const RESTAURANT_NAMES = [
	'Taberna del Puerto Viejo',
	'Casa Manolo Arganzuela',
	'La Cocina de Rosalía Hostelería SL',
	'Bar Restaurante El Mirador de Chamberí',
	'Grupo Gastronómico Mediterráneo',
	'Asador Los Robles',
];

const EVENT_TYPES = [
	'price_shock', 'budget_overage', 'invoice_saved', 'invoice_corrected',
	'extraction_failed', 'supplier_missing', 'file_uploaded', 'duplicate_detected',
];

const EVENT_MESSAGES = [
	'El precio del tomate pera subió un 34% respecto a la última factura de este proveedor',
	'Presupuesto de la categoría carnes superado en 412,50 € para el mes en curso',
	'Factura FRA-2026-000184 guardada con 12 líneas y confianza media del 0,94',
	'Extracción fallida: el PDF no contiene texto seleccionable y el OCR agotó el tiempo',
	'Proveedor no reconocido en la factura subida por WhatsApp desde +34 600 111 222',
	'Duplicado detectado: misma referencia y mismo importe que la factura FRA-2026-000091',
];

const QUEUES = ['extract-invoice', 'send-digest', 'whatsapp-inbound', 'stripe-sync'];

const ERRORS = [
	['GeminiTimeoutError', 'Gemini did not answer within 45000 ms for batch item 8f21c9d4-4e0a-4a3b-9f2e-1c77b3e5a9d0 (attempt 3 of 3)'],
	['InvoiceSaveConflict', 'duplicate key value violates unique constraint "invoices_restaurant_content_hash_idx" while saving supplier invoice'],
	['WhatsAppMediaError', 'Media download returned 410 Gone for media id 1029384756102938 — the Meta media URL had already expired'],
	['StripeSyncError', 'No local subscription row for stripe_subscription_id sub_1QhZ8kJ2eZvKYlo2C0aBcDeF (webhook customer.subscription.updated)'],
];

const STATUSES = ['pending', 'reviewed', 'replayed', 'discarded'];

function monthsBack(n) {
	const out = [];
	const now = new Date();
	for (let i = n - 1; i >= 0; i--) {
		const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
		out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
	}
	return out;
}

async function main() {
	await sql`DELETE FROM whatsapp_account_events`;
	await sql`DELETE FROM acquisition_costs`;
	await sql`DELETE FROM mrr_snapshots`;
	await sql`DELETE FROM dead_letter_queue`;
	await sql`DELETE FROM system_notifications`;
	await sql`DELETE FROM waitlist`;

	const restaurantIds = [];
	for (const [i, name] of RESTAURANT_NAMES.entries()) {
		const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
		const [row] = await sql`
			INSERT INTO restaurants (name, slug, created_at)
			VALUES (${name}, ${slug}, now() - ${`${(i + 1) * 40} days`}::interval)
			ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
			RETURNING id`;
		restaurantIds.push(row.id);
	}

	const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
	const [admin] = await sql`
		INSERT INTO users (email, password_hash, email_verified, access_status, created_at)
		VALUES (${ADMIN_EMAIL}, ${passwordHash}, now(), 'approved', now() - interval '200 days')
		ON CONFLICT (email) DO UPDATE
			SET password_hash = EXCLUDED.password_hash,
			    email_verified = EXCLUDED.email_verified,
			    access_status = 'approved'
		RETURNING id`;

	await sql`
		INSERT INTO user_restaurants (user_id, restaurant_id, role)
		VALUES (${admin.id}, ${restaurantIds[0]}, 'owner')
		ON CONFLICT DO NOTHING`;

	for (const [i, rid] of restaurantIds.entries()) {
		const email = `encargado.operaciones.${i + 1}@restaurante-ejemplo-${i + 1}.es`;
		const [u] = await sql`
			INSERT INTO users (email, password_hash, email_verified, access_status, founder, created_at)
			VALUES (${email}, ${passwordHash}, ${i % 3 === 0 ? null : sql`now()`},
			        ${i % 2 === 0 ? 'approved' : 'pending'}, ${i === 1}, now() - ${`${i * 9 + 3} days`}::interval)
			ON CONFLICT (email) DO UPDATE SET access_status = EXCLUDED.access_status
			RETURNING id`;
		await sql`
			INSERT INTO user_restaurants (user_id, restaurant_id, role)
			VALUES (${u.id}, ${rid}, 'owner') ON CONFLICT DO NOTHING`;
	}

	for (let i = 0; i < 8; i++) {
		await sql`
			INSERT INTO waitlist (email, created_at)
			VALUES (${`lista.de.espera.numero.${i + 1}@grupo-hostelero-ejemplo.com`}, now() - ${`${i * 3 + 1} days`}::interval)
			ON CONFLICT DO NOTHING`;
	}

	for (const rid of restaurantIds) {
		await sql`DELETE FROM extraction_corrections WHERE restaurant_id = ${rid}`;
		await sql`DELETE FROM extraction_results WHERE restaurant_id = ${rid}`;
		await sql`DELETE FROM product_aliases WHERE restaurant_id = ${rid}`;
		await sql`DELETE FROM products WHERE restaurant_id = ${rid}`;
		await sql`DELETE FROM invoices WHERE restaurant_id = ${rid}`;
		await sql`DELETE FROM suppliers WHERE restaurant_id = ${rid}`;
	}

	const CORRECTION_FIELDS = ['totalAmount', 'invoiceDate', 'taxBase', 'supplierName'];
	const PRODUCT_NAMES = ['Tomate pera', 'Aceite de oliva virgen extra', 'Patata gallega', 'Cebolla dulce'];

	for (const [i, rid] of restaurantIds.entries()) {
		const [supplier] = await sql`
			INSERT INTO suppliers (restaurant_id, name, category, created_at)
			VALUES (${rid}, ${`Distribuciones Alimentarias del Norte ${i + 1} SL`}, 'general', now() - interval '90 days')
			RETURNING id`;
		const invoiceIds = [];
		for (let n = 0; n < 4; n++) {
			const fileKey = `demo/${rid}/inv-${i}-${n}.pdf`;
			const [invoice] = await sql`
				INSERT INTO invoices (restaurant_id, supplier_id, invoice_number, invoice_date, total_amount, status, source_file, created_at)
				VALUES (${rid}, ${supplier.id}, ${`FRA-2026-${String(i * 10 + n).padStart(6, '0')}`},
				        now()::date - ${n * 2}::int, ${(120 + n * 37.5).toFixed(2)}, 'saved', ${fileKey},
				        now() - ${`${n * 2 + i} days`}::interval)
				RETURNING id`;
			invoiceIds.push(invoice.id);
			await sql`
				INSERT INTO extraction_results (restaurant_id, file_key, source, run_kind, prompt_version, model, extracted_data, confidence, created_at)
				VALUES (${rid}, ${fileKey}, 'web', 'live', ${n % 3 === 0 ? 'v2-2026-07-01' : 'v3-2026-08-20'}, 'gemini-2.5-flash',
				        '{}'::jsonb, ${(0.7 + n * 0.05).toFixed(2)}, now() - ${`${n * 2 + i} days`}::interval)`;
		}

		for (let n = 0; n < 3; n++) {
			await sql`
				INSERT INTO extraction_corrections
					(restaurant_id, invoice_id, supplier_id, field_name, original_value, corrected_value, field_confidence, corrected_at)
				VALUES (${rid}, ${invoiceIds[n % invoiceIds.length]}, ${supplier.id}, ${CORRECTION_FIELDS[n % CORRECTION_FIELDS.length]},
				        'valor extraído', 'valor corregido', ${(0.5 + n * 0.1).toFixed(2)}, now() - ${`${n * 3 + i} days`}::interval)`;
		}

		const productIds = [];
		for (const name of PRODUCT_NAMES) {
			const [product] = await sql`
				INSERT INTO products (restaurant_id, canonical_name, name_key)
				VALUES (${rid}, ${name}, ${name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')})
				RETURNING id`;
			productIds.push(product.id);
		}
		await sql`
			INSERT INTO product_aliases
				(restaurant_id, product_id, supplier_id, raw_key, raw_text, source, original_source, review_outcome, confirmed_at)
			VALUES
				(${rid}, ${productIds[0]}, ${supplier.id}, 'tomates pera caja 5kg', 'TOMATES PERA CAJA 5KG', 'exact', 'exact', NULL, now()),
				(${rid}, ${productIds[1]}, ${supplier.id}, 'aceite oliva v.e. garrafa 5l', 'ACEITE OLIVA V.E. GARRAFA 5L', 'fuzzy', 'fuzzy', NULL, NULL),
				(${rid}, ${productIds[2]}, ${supplier.id}, 'patatas gallegas saco 25kg', 'PATATAS GALLEGAS SACO 25KG', 'user', 'fuzzy', 'confirmed', now()),
				(${rid}, ${productIds[3]}, ${supplier.id}, 'cebolla dulce malla 20kg', 'CEBOLLA DULCE MALLA 20KG', 'user', 'fuzzy', 'rejected', now())`;
	}

	const [demoBatch] = await sql`
		INSERT INTO upload_batches (restaurant_id) VALUES (${restaurantIds[0]}) RETURNING id`;
	await sql`
		INSERT INTO batch_items (batch_id, restaurant_id, position, file_key, display_name, status, queued_at, updated_at)
		VALUES (${demoBatch.id}, ${restaurantIds[0]}, 1, 'demo/stuck-invoice.pdf', 'factura-atascada-demo.pdf',
		        'extracting', now() - interval '40 minutes', now() - interval '40 minutes')`;

	for (let i = 0; i < 60; i++) {
		const rid = restaurantIds[i % restaurantIds.length];
		await sql`
			INSERT INTO system_notifications (restaurant_id, notification_type, message, status, created_at)
			VALUES (${rid}, ${EVENT_TYPES[i % EVENT_TYPES.length]}, ${EVENT_MESSAGES[i % EVENT_MESSAGES.length]},
			        ${['pending', 'resolved', 'dismissed'][i % 3]}, now() - ${`${i * 37} minutes`}::interval)`;
	}

	for (let i = 0; i < 14; i++) {
		const [errorClass, errorMessage] = ERRORS[i % ERRORS.length];
		await sql`
			INSERT INTO dead_letter_queue
				(queue, restaurant_id, source_id, job_id, error_class, error_message, payload,
				 attempt, occurrences, status, first_seen_at, last_seen_at)
			VALUES (${QUEUES[i % QUEUES.length]}, ${restaurantIds[i % restaurantIds.length]},
			        ${`batch-item-${1000 + i}`}, ${`job-9f21c9d4-4e0a-4a3b-9f2e-${String(i).padStart(12, '0')}`},
			        ${errorClass}, ${errorMessage},
			        ${sql.json({ batchItemId: 1000 + i, attempt: (i % 3) + 1, queue: QUEUES[i % QUEUES.length] })},
			        ${(i % 3) + 1}, ${(i % 5) + 1}, ${STATUSES[i % STATUSES.length]},
			        now() - ${`${i + 2} days`}::interval, now() - ${`${i} hours`}::interval)`;
	}

	const tiers = ['starter', 'pro', 'business', 'pro', 'trial', 'starter'];
	const subStatus = ['active', 'active', 'past_due', 'active', 'trialing', 'active'];
	for (const [i, rid] of restaurantIds.entries()) {
		await sql`DELETE FROM subscriptions WHERE restaurant_id = ${rid}`;
		await sql`
			INSERT INTO subscriptions
				(restaurant_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
				 plan_tier, status, trial_ends_at, current_period_end, cancel_at_period_end, created_at)
			VALUES (${rid}, ${`cus_demo${i}`}, ${i === 4 ? null : `sub_demo${i}`}, ${i === 5 ? 'price_unknown_demo' : `price_demo${i}`},
			        ${tiers[i]}, ${subStatus[i]},
			        ${i === 4 ? sql`now() - interval '10 days'` : null},
			        now() + ${`${20 - i * 12} days`}::interval,
			        ${i === 2}, now() - ${`${(i + 1) * 40} days`}::interval)`;
	}

	const months = monthsBack(13);
	const price = { trial: 0, starter: 2900, pro: 5900, business: 12900 };
	for (const [mi, month] of months.entries()) {
		for (const [i, rid] of restaurantIds.entries()) {
			if (mi < i) continue;
			const churned = i === 3 && mi >= months.length - 2;
			const mrr = churned ? 0 : price[tiers[i]];
			await sql`
				INSERT INTO mrr_snapshots (month, restaurant_id, plan_tier, status, mrr_cents, at_risk_cents, source, captured_at)
				VALUES (${month}, ${rid}, ${tiers[i]}, ${subStatus[i]}, ${mrr},
				        ${subStatus[i] === 'past_due' ? mrr : 0},
				        ${mi === months.length - 1 ? 'live' : 'estimated'},
				        now() - ${`${(months.length - mi) * 30} days`}::interval)`;
		}
	}

	const categories = ['marketing', 'salaries', 'tools', 'other'];
	for (const [i, month] of months.slice(-6).entries()) {
		await sql`
			INSERT INTO acquisition_costs (month, category, amount_cents, note, created_by)
			VALUES (${month}, ${categories[i % categories.length]}, ${45000 + i * 7500},
			        ${'Campaña de captación en hostelería local, tramo ' + (i + 1)}, ${ADMIN_EMAIL})`;
	}

	const waEvents = [
		['account_update', 'PHONE_NUMBER_QUALITY_UPDATE', 'GREEN', 'TIER_1K', 'info'],
		['account_update', 'FLAGGED', 'YELLOW', 'TIER_1K', 'warning'],
		['phone_number_quality_update', 'RED', 'RED', 'TIER_250', 'critical'],
		['account_update', 'UNFLAGGED', 'GREEN', 'TIER_10K', 'info'],
		['account_update', 'ACCOUNT_WARNING', 'YELLOW', 'TIER_1K', 'warning'],
	];
	for (const [i, [field, event, quality, limit, severity]] of waEvents.entries()) {
		await sql`
			INSERT INTO whatsapp_account_events (field, event, phone_number, quality_rating, messaging_limit, severity, payload, received_at)
			VALUES (${field}, ${event}, '+34600111222', ${quality}, ${limit}, ${severity},
			        ${sql.json({ event, current_quality_rating: quality })}, now() - ${`${i * 6 + 1} hours`}::interval)`;
	}

	for (const [i, rid] of restaurantIds.slice(0, 4).entries()) {
		await sql`
			INSERT INTO whatsapp_contacts (restaurant_id, phone_number, display_name)
			VALUES (${rid}, ${`+3460011122${i}`}, ${`Encargado ${i + 1}`})
			ON CONFLICT DO NOTHING`;
	}

	console.log(`[seed] admin=${ADMIN_EMAIL} restaurants=${restaurantIds.length} events=60 dlq=14 months=${months.length}`);
	await sql.end();
}

main().catch(async e => {
	console.error(e);
	await sql.end();
	process.exit(1);
});
