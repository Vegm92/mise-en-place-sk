/**
 * RULE-269: the archive keeps both what the model said and what the pipeline
 * made of it, so replays and evals diff like with like, and the admin health
 * page notices an extraction whose archive write never landed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
	testDb, testSql, createTestRestaurant, cleanupTestRestaurant, hasDbEnv,
} from './helpers/test-db';
import { corpusEntriesForFile, recordExtractionResult } from '../src/lib/server/extraction-corpus';
import { archiveGapCheck } from '../src/lib/server/system-health';
import { unarchivedExtractions } from '../src/lib/server/pipeline-stats';

const describeDb = hasDbEnv ? describe : describe.skip;

let rid = '';

describe('archiveGapCheck', () => {
	it('is ok when nothing is missing and warns with the count otherwise', () => {
		expect(archiveGapCheck(0).status).toBe('ok');
		const warn = archiveGapCheck(3);
		expect(warn.status).toBe('warn');
		expect(warn.detail).toContain('3 extracted document(s)');
	});
});

describeDb('extraction archive storage', () => {
	beforeAll(async () => {
		rid = (await createTestRestaurant('archive')).id;
	});

	afterAll(async () => {
		await cleanupTestRestaurant(rid);
	});

	it('stores the raw model output next to the cleaned result, labelled by column', async () => {
		await recordExtractionResult({
			restaurantId: rid,
			batchItemId: null,
			fileKey: 'ns/a.pdf',
			promptVersion: 'v-test',
			extractedData: { supplier_name: 'Cleaned SL' },
			rawOutput: { supplier_name: 'cleaned sl (raw)' },
		}, testDb);
		const [entry] = await corpusEntriesForFile(rid, 'ns/a.pdf', testDb);
		expect(entry!.extractedData).toEqual({ supplier_name: 'Cleaned SL' });
		expect(entry!.rawOutput).toEqual({ supplier_name: 'cleaned sl (raw)' });
	});

	it('leaves rawOutput null for rows archived before the column existed', async () => {
		await recordExtractionResult({
			restaurantId: rid, batchItemId: null, fileKey: 'ns/old.pdf', promptVersion: 'v-test', extractedData: { a: 1 },
		}, testDb);
		const [entry] = await corpusEntriesForFile(rid, 'ns/old.pdf', testDb);
		expect(entry!.rawOutput).toBeNull();
	});

	it('counts done items with no archive row, once past the grace period', async () => {
		const before = await unarchivedExtractions();
		const [batch] = await testSql`INSERT INTO upload_batches (restaurant_id) VALUES (${rid}) RETURNING id`;
		const [stale] = await testSql`
			INSERT INTO batch_items (batch_id, restaurant_id, position, file_key, display_name, status, extracted_data, extracted_at)
			VALUES (${batch!.id}, ${rid}, 0, 'ns/gap.pdf', 'gap.pdf', 'done', '{"a":1}'::jsonb, now() - interval '1 hour') RETURNING id`;
		await testSql`
			INSERT INTO batch_items (batch_id, restaurant_id, position, file_key, display_name, status, extracted_data, extracted_at)
			VALUES (${batch!.id}, ${rid}, 1, 'ns/fresh.pdf', 'fresh.pdf', 'done', '{"a":1}'::jsonb, now())`;
		expect(await unarchivedExtractions()).toBe(before + 1);

		await recordExtractionResult({
			restaurantId: rid, batchItemId: stale!.id, fileKey: 'ns/gap.pdf', promptVersion: 'v-test', extractedData: { a: 1 },
		}, testDb);
		expect(await unarchivedExtractions()).toBe(before);
	});
});
