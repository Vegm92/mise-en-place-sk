import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { computeInvoiceContentHash } from './dedup';
import { toMoneyString } from './money';
import type { TaxBand } from '$lib/tax';

type Database = PostgresJsDatabase<typeof schema>;

export interface RehashResult { scanned: number; updated: number; collided: number }

interface InvoiceRow extends Record<string, unknown> {
	id: number;
	supplier_name: string | null;
	invoice_number: string | null;
	invoice_date: string | null;
	due_date: string | null;
	total_amount: string | null;
	tax_breakdown: string | null;
	content_hash: string | null;
}

interface LineRow extends Record<string, unknown> {
	invoice_id: number;
	description: string | null;
	quantity: number | null;
	unit: string | null;
	unit_price: string | null;
	total_price: string | null;
	tax_rate: number | null;
}

export function parseStoredBands(raw: string | null): TaxBand[] | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as TaxBand[]) : null;
	} catch {
		return null;
	}
}

export function hashForStoredInvoice(invoice: InvoiceRow, lines: LineRow[]): string {
	const kept = lines.filter(l => (l.description ?? '').trim());
	return computeInvoiceContentHash({
		supplierName:     invoice.supplier_name ?? '',
		invoiceNumber:    invoice.invoice_number ?? '',
		invoiceDate:      invoice.invoice_date ?? null,
		dueDate:          invoice.due_date ?? null,
		totalAmount:      toMoneyString(invoice.total_amount),
		lineDescriptions: kept.map(l => l.description ?? ''),
		lineQuantities:   kept.map(l => l.quantity ?? null),
		lineUnits:        kept.map(l => l.unit?.trim() || null),
		lineUnitPrices:   kept.map(l => toMoneyString(l.unit_price)),
		lineTotalPrices:  kept.map(l => toMoneyString(l.total_price)),
		lineTaxRates:     kept.map(l => l.tax_rate ?? null),
		taxBands:         parseStoredBands(invoice.tax_breakdown),
	});
}

export async function rehashRestaurant(database: Database, restaurantId: string): Promise<RehashResult> {
	const invoiceRows = await database.execute<InvoiceRow>(sql`
		SELECT i.id, s.name AS supplier_name, i.invoice_number,
		       i.invoice_date::text AS invoice_date, i.due_date::text AS due_date,
		       i.total_amount, i.tax_breakdown, i.content_hash
		FROM invoices i
		LEFT JOIN suppliers s ON s.id = i.supplier_id
		WHERE i.restaurant_id = ${restaurantId}
		  AND i.deleted_at IS NULL
		  AND i.content_hash IS NOT NULL
		ORDER BY i.id
	`);
	if (invoiceRows.length === 0) return { scanned: 0, updated: 0, collided: 0 };

	const lineRows = await database.execute<LineRow>(sql`
		SELECT invoice_id, description, quantity, unit, unit_price, total_price, tax_rate
		FROM invoice_line_items
		WHERE restaurant_id = ${restaurantId}
		ORDER BY invoice_id, id
	`);
	const byInvoice = new Map<number, LineRow[]>();
	for (const line of lineRows) {
		const bucket = byInvoice.get(line.invoice_id);
		if (bucket) bucket.push(line);
		else byInvoice.set(line.invoice_id, [line]);
	}

	const taken = new Set<string>();
	let updated = 0;
	let collided = 0;
	for (const invoice of invoiceRows) {
		const next = hashForStoredInvoice(invoice, byInvoice.get(invoice.id) ?? []);
		if (next === invoice.content_hash) {
			taken.add(next);
			continue;
		}
		if (taken.has(next)) {
			collided += 1;
			continue;
		}
		await database.execute(sql`
			UPDATE invoices SET content_hash = ${next} WHERE id = ${invoice.id}
		`);
		taken.add(next);
		updated += 1;
	}
	return { scanned: invoiceRows.length, updated, collided };
}
