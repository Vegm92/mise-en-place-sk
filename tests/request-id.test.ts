/**
 * Issue #1002 — correlation id resolution (`resolveRequestId`).
 *
 * `appHandle` (hooks.server.ts) calls this to decide what id names one web
 * request end to end: reuse the trace id an upstream hop already minted
 * (W3C `traceparent`) rather than inventing a second, unrelated one, and
 * only mint a fresh one when there is nothing valid to reuse.
 */
import { describe, it, expect } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { resolveRequestId } from '../src/lib/server/request-id';

function fakeEvent(headers: Record<string, string> = {}): RequestEvent {
	return { request: { headers: new Headers(headers) } } as unknown as RequestEvent;
}

describe('resolveRequestId', () => {
	it('mints a fresh 32-hex-char id when there is no inbound traceparent', () => {
		const id = resolveRequestId(fakeEvent());
		expect(id).toMatch(/^[0-9a-f]{32}$/);
	});

	it('reuses the trace id carried by a valid W3C traceparent header instead of minting a second one', () => {
		const id = resolveRequestId(fakeEvent({
			traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
		}));
		expect(id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
	});

	it('is case-insensitive on the incoming header but normalizes to lowercase', () => {
		const id = resolveRequestId(fakeEvent({
			traceparent: '00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01',
		}));
		expect(id).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
	});

	it('mints a fresh id when the traceparent header is malformed', () => {
		const id = resolveRequestId(fakeEvent({ traceparent: 'not-a-traceparent' }));
		expect(id).toMatch(/^[0-9a-f]{32}$/);
	});

	it('mints a fresh id rather than reusing the reserved all-zero trace id', () => {
		const id = resolveRequestId(fakeEvent({
			traceparent: '00-00000000000000000000000000000000-00f067aa0ba902b7-01',
		}));
		expect(id).toMatch(/^[0-9a-f]{32}$/);
		expect(id).not.toBe('0'.repeat(32));
	});

	it('mints a different id on each call with no traceparent, so two requests never collide', () => {
		expect(resolveRequestId(fakeEvent())).not.toBe(resolveRequestId(fakeEvent()));
	});
});
