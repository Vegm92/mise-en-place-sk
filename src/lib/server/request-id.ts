import { randomBytes } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';

const TRACEPARENT_RE = /^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i;
const ALL_ZERO_TRACE_ID = '0'.repeat(32);

export function resolveRequestId(event: RequestEvent): string {
	const traceparent = event.request.headers.get('traceparent');
	const traceId = traceparent?.match(TRACEPARENT_RE)?.[1]?.toLowerCase();
	if (traceId && traceId !== ALL_ZERO_TRACE_ID) return traceId;
	return randomBytes(16).toString('hex');
}
