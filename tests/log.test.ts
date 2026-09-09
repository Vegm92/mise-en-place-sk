/**
 * The structured logger (system-design-audit.md §7, "Structured log format").
 *
 * Two behaviours matter: production emits one JSON object per line — the shape
 * Railway's log explorer parses into queryable `@attribute` fields (`message`,
 * `level`, plus whatever custom fields are passed) — and non-production stays
 * a single readable line rather than a wall of JSON, since that is what
 * `pnpm dev` scrollback is read with human eyes.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

async function loggerFor(nodeEnv: string) {
	vi.resetModules();
	process.env.NODE_ENV = nodeEnv;
	return import('../src/lib/server/log');
}

afterEach(() => {
	process.env.NODE_ENV = ORIGINAL_NODE_ENV;
	vi.restoreAllMocks();
});

describe('createLogger — production JSON lines', () => {
	it('emits one JSON object per line with level, message, ts and the subsystem tag', async () => {
		const { createLogger } = await loggerFor('production');
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const log = createLogger('worker');

		log.info('Extraction done for item 123', { requestId: 'abc123' });

		expect(spy).toHaveBeenCalledTimes(1);
		const line = spy.mock.calls[0]![0] as string;
		expect(line.includes('\n')).toBe(false);
		const parsed = JSON.parse(line);
		expect(parsed).toMatchObject({
			level: 'info',
			message: 'Extraction done for item 123',
			subsystem: 'worker',
			requestId: 'abc123',
		});
		expect(typeof parsed.ts).toBe('string');
		expect(Number.isNaN(Date.parse(parsed.ts))).toBe(false);
	});

	it('writes every level to stdout, so the JSON level field is what carries severity', async () => {
		const { createLogger } = await loggerFor('production');
		const log = createLogger('dlq');
		const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		log.debug('d');
		log.info('i');
		log.warn('w');
		log.error('e');

		expect(logSpy).toHaveBeenCalledTimes(4);
		expect(warnSpy).not.toHaveBeenCalled();
		expect(errorSpy).not.toHaveBeenCalled();
		expect(logSpy.mock.calls.map((c) => JSON.parse(c[0] as string).level))
			.toEqual(['debug', 'info', 'warn', 'error']);
	});

	it('serializes an Error field into message/stack rather than dropping it', async () => {
		const { createLogger } = await loggerFor('production');
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const log = createLogger('dlq');

		log.error('pg-boss error', { err: new Error('connection refused') });

		const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
		expect(parsed.err).toMatchObject({ name: 'Error', message: 'connection refused' });
		expect(typeof parsed.err.stack).toBe('string');
	});

	it('drops undefined fields instead of writing an explicit null', async () => {
		const { createLogger } = await loggerFor('production');
		const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const log = createLogger('hooks');

		log.info('membership lookup failed', { requestId: undefined });

		const parsed = JSON.parse(spy.mock.calls[0]![0] as string);
		expect('requestId' in parsed).toBe(false);
	});
});

describe('createLogger — non-production pretty line', () => {
	it('renders one readable line carrying the subsystem tag and fields, not JSON', async () => {
		const { createLogger } = await loggerFor('development');
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const log = createLogger('worker');

		log.warn('Quota exceeded for tenant r1', { restaurantId: 'r1', requestId: 'req-9' });

		expect(spy).toHaveBeenCalledTimes(1);
		const line = spy.mock.calls[0]![0] as string;
		expect(() => JSON.parse(line)).toThrow();
		expect(line).toContain('WARN');
		expect(line).toContain('[worker]');
		expect(line).toContain('Quota exceeded for tenant r1');
		expect(line).toContain('restaurantId=r1');
		expect(line).toContain('requestId=req-9');
	});
});
