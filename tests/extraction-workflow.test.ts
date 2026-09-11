import { describe, it, expect } from 'vitest';

describe('extraction-workflow — the named application-workflow owner (#1047)', () => {
	it('is what extraction-worker.ts (the pg-boss adapter) actually delegates to', async () => {
		const workflow = await import('../src/lib/server/extraction-workflow');
		const worker = await import('../src/lib/server/extraction-worker');
		expect(worker.processExtractionJob).toBe(workflow.runExtractionWorkflow);
		expect(worker.runExtractionJobForBoss).toBe(workflow.runExtractionJobForBoss);
	});

	it('exposes product follow-up as a named collaborator, not a hidden call buried in the workflow body', async () => {
		const workflow = await import('../src/lib/server/extraction-workflow');
		const products = await import('../src/lib/server/products');
		expect(workflow.productFollowUp).toBe(products.annotateLineItems);
	});
});
