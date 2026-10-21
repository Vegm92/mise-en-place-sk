import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { testSql, hasDbEnv } from './helpers/test-db';
import { useTestRestaurant } from './helpers/test-restaurant';
import { minimalInvoiceForm, minimalBatchItem } from './helpers/invoice-save-form';
import { saveReviewedInvoice } from '../src/lib/server/invoice-save';

const restaurant = useTestRestaurant('inv-save-outcomes-1273');
const USER_ID = randomUUID();
const SUPPLIER = '__outcomes_sup__';

function save(fd: FormData, extractedData: Record<string, unknown> | null = { confidence: 1 }) {
	return saveReviewedInvoice(minimalBatchItem(restaurant.id, extractedData), fd, restaurant.id, USER_ID);
}

async function invoiceCount(invoiceNumber: string): Promise<number> {
	const rows = await testSql`SELECT id FROM invoices WHERE restaurant_id = ${restaurant.id} AND invoice_number = ${invoiceNumber}`;
	return rows.length;
}

async function supplierCount(name: string): Promise<number> {
	const rows = await testSql`SELECT id FROM suppliers WHERE restaurant_id = ${restaurant.id} AND lower(name) = lower(${name})`;
	return rows.length;
}

describe.skipIf(!hasDbEnv)('saveReviewedInvoice outcomes (issue #1273 characterization)', () => {
	it('saved: a clean form inserts the invoice and its line, and audits the create', async () => {
		const out = await save(minimalInvoiceForm(SUPPLIER, 'OUT-SAVED'));
		expect(out.type).toBe('saved');
		if (out.type !== 'saved') return;
		const lines = await testSql`SELECT id FROM invoice_line_items WHERE invoice_id = ${out.invoiceId}`;
		const audits = await testSql`SELECT action FROM invoice_audit_log WHERE invoice_id = ${out.invoiceId}`;
		expect(lines).toHaveLength(1);
		expect(audits.map((a) => a.action)).toEqual(['create']);
	});

	it('invalidDate: a garbage invoice_date is refused before anything is written', async () => {
		const fd = minimalInvoiceForm('__outcomes_bad_date__', 'OUT-DATE');
		fd.set('invoice_date', '20/07/2026');
		expect(await save(fd)).toEqual({ type: 'invalidDate', field: 'invoice_date' });
		expect(await invoiceCount('OUT-DATE')).toBe(0);
		expect(await supplierCount('__outcomes_bad_date__')).toBe(0);
	});

	it('invalidDate: names the due_date and delivery_date fields too', async () => {
		const due = minimalInvoiceForm('__outcomes_bad_date__', 'OUT-DUE');
		due.set('due_date', 'soon');
		expect(await save(due)).toEqual({ type: 'invalidDate', field: 'due_date' });
		const delivery = minimalInvoiceForm('__outcomes_bad_date__', 'OUT-DELIVERY');
		delivery.set('delivery_date', 'tomorrow');
		expect(await save(delivery)).toEqual({ type: 'invalidDate', field: 'delivery_date' });
	});

	it('invalidAmount: a non-numeric total is refused and names the field', async () => {
		const fd = minimalInvoiceForm('__outcomes_bad_amount__', 'OUT-AMOUNT');
		fd.set('total_amount', 'abc');
		expect(await save(fd)).toEqual({ type: 'invalidAmount', field: 'total_amount' });
		expect(await invoiceCount('OUT-AMOUNT')).toBe(0);
		expect(await supplierCount('__outcomes_bad_amount__')).toBe(0);
	});

	it('invalidAmount: a non-numeric line price names the line field', async () => {
		const fd = minimalInvoiceForm('__outcomes_bad_amount__', 'OUT-LINE-AMOUNT');
		fd.set('line_unit_prices', '12abc');
		expect(await save(fd)).toEqual({ type: 'invalidAmount', field: 'line_unit_prices' });
	});

	it('lowConfidenceBlocked: low field confidence without the ack is refused, with the ack it saves', async () => {
		const extracted = { confidence: 1, field_confidences: { total_amount: 0.5 } };
		const blocked = minimalInvoiceForm('__outcomes_low_conf__', 'OUT-LOWCONF');
		blocked.delete('low_confidence_ack');
		expect(await save(blocked, extracted)).toEqual({ type: 'lowConfidenceBlocked' });
		expect(await invoiceCount('OUT-LOWCONF')).toBe(0);
		expect(await supplierCount('__outcomes_low_conf__')).toBe(0);

		const acked = minimalInvoiceForm('__outcomes_low_conf__', 'OUT-LOWCONF');
		expect((await save(acked, extracted)).type).toBe('saved');
	});

	it('lowConfidenceBlocked: low overall confidence blocks too', async () => {
		const fd = minimalInvoiceForm('__outcomes_low_conf__', 'OUT-LOWOVERALL');
		fd.delete('low_confidence_ack');
		expect(await save(fd, { confidence: 0.4 })).toEqual({ type: 'lowConfidenceBlocked' });
	});

	it('contentDuplicate: an identical second save returns the first invoice id and writes nothing', async () => {
		const first = await save(minimalInvoiceForm('__outcomes_content__', 'OUT-CONTENT'));
		expect(first.type).toBe('saved');
		if (first.type !== 'saved') return;
		const second = await save(minimalInvoiceForm('__outcomes_content__', 'OUT-CONTENT'));
		expect(second).toEqual({ type: 'contentDuplicate', duplicateId: first.invoiceId });
		expect(await invoiceCount('OUT-CONTENT')).toBe(1);
	});

	it('contentDuplicate: wins over numberDuplicate when both would match', async () => {
		const first = await save(minimalInvoiceForm('__outcomes_both__', 'OUT-BOTH'));
		if (first.type !== 'saved') throw new Error('setup save failed');
		const again = await save(minimalInvoiceForm('__outcomes_both__', 'OUT-BOTH'));
		expect(again.type).toBe('contentDuplicate');
	});

	it('numberDuplicate: same supplier and number with different content is refused', async () => {
		const first = await save(minimalInvoiceForm('__outcomes_number__', 'OUT-NUMBER'));
		expect(first.type).toBe('saved');
		const changed = minimalInvoiceForm('__outcomes_number__', 'OUT-NUMBER');
		changed.set('total_amount', '250');
		changed.set('line_unit_prices', '250');
		changed.set('line_total_prices', '250');
		expect(await save(changed)).toEqual({ type: 'numberDuplicate' });
		expect(await invoiceCount('OUT-NUMBER')).toBe(1);
	});

	it('numberDuplicate: the same number under a different supplier is allowed', async () => {
		await save(minimalInvoiceForm('__outcomes_number_a__', 'OUT-SHARED'));
		const other = await save(minimalInvoiceForm('__outcomes_number_b__', 'OUT-SHARED'));
		expect(other.type).toBe('saved');
	});

	it('replay: a second save with the same idempotency key is a no-op', async () => {
		const key = randomUUID();
		const build = () => {
			const fd = minimalInvoiceForm('__outcomes_replay__', 'OUT-REPLAY');
			fd.append('idempotency_key', key);
			return fd;
		};
		expect((await save(build())).type).toBe('saved');
		expect(await save(build())).toEqual({ type: 'replay' });
		expect(await invoiceCount('OUT-REPLAY')).toBe(1);
	});

	it('a refused duplicate releases its idempotency key so the user can retry', async () => {
		await save(minimalInvoiceForm('__outcomes_release__', 'OUT-RELEASE'));
		const key = randomUUID();
		const dup = minimalInvoiceForm('__outcomes_release__', 'OUT-RELEASE');
		dup.append('idempotency_key', key);
		expect((await save(dup)).type).toBe('contentDuplicate');
		const retry = minimalInvoiceForm('__outcomes_release__', 'OUT-RELEASE-2');
		retry.append('idempotency_key', key);
		expect((await save(retry)).type).toBe('saved');
	});
});
