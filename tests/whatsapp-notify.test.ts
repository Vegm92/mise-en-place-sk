/**
 * Worker → bot notification (docs/03_features/whatsapp2.md).
 *
 * Extraction finishes in the worker; the sender is on WhatsApp. The two are
 * joined by the 'whatsapp-notify' pg-boss queue rather than a direct import, so
 * extraction-worker.ts never pulls in a WhatsApp client and stays testable.
 * This file drives the receiving half with a fake transport — the same seam
 * the repo uses for GenerateFn, mocking the seam and never the SDK.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getItemMock, setReviewStatusMock } = vi.hoisted(() => ({
	getItemMock: vi.fn(),
	setReviewStatusMock: vi.fn().mockResolvedValue(true),
}));

vi.mock('../src/lib/server/batch', () => ({ getItem: getItemMock }));
vi.mock('../src/lib/server/integrations/whatsapp/jobs', () => ({
	setReviewStatus: setReviewStatusMock,
	batchLink: (id: string) => `https://app.example.com/batch/${id}`,
}));

import {
	formatSummary, notifyWhatsAppSender,
} from '../src/lib/server/integrations/whatsapp/notify';
import type { WhatsAppMessageContext } from '../src/lib/server/integrations/whatsapp/transport';

function fakeTransport() {
	const sent: Array<{ to: string; body: string }> = [];
	const ctx: WhatsAppMessageContext = {
		sendText: async (to, body) => { sent.push({ to, body }); },
		downloadMedia: async () => ({ buffer: Buffer.alloc(0), extension: 'jpg' }),
	};
	return { ctx, sent };
}

const DONE_ITEM = {
	id: 'item-1',
	batchId: 'batch-1',
	restaurantId: 'rest-1',
	source: 'whatsapp',
	sourceRef: '34600111222',
	jobCode: 'A7K2',
	status: 'done',
	reviewStatus: null,
	extractedData: {
		supplier_name: 'Frutas Paco',
		invoice_number: 'F-2026-88',
		invoice_date: '2026-08-01',
		tax_base: 100,
		tax_amount: 10,
		total_amount: 110,
	},
};

beforeEach(() => {
	vi.clearAllMocks();
	setReviewStatusMock.mockResolvedValue(true);
});

describe('summary formatting', () => {
	it('names every field the sender needs to judge the extraction', () => {
		const body = formatSummary(DONE_ITEM.extractedData, 'A7K2');
		expect(body).toContain('Frutas Paco');
		expect(body).toContain('F-2026-88');
		expect(body).toContain('2026-08-01');
		expect(body).toContain('110,00 €');
		expect(body).toContain('OK A7K2');
		expect(body).toContain('NO A7K2');
	});

	it('shows a dash rather than "undefined" for a field the model could not read', () => {
		const body = formatSummary({ supplier_name: 'Frutas Paco' }, 'A7K2');
		expect(body).toContain('Nº factura: —');
		expect(body).toContain('Total: —');
		expect(body).not.toMatch(/undefined|null|NaN/);
	});
});

describe('notifyWhatsAppSender', () => {
	it('sends the summary and opens the job for review', async () => {
		getItemMock.mockResolvedValue(DONE_ITEM);
		const { ctx, sent } = fakeTransport();

		await notifyWhatsAppSender({ itemId: 'item-1', restaurantId: 'rest-1' }, ctx);

		expect(sent).toHaveLength(1);
		expect(sent[0]!.to).toBe('34600111222');
		expect(sent[0]!.body).toContain('Frutas Paco');
		expect(setReviewStatusMock).toHaveBeenCalledWith('item-1', 'pending', [null]);
	});

	it('points a failed extraction at the web panel and flags it To Review', async () => {
		getItemMock.mockResolvedValue({ ...DONE_ITEM, status: 'failed', extractedData: null });
		const { ctx, sent } = fakeTransport();

		await notifyWhatsAppSender({ itemId: 'item-1', restaurantId: 'rest-1' }, ctx);

		expect(sent[0]!.body).toMatch(/No he podido leer esta factura/i);
		expect(sent[0]!.body).toContain('https://app.example.com/batch/batch-1');
		expect(setReviewStatusMock).toHaveBeenCalledWith('item-1', 'to_review', [null, 'pending']);
	});

	it('says nothing about an item that did not come from WhatsApp', async () => {
		getItemMock.mockResolvedValue({ ...DONE_ITEM, source: 'web', sourceRef: null });
		const { ctx, sent } = fakeTransport();

		await notifyWhatsAppSender({ itemId: 'item-1', restaurantId: 'rest-1' }, ctx);

		expect(sent).toHaveLength(0);
		expect(setReviewStatusMock).not.toHaveBeenCalled();
	});

	it('says nothing when the item has been deleted under the job', async () => {
		getItemMock.mockResolvedValue(null);
		const { ctx, sent } = fakeTransport();

		await notifyWhatsAppSender({ itemId: 'gone', restaurantId: 'rest-1' }, ctx);

		expect(sent).toHaveLength(0);
	});

	it('says nothing while the item is still in flight', async () => {
		// The queue retries, and pg-boss can deliver before markDone commits.
		getItemMock.mockResolvedValue({ ...DONE_ITEM, status: 'extracting' });
		const { ctx, sent } = fakeTransport();

		await notifyWhatsAppSender({ itemId: 'item-1', restaurantId: 'rest-1' }, ctx);

		expect(sent).toHaveLength(0);
	});
});
