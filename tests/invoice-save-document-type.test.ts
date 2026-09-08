/**
 * End-to-end wiring test for issue #461: saveReviewedInvoice must persist the
 * document_type Gemini already infers during extraction (factura vs albarán),
 * without changing existing save/dedup behaviour when the field is absent or
 * unrecognised (older extractions, or XML paths that predate this field).
 *
 * DB-backed; the db singleton is swapped for the test client. Skipped without
 * DATABASE_URL.
 */
import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => (await import('./helpers/db-suite')).testDbModule());

import { testSql, hasDbEnv } from './helpers/test-db';
import { useTestRestaurant } from './helpers/test-restaurant';
import type { BatchItem } from '../src/lib/server/batch';
import { fakeBatchItem } from './helpers/batch-item';
import { singleLineInvoiceForm, saveInvoiceOrThrow } from './helpers/invoice-save-form';

const restaurant = useTestRestaurant('inv-doctype');
const UID = randomUUID();

const fakeItem = (extractedData: Record<string, unknown> | null): BatchItem =>
	fakeBatchItem({ restaurantId: restaurant.id, extractedData });

/** Saves and returns the persisted document_type. */
async function savedDocumentType(item: BatchItem | null, invoiceNumber: string): Promise<string | null> {
	const invoiceId = await saveInvoiceOrThrow(item, singleLineInvoiceForm({ invoiceNumber }), restaurant.id, UID);
	const [row] = await testSql`SELECT document_type FROM invoices WHERE id = ${invoiceId}`;
	return row!.document_type as string | null;
}

describe.skipIf(!hasDbEnv)('saveReviewedInvoice → document_type persistence (issue #461)', () => {
	it("persists 'factura' when extraction classified the document as such", async () => {
		expect(await savedDocumentType(fakeItem({ document_type: 'factura', confidence: 1 }), 'DOC-FAC-001')).toBe('factura');
	});

	it("persists 'albaran' when extraction classified the document as such", async () => {
		expect(await savedDocumentType(fakeItem({ document_type: 'albaran', confidence: 1 }), 'DOC-ALB-001')).toBe('albaran');
	});

	it('stores null and still saves when extraction omits document_type (older/absent data)', async () => {
		expect(await savedDocumentType(fakeItem({ confidence: 1 }), 'DOC-NONE-001')).toBeNull();
	});

	it('coerces an unrecognised document_type value to null instead of persisting garbage', async () => {
		expect(await savedDocumentType(fakeItem({ document_type: 'nota_de_credito', confidence: 1 }), 'DOC-BAD-001')).toBeNull();
	});

	it('is a no-op for save/dedup behaviour when there is no extraction item at all', async () => {
		expect(await savedDocumentType(null, 'DOC-NULLITEM-001')).toBeNull();
	});
});
