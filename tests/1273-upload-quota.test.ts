/**
 * RULE-359: the monthly quota is all-or-nothing on upload.
 *
 *  - It counts the invoices inside a ZIP, not the ZIP itself (one file could
 *    carry 50 invoices and slip past a 5-document allowance).
 *  - When the usage read fails the upload is refused, never waved through.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import yazl from 'yazl';

const m = vi.hoisted(() => ({
	remainingMonthlyQuota: vi.fn(),
	saveUploadedFiles: vi.fn(),
	createBatch: vi.fn(),
}));

vi.mock('$lib/server/llm-quota', () => ({ remainingMonthlyQuota: m.remainingMonthlyQuota }));
vi.mock('$lib/server/sessions', async (importOriginal) => ({
	...(await importOriginal<typeof import('../src/lib/server/sessions')>()),
	saveUploadedFiles: m.saveUploadedFiles,
}));
vi.mock('$lib/server/batch', () => ({
	createBatch: m.createBatch,
	getItem: vi.fn(),
	getBatchItems: vi.fn(),
	markQueued: vi.fn(),
}));
vi.mock('$lib/server/queue', () => ({ enqueueExtraction: vi.fn() }));
vi.mock('$lib/server/extract-batch', () => ({ enqueueBatchExtraction: vi.fn() }));
vi.mock('$lib/server/rate-limit-scope', () => ({ rateLimitScoped: vi.fn(async () => true) }));
vi.mock('$lib/server/events', () => ({ trackEvent: vi.fn() }));
vi.mock('$lib/server/invoice-save', () => ({ findExistingFilenames: vi.fn(async () => new Set()) }));
vi.mock('$lib/server/email-ingest', () => ({ getIngestAddress: vi.fn(async () => null) }));

import { actions } from '../src/routes/(app)/+page.server';

function zipOf(names: string[]): Promise<File> {
	return new Promise((resolve) => {
		const zip = new yazl.ZipFile();
		for (const name of names) {
			if (name.endsWith('/')) zip.addEmptyDirectory(name);
			else zip.addBuffer(Buffer.from('x'), name);
		}
		zip.end();
		const chunks: Buffer[] = [];
		zip.outputStream.on('data', (c: Buffer) => chunks.push(c));
		zip.outputStream.on('end', () => resolve(new File([new Uint8Array(Buffer.concat(chunks))], 'batch.zip')));
	});
}

async function runUpload(files: File[], monthlyQuota: number | null = 5) {
	const form = new FormData();
	for (const f of files) form.append('files', f);
	const event = {
		request: { formData: async () => form },
		locals: {
			restaurantId: 'rid-1',
			requestId: 'req-1',
			entitlements: async () => ({ access: { allowed: true }, monthlyQuota }),
		},
	};
	try {
		return await (actions.upload as unknown as (e: unknown) => Promise<unknown>)(event);
	} catch (err) {
		return err;
	}
}

const pdf = (name: string) => new File([new Uint8Array([1])], name);

beforeEach(() => {
	vi.clearAllMocks();
	m.saveUploadedFiles.mockResolvedValue({ saved: ['a.pdf'], keys: ['k/a.pdf'], errors: [] });
	m.createBatch.mockResolvedValue({ batchId: 'b1', itemIds: ['i1'] });
});

describe('upload quota (RULE-359)', () => {
	it('lets plain files through when they fit the remaining allowance', async () => {
		m.remainingMonthlyQuota.mockResolvedValue(2);
		const out = await runUpload([pdf('a.pdf'), pdf('b.pdf')]);
		expect(out).toMatchObject({ location: '/batch/b1' });
		expect(m.saveUploadedFiles).toHaveBeenCalled();
	});

	it('refuses plain files that exceed the remaining allowance', async () => {
		m.remainingMonthlyQuota.mockResolvedValue(1);
		const out = await runUpload([pdf('a.pdf'), pdf('b.pdf')]);
		expect(out).toMatchObject({ location: expect.stringContaining('upload.err.quotaRemaining') });
		expect(m.saveUploadedFiles).not.toHaveBeenCalled();
	});

	it('counts the invoices inside a ZIP, not the ZIP as one file', async () => {
		m.remainingMonthlyQuota.mockResolvedValue(3);
		const zip = await zipOf(['a.pdf', 'b.pdf', 'sub/c.pdf', 'd.pdf']);
		const out = await runUpload([zip]);
		expect(out).toMatchObject({ location: expect.stringContaining('quotaRemaining&remaining=3') });
		expect(m.saveUploadedFiles).not.toHaveBeenCalled();
	});

	it('does not count ZIP folder entries', async () => {
		m.remainingMonthlyQuota.mockResolvedValue(2);
		const zip = await zipOf(['folder/', 'folder/a.pdf', 'folder/b.pdf']);
		const out = await runUpload([zip]);
		expect(out).toMatchObject({ location: '/batch/b1' });
	});

	it('adds ZIP contents to loose files before comparing', async () => {
		m.remainingMonthlyQuota.mockResolvedValue(2);
		const zip = await zipOf(['a.pdf', 'b.pdf']);
		const out = await runUpload([zip, pdf('c.pdf')]);
		expect(out).toMatchObject({ location: expect.stringContaining('quotaRemaining') });
	});

	it('refuses the upload when the usage read fails', async () => {
		m.remainingMonthlyQuota.mockRejectedValue(new Error('db down'));
		const out = await runUpload([pdf('a.pdf')]);
		expect(out).toMatchObject({ status: 503, data: { error: 'upload.err.quotaUnknown' } });
		expect(m.saveUploadedFiles).not.toHaveBeenCalled();
	});

	it('does not read usage for a plan with no cap', async () => {
		m.remainingMonthlyQuota.mockResolvedValue(null);
		const out = await runUpload([pdf('a.pdf')], null);
		expect(out).toMatchObject({ location: '/batch/b1' });
	});
});
