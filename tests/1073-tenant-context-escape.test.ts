import { describe, it, expect, vi } from 'vitest';

const queries: string[] = [];

function fakeSql(strings: TemplateStringsArray | string, ..._args: unknown[]): Promise<unknown[]> {
	queries.push(typeof strings === 'string' ? strings : strings.join('?'));
	return Promise.resolve([]);
}

const reserved = Object.assign(fakeSql, { release: vi.fn(), options: { parsers: {}, serializers: {} } });
const client = Object.assign(fakeSql, {
	options: { parsers: {}, serializers: {} },
	reserve: () => Promise.resolve(reserved),
});

vi.mock('../src/lib/server/db-client', () => ({
	getClient: () => client,
	getDb: () => ({ marker: 'pool' }),
}));

const { runWithTenantContext, runAsSystem, activeTenantContext } = await import('../src/lib/server/tenant-context');
const { db } = await import('../src/lib/server/db');

function gate(): { wait: Promise<void>; open: () => void } {
	let open!: () => void;
	const wait = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { wait, open };
}

describe('detached work cannot outlive its tenant scope (#1073)', () => {
	it('exposes the context while the scope is open', async () => {
		await runWithTenantContext('rid-1', async () => {
			expect(activeTenantContext()?.restaurantId).toBe('rid-1');
		});
	});

	it('rejects detached work that reads the context after the scope released it', async () => {
		const { wait, open } = gate();
		let detached!: Promise<unknown>;
		await runWithTenantContext('rid-1', async () => {
			detached = wait.then(() => activeTenantContext());
		});
		open();
		await expect(detached).rejects.toThrow(/released its connection/);
	});

	it('rejects a detached query on a released admin scope without touching the connection', async () => {
		const { wait, open } = gate();
		let detached!: Promise<unknown>;
		await runAsSystem(async () => {
			detached = wait.then(() => db.insert);
		});
		const afterScope = queries.length;
		open();
		await expect(detached).rejects.toThrow(/released its connection/);
		expect(queries.length).toBe(afterScope);
	});
});
