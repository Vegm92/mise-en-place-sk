import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { isRedirect } from '@sveltejs/kit';
import { testSql, hasDbEnv } from './helpers/test-db';
import { useTestRestaurant } from './helpers/test-restaurant';
import { minimalInvoiceForm, minimalBatchItem } from './helpers/invoice-save-form';
import { saveReviewedInvoice } from '../src/lib/server/invoice-save';

const restaurant = useTestRestaurant('inv-write-path-1273');
const USER_ID = randomUUID();

function save(fd: FormData, extractedData: Record<string, unknown> | null = { confidence: 1 }) {
	return saveReviewedInvoice(minimalBatchItem(restaurant.id, extractedData), fd, restaurant.id, USER_ID);
}

function withTotal(fd: FormData, total: string): FormData {
	fd.set('total_amount', total);
	fd.set('line_unit_prices', total);
	fd.set('line_total_prices', total);
	return fd;
}

async function savedId(supplier: string, number: string, total = '100'): Promise<number> {
	const out = await save(withTotal(minimalInvoiceForm(supplier, number), total));
	if (out.type !== 'saved') throw new Error(`setup save returned ${out.type}`);
	return out.invoiceId;
}

async function softDelete(invoiceId: number): Promise<void> {
	await testSql`UPDATE invoices SET deleted_at = now() WHERE id = ${invoiceId}`;
}

async function supplierRow(name: string) {
	const [row] = await testSql`
		SELECT id, contact_email, outstanding_balance FROM suppliers
		WHERE restaurant_id = ${restaurant.id} AND lower(name) = lower(${name})`;
	return row;
}

async function restaurantPhone(): Promise<string | null> {
	const [row] = await testSql`SELECT phone FROM restaurants WHERE id = ${restaurant.id}`;
	return row?.phone ?? null;
}

async function runAction(
	load: () => Promise<{ actions: Record<string, unknown> }>,
	name: string,
	params: Record<string, string>,
	formData: FormData,
): Promise<unknown> {
	const { actions } = await load();
	const event = {
		params,
		locals: { restaurantId: restaurant.id, user: { id: USER_ID } },
		request: { formData: async () => formData },
	} as never;
	return (actions[name] as (e: never) => Promise<unknown>)(event).catch((e: unknown) => e);
}

const runEdit = (invoiceId: number, fd: FormData) =>
	runAction(() => import('../src/routes/(app)/invoice/[id]/edit/+page.server'), 'save', { id: String(invoiceId) }, fd);

const runInvoicesAction = (name: string, fd: FormData) =>
	runAction(() => import('../src/routes/(app)/invoices/+page.server'), name, {}, fd);

function editForm(supplier: string, number: string, total: string, version: number): FormData {
	const fd = withTotal(minimalInvoiceForm(supplier, number), total);
	fd.set('version', String(version));
	return fd;
}

describe.skipIf(!hasDbEnv)('a soft-deleted invoice no longer blocks its number (RULE-145, RULE-155)', () => {
	it('save: a new invoice may reuse the number of a soft-deleted one', async () => {
		const first = await savedId('__wp_reuse__', 'WP-REUSE', '100');
		await softDelete(first);
		const out = await save(withTotal(minimalInvoiceForm('__wp_reuse__', 'WP-REUSE'), '250'));
		expect(out.type).toBe('saved');
	});

	it('save: a live invoice with the same number still blocks', async () => {
		await savedId('__wp_live__', 'WP-LIVE', '100');
		const out = await save(withTotal(minimalInvoiceForm('__wp_live__', 'WP-LIVE'), '250'));
		expect(out).toEqual({ type: 'numberDuplicate' });
	});

	it('save: the content-hash check still catches an identical live invoice', async () => {
		const first = await savedId('__wp_hash__', 'WP-HASH', '100');
		const out = await save(minimalInvoiceForm('__wp_hash__', 'WP-HASH'));
		expect(out).toEqual({ type: 'contentDuplicate', duplicateId: first });
	});

	it('edit: an invoice may take the number of a soft-deleted one', async () => {
		const gone = await savedId('__wp_edit__', 'WP-EDIT-GONE', '100');
		const target = await savedId('__wp_edit__', 'WP-EDIT-TARGET', '120');
		await softDelete(gone);
		const result = await runEdit(target, editForm('__wp_edit__', 'WP-EDIT-GONE', '130', 1));
		expect(isRedirect(result)).toBe(true);
		const [row] = await testSql`SELECT invoice_number FROM invoices WHERE id = ${target}`;
		expect(row?.invoice_number).toBe('WP-EDIT-GONE');
	});

	it('edit: a live invoice with that number still blocks with a 409', async () => {
		await savedId('__wp_edit_live__', 'WP-EDIT-LIVE', '100');
		const target = await savedId('__wp_edit_live__', 'WP-EDIT-OTHER', '120');
		const result = await runEdit(target, editForm('__wp_edit_live__', 'WP-EDIT-LIVE', '130', 1));
		expect(result).toMatchObject({ status: 409 });
	});
});

describe.skipIf(!hasDbEnv)('no supplier, balance or phone write before the duplicate checks pass (RULE-145)', () => {
	beforeEach(async () => {
		await testSql`UPDATE restaurants SET phone = NULL WHERE id = ${restaurant.id}`;
	});

	const extracted = (supplier: string, balance: number) => ({
		confidence: 1,
		supplier_name: supplier,
		supplier_email: 'ventas@example.es',
		receiver_phone: '+34600111222',
		outstanding_balance: balance,
	});

	it('numberDuplicate leaves the supplier contact, balance and restaurant phone untouched', async () => {
		await savedId('__wp_nowrite__', 'WP-NOWRITE', '100');
		const out = await save(withTotal(minimalInvoiceForm('__wp_nowrite__', 'WP-NOWRITE'), '250'), extracted('__wp_nowrite__', 77));
		expect(out).toEqual({ type: 'numberDuplicate' });
		const supplier = await supplierRow('__wp_nowrite__');
		expect(supplier?.contact_email).toBeNull();
		expect(supplier?.outstanding_balance).toBeNull();
		expect(await restaurantPhone()).toBeNull();
	});

	it('contentDuplicate leaves them untouched too', async () => {
		await savedId('__wp_nowrite_hash__', 'WP-NOWRITE-HASH', '100');
		const out = await save(minimalInvoiceForm('__wp_nowrite_hash__', 'WP-NOWRITE-HASH'), extracted('__wp_nowrite_hash__', 88));
		expect(out.type).toBe('contentDuplicate');
		const supplier = await supplierRow('__wp_nowrite_hash__');
		expect(supplier?.contact_email).toBeNull();
		expect(supplier?.outstanding_balance).toBeNull();
		expect(await restaurantPhone()).toBeNull();
	});

	it('a duplicate lost in a race rolls back the supplier balance it wrote', async () => {
		const forms = [11, 22].map((balance) => ({
			balance,
			fd: minimalInvoiceForm('__wp_race__', 'WP-RACE'),
			extracted: extracted('__wp_race__', balance),
		}));
		const outcomes = await Promise.all(forms.map((f) => save(f.fd, f.extracted)));
		const winner = outcomes.findIndex((o) => o.type === 'saved');
		expect(winner).toBeGreaterThanOrEqual(0);
		expect(outcomes.filter((o) => o.type === 'saved')).toHaveLength(1);
		const supplier = await supplierRow('__wp_race__');
		expect(Number(supplier?.outstanding_balance)).toBe(forms[winner]!.balance);
	});
});

describe.skipIf(!hasDbEnv)('soft delete and its audit entry share one transaction (RULE-274)', () => {
	afterEach(async () => {
		await testSql.unsafe('DROP TRIGGER IF EXISTS fail_soft_delete_audit_1273 ON invoice_audit_log');
	});

	async function failAuditInserts(): Promise<void> {
		await testSql.unsafe(`
			CREATE OR REPLACE FUNCTION fail_soft_delete_audit_1273() RETURNS trigger AS $$
			BEGIN RAISE EXCEPTION 'audit insert refused (test)'; END; $$ LANGUAGE plpgsql`);
		await testSql.unsafe(`
			CREATE TRIGGER fail_soft_delete_audit_1273 BEFORE INSERT ON invoice_audit_log
			FOR EACH ROW WHEN (NEW.restaurant_id = '${restaurant.id}' AND NEW.action = 'soft_delete')
			EXECUTE FUNCTION fail_soft_delete_audit_1273()`);
	}

	async function deletedAt(invoiceId: number): Promise<unknown> {
		const [row] = await testSql`SELECT deleted_at FROM invoices WHERE id = ${invoiceId}`;
		return row?.deleted_at;
	}

	async function auditActions(invoiceId: number): Promise<string[]> {
		const rows = await testSql`SELECT action FROM invoice_audit_log WHERE invoice_id = ${invoiceId} ORDER BY id`;
		return rows.map((r) => r.action as string);
	}

	it('deleteInvoice writes the delete and its audit row together', async () => {
		const id = await savedId('__wp_del__', 'WP-DEL', '100');
		const fd = new FormData();
		fd.set('id', String(id));
		expect(isRedirect(await runInvoicesAction('deleteInvoice', fd))).toBe(true);
		expect(await deletedAt(id)).not.toBeNull();
		expect(await auditActions(id)).toEqual(['create', 'soft_delete']);
	});

	it('deleteInvoice rolls the delete back when the audit insert fails', async () => {
		const id = await savedId('__wp_del_fail__', 'WP-DEL-FAIL', '100');
		await failAuditInserts();
		const fd = new FormData();
		fd.set('id', String(id));
		const result = await runInvoicesAction('deleteInvoice', fd);
		expect(isRedirect(result)).toBe(false);
		expect(await deletedAt(id)).toBeNull();
		expect(await auditActions(id)).toEqual(['create']);
	});

	it('bulkDelete rolls every delete back when an audit insert fails', async () => {
		const a = await savedId('__wp_bulk__', 'WP-BULK-A', '100');
		const b = await savedId('__wp_bulk__', 'WP-BULK-B', '110');
		await failAuditInserts();
		const fd = new FormData();
		fd.append('invoice_ids', String(a));
		fd.append('invoice_ids', String(b));
		const result = await runInvoicesAction('bulkDelete', fd);
		expect(isRedirect(result)).toBe(false);
		expect(await deletedAt(a)).toBeNull();
		expect(await deletedAt(b)).toBeNull();
	});
});
