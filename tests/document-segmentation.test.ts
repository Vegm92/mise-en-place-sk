/**
 * Fan-out: what the ingestion pipeline does once it knows a PDF holds several
 * documents. Each segment becomes its own batch item — the same unit the user
 * already reviews and confirms one at a time — and the source document is kept
 * but taken out of the review queue.
 *
 * The two properties worth guarding are that a segment carries only its own
 * pages (a mixed-up split is the corruption this feature exists to prevent),
 * and that a worker redelivery does not fan the same document out twice: the
 * segment keys are derived from the source key, so a retry recognises the
 * children it already created.
 */
import { describe, it, expect, vi } from 'vitest';
import { segmentDocument, segmentKey, segmentDisplayName } from '../src/lib/server/document-segmentation';
import { pdfPageCount, pdfPageTexts } from '../src/lib/server/pdf-pages';
import { buildPdf, invoicePage, coverPage } from './helpers/pdf-fixture';

function deps(existing: string[] = []) {
	const saved = new Map<string, Buffer>();
	return {
		saved,
		existingKeys: new Set(existing),
		saveSegment: vi.fn(async (key: string, buf: Buffer) => { saved.set(key, buf); }),
		addItems: vi.fn(async (files: Array<{ key: string; name: string }>) => files.map((f, i) => `item-${i}`)),
		enqueue: vi.fn(async () => true),
		discardSource: vi.fn(async () => true),
	};
}

const PACKET = [
	coverPage([
		'24-015569-01 01-07-24 01-07-24 169,03 169,03',
		'24-015570-01 01-07-24 01-07-24 411,08 580,11',
		'24-015571-01 01-07-24 01-07-24 59,29 639,40',
	]),
	invoicePage('0010024015569', '01-07-24'),
	invoicePage('0010024015570', '01-07-24'),
];

const source = { fileKey: 'ns/packet_ab12cd.pdf', displayName: 'packet.pdf' };

async function run(d: ReturnType<typeof deps>, pages = PACKET) {
	return segmentDocument({ ...source, buffer: await buildPdf(pages) }, d);
}

describe('segmentDocument', () => {
	it('turns each invoice in a packet into its own queued document', async () => {
		const d = deps();

		const outcome = await run(d);

		expect(outcome.action).toBe('split');
		expect([...d.saved.keys()]).toEqual(['ns/packet_ab12cd_p2.pdf', 'ns/packet_ab12cd_p3.pdf']);
		expect(d.addItems).toHaveBeenCalledWith([
			{ key: 'ns/packet_ab12cd_p2.pdf', name: 'packet (p2).pdf' },
			{ key: 'ns/packet_ab12cd_p3.pdf', name: 'packet (p3).pdf' },
		]);
		expect(d.enqueue).toHaveBeenCalledTimes(2);
		expect(d.discardSource).toHaveBeenCalledTimes(1);
	});

	it('gives every segment its own pages and nobody else\'s', async () => {
		const d = deps();

		await run(d);

		const first = d.saved.get('ns/packet_ab12cd_p2.pdf')!;
		const second = d.saved.get('ns/packet_ab12cd_p3.pdf')!;
		expect(await pdfPageCount(first)).toBe(1);
		expect((await pdfPageTexts(first))[0]).toContain('0010024015569');
		expect((await pdfPageTexts(first))[0]).not.toContain('0010024015570');
		expect((await pdfPageTexts(second))[0]).toContain('0010024015570');
	});

	it('does not fan the same document out twice when the job is redelivered', async () => {
		const d = deps(['ns/packet_ab12cd_p2.pdf', 'ns/packet_ab12cd_p3.pdf']);

		const outcome = await run(d);

		expect(outcome.action).toBe('split');
		expect(d.saveSegment).not.toHaveBeenCalled();
		expect(d.addItems).not.toHaveBeenCalled();
		expect(d.discardSource).toHaveBeenCalledTimes(1);
	});

	it('creates only the segments a half-finished redelivery left behind', async () => {
		const d = deps(['ns/packet_ab12cd_p2.pdf']);

		await run(d);

		expect([...d.saved.keys()]).toEqual(['ns/packet_ab12cd_p3.pdf']);
		expect(d.addItems).toHaveBeenCalledWith([{ key: 'ns/packet_ab12cd_p3.pdf', name: 'packet (p3).pdf' }]);
	});

	it('leaves a single invoice on the normal extraction path', async () => {
		const d = deps();

		const outcome = await run(d, [invoicePage('0010024015569', '01-07-24')]);

		expect(outcome.action).toBe('extract');
		expect(d.saveSegment).not.toHaveBeenCalled();
		expect(d.discardSource).not.toHaveBeenCalled();
	});

	it('sends a document it cannot read to review rather than to the extractor', async () => {
		const d = deps();

		const outcome = await run(d, [{ lines: [] }, { lines: [] }]);

		expect(outcome).toMatchObject({ action: 'review', reason: 'extract.err.structureUnclear' });
		expect(d.addItems).not.toHaveBeenCalled();
		expect(d.discardSource).not.toHaveBeenCalled();
	});

	it('keys and names a multi-page segment by its range', () => {
		expect(segmentKey('ns/scan_ab12cd.pdf', { start: 4, end: 6 })).toBe('ns/scan_ab12cd_p4-6.pdf');
		expect(segmentDisplayName('scan.pdf', { start: 4, end: 6 })).toBe('scan (p4-6).pdf');
	});
});
