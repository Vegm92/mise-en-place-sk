/**
 * WhatsApp job lookups are scoped to the tenant the sender is paired to NOW
 * (issue #1070).
 *
 * `batch_items.source_ref` holds the sender's phone number, and the three job
 * functions used to key on it alone. That is a true statement about the sender
 * and a silent one about the tenant: the phone→restaurant binding in
 * `whatsapp_contacts` is releasable (owner, via Settings; support, via
 * /admin/whatsapp — ADR-019), and the number can then pair to a different
 * restaurant. Keyed on the number alone, the re-paired sender still reached the
 * former tenant's rows — a cross-tenant read through `pendingJobsFor` and a
 * cross-tenant write through `setReviewStatus`.
 *
 * DB-backed because the defect lives in the WHERE clause: a mocked db cannot
 * tell a scoped query from an unscoped one. Skipped without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/lib/server/db', async () => (await import('./helpers/db-suite')).testDbModule());

import { testSql, hasDbEnv } from './helpers/test-db';
import { useTestRestaurant } from './helpers/test-restaurant';
import {
	findJobByCode, pendingJobsFor, setReviewStatus,
} from '../src/lib/server/integrations/whatsapp/jobs';
import { addContact, releaseContactByPhone } from '../src/lib/server/whatsapp-contacts';

const tenantA = useTestRestaurant('wa-scope-a');
const tenantB = useTestRestaurant('wa-scope-b');

const PHONE = '34600111222';
const JOB_CODE = 'A7K2';

const state = { itemId: '' };

async function reviewStatusOf(itemId: string): Promise<string | null> {
	const [row] = await testSql`SELECT review_status FROM batch_items WHERE id = ${itemId}`;
	return (row?.review_status as string | null) ?? null;
}

beforeAll(async () => {
	if (!hasDbEnv) return;

	expect(await addContact(tenantA.id, PHONE, 'Porter')).toEqual({ ok: true });

	const [batch] = await testSql`
		INSERT INTO upload_batches (restaurant_id) VALUES (${tenantA.id}) RETURNING id`;
	const [item] = await testSql`
		INSERT INTO batch_items
			(batch_id, restaurant_id, position, file_key, display_name, status, source, source_ref, job_code, review_status, extracted_data)
		VALUES
			(${batch!.id}, ${tenantA.id}, 1, ${'wa/' + PHONE + '/1.jpg'}, '1.jpg', 'done', 'whatsapp', ${PHONE}, ${JOB_CODE}, 'pending', ${JSON.stringify({ supplier_name: 'Frutas Paco' })}::jsonb)
		RETURNING id`;
	state.itemId = item!.id as string;

	const released = await releaseContactByPhone(PHONE, 'support@example.com');
	expect(released).toEqual({ ok: true, restaurantId: tenantA.id });
	expect(await addContact(tenantB.id, PHONE, 'Porter')).toEqual({ ok: true });
});

describe.skipIf(!hasDbEnv)('a re-paired number cannot reach the former tenant (issue #1070)', () => {
	it('still finds the job for the tenant that owns it', async () => {
		expect(await pendingJobsFor(tenantA.id, PHONE)).toHaveLength(1);
		expect(await findJobByCode(tenantA.id, PHONE, JOB_CODE)).toMatchObject({
			id: state.itemId,
			restaurantId: tenantA.id,
		});
	});

	it('lists nothing for the tenant the number is paired to now', async () => {
		expect(await pendingJobsFor(tenantB.id, PHONE)).toEqual([]);
	});

	it('does not resolve the former tenant\'s job code', async () => {
		expect(await findJobByCode(tenantB.id, PHONE, JOB_CODE)).toBeNull();
	});

	it('does not mutate the former tenant\'s review status', async () => {
		expect(await setReviewStatus(tenantB.id, state.itemId, 'reviewed', ['pending'])).toBe(false);
		expect(await reviewStatusOf(state.itemId)).toBe('pending');
	});

	it('still lets the owning tenant answer its own job', async () => {
		expect(await setReviewStatus(tenantA.id, state.itemId, 'reviewed', ['pending'])).toBe(true);
		expect(await reviewStatusOf(state.itemId)).toBe('reviewed');
	});
});
