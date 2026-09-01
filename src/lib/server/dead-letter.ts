import * as Sentry from '@sentry/sveltekit';
import { and, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { db, forTenant, runAsSystem, runWithTenantContext } from './db';
import { deadLetterQueue, restaurants } from './schema';

export const DEAD_LETTER_STATUSES = ['pending', 'reviewed', 'replayed', 'discarded'] as const;
export type DeadLetterStatus = (typeof DEAD_LETTER_STATUSES)[number];

const RESOLVED_STATUSES: DeadLetterStatus[] = ['reviewed', 'replayed', 'discarded'];

export const DEAD_LETTER_RESOLVED_RETENTION_DAYS = 90;
export const DEAD_LETTER_PENDING_RETENTION_DAYS = 180;

const MAX_STRING_CHARS = 512;
const MAX_MESSAGE_CHARS = 1000;
const MAX_STACK_CHARS = 4000;
const MAX_PAYLOAD_CHARS = 8000;
const MAX_ARRAY_ITEMS = 25;
const MAX_OBJECT_KEYS = 40;
const MAX_DEPTH = 4;
const REDACTED = '[redacted]';

const SENSITIVE_KEY = /pass|secret|token|api[-_]?key|auth|cookie|credential|signature|session|dsn/i;
const EMAIL_RE = /(?<![^\s@"'])[^\s@"']+@[^\s@"'][^\s@"'.]*\.[^\s@"']+/g;

const CORRUPTION_PATTERNS: Array<[RegExp, string]> = [
	[/invalid json|is not valid json|unexpected token|json at position/i, 'corrupt.invalidJson'],
	[/unrecognised xml|unrecognized xml|\bfacturae\b|\bubl\b/i, 'corrupt.unknownEinvoiceFormat'],
	[/malformed|corrupt|unsupported (file|mime|format)/i, 'corrupt.malformedFile'],
	[/no such file|enoent/i, 'corrupt.missingFile'],
];

export function redactString(value: string, max = MAX_STRING_CHARS): string {
	const masked = value.replace(EMAIL_RE, REDACTED);
	if (masked.length <= max) return masked;
	return `${masked.slice(0, max)}[+${masked.length - max} chars]`;
}

const NOT_SCALAR = Symbol('redact-not-scalar');

export function redactPayload(value: unknown, depth = 0): unknown {
	const scalar = redactScalar(value);
	if (scalar !== NOT_SCALAR) return scalar;
	if (depth >= MAX_DEPTH) return '[depth-limit]';
	if (Array.isArray(value)) return redactArray(value, depth);
	return redactObject(value as Record<string, unknown>, depth);
}

function redactScalar(value: unknown): unknown {
	if (value === null || value === undefined) return null;
	if (typeof value === 'string') return redactString(value);
	if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
	if (typeof value === 'boolean') return value;
	if (typeof value === 'bigint') return value.toString();
	if (typeof value === 'function' || typeof value === 'symbol') return `[${typeof value}]`;
	if (value instanceof Date) return value.toISOString();
	if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
	if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return `[binary ${value.byteLength} bytes]`;
	return NOT_SCALAR;
}

function redactArray(value: unknown[], depth: number): unknown[] {
	const head = value.slice(0, MAX_ARRAY_ITEMS).map((v) => redactPayload(v, depth + 1));
	if (value.length > MAX_ARRAY_ITEMS) head.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
	return head;
}

function redactObject(value: Record<string, unknown>, depth: number): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	let seen = 0;
	for (const [key, val] of Object.entries(value)) {
		if (seen >= MAX_OBJECT_KEYS) {
			out['[truncated]'] = true;
			break;
		}
		out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactPayload(val, depth + 1);
		seen++;
	}
	return out;
}

export function serializePayload(value: unknown): unknown {
	if (value === undefined) return null;
	const redacted = redactPayload(value);
	let json: string;
	try {
		json = JSON.stringify(redacted) ?? 'null';
	} catch {
		return { unserializable: true };
	}
	if (json.length > MAX_PAYLOAD_CHARS) {
		return { truncated: true, preview: json.slice(0, MAX_PAYLOAD_CHARS) };
	}
	return redacted;
}

export function describeError(err: unknown): { message: string; stack: string | null } {
	if (err instanceof Error) {
		return {
			message: redactString(err.message || err.name || 'Error', MAX_MESSAGE_CHARS),
			stack: err.stack ? err.stack.slice(0, MAX_STACK_CHARS) : null,
		};
	}
	if (typeof err === 'string') return { message: redactString(err, MAX_MESSAGE_CHARS), stack: null };
	try {
		return { message: redactString(JSON.stringify(err) ?? String(err), MAX_MESSAGE_CHARS), stack: null };
	} catch {
		return { message: redactString(String(err), MAX_MESSAGE_CHARS), stack: null };
	}
}

function rawErrorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	return typeof err === 'string' ? err : '';
}

export function classifyDeadLetterError(err: unknown): string {
	const message = rawErrorMessage(err);
	for (const [pattern, errorClass] of CORRUPTION_PATTERNS) {
		if (pattern.test(message)) return errorClass;
	}
	const code = (err as { code?: unknown } | null | undefined)?.code;
	if (typeof code === 'string' && code) return `error.${code}`;
	const status = (err as { status?: unknown } | null | undefined)?.status;
	if (typeof status === 'number') return `error.http${status}`;
	if (err instanceof Error && err.name) return `error.${err.name}`;
	return 'error.unknown';
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function tenantColumnValue(restaurantId: string | null | undefined): string | null {
	return typeof restaurantId === 'string' && UUID_RE.test(restaurantId) ? restaurantId : null;
}

export interface DeadLetterInput {
	queue: string;
	error: unknown;
	errorClass?: string;
	restaurantId?: string | null;
	sourceId?: string | null;
	jobId?: string | null;
	attempt?: number;
	payload?: unknown;
	skipIfJobRecorded?: boolean;
}

export async function recordDeadLetter(input: DeadLetterInput): Promise<number | null> {
	const errorClass = input.errorClass ?? classifyDeadLetterError(input.error);
	const { message, stack } = describeError(input.error);
	try {
		return await runAsSystem(async () => {
			const payload = serializePayload(input.payload);
			const attempt = Number.isInteger(input.attempt) ? (input.attempt as number) : 1;
			const sourceId = typeof input.sourceId === 'string' ? input.sourceId : null;

			if (input.skipIfJobRecorded && input.jobId) {
				// tenant-scope-ok: keyed by pg-boss's globally-unique job id, which
				// already identifies one tenant's job; this is the worker drain asking
				// whether the handler got there first.
				const [already] = await db
					.select({ id: deadLetterQueue.id })
					.from(deadLetterQueue)
					.where(eq(deadLetterQueue.jobId, input.jobId))
					.limit(1);
				if (already) return already.id;
			}

			if (sourceId) {
				const bumped = await db
					.update(deadLetterQueue)
					.set({
						errorMessage: message,
						stack,
						payload,
						attempt,
						lastSeenAt: new Date(),
						occurrences: sql`${deadLetterQueue.occurrences} + 1`,
					})
					.where(and(
						eq(deadLetterQueue.queue, input.queue),
						eq(deadLetterQueue.sourceId, sourceId),
						eq(deadLetterQueue.errorClass, errorClass),
						eq(deadLetterQueue.status, 'pending'),
					))
					.returning({ id: deadLetterQueue.id });
				if (bumped.length > 0) return bumped[0].id;
			}

			const [row] = await db
				.insert(deadLetterQueue)
				.values({
					queue: input.queue,
					restaurantId: tenantColumnValue(input.restaurantId),
					sourceId,
					jobId: input.jobId ?? null,
					errorClass,
					errorMessage: message,
					stack,
					payload,
					attempt,
				})
				.returning({ id: deadLetterQueue.id });
			return row?.id ?? null;
		});
	} catch (err) {
		console.error(`[dlq] could not record dead letter for "${input.queue}" (non-fatal):`, err);
		Sentry.captureException(err, { tags: { deadLetter: input.queue, errorClass } });
		return null;
	}
}

export interface DeadLetterJobRef {
	queue: string;
	jobId?: string | null;
	restaurantId?: string | null;
	sourceId?: string | null;
	attempt?: number;
	retriesLeft?: number;
	payload?: unknown;
}

function firstString(...values: unknown[]): string | null {
	for (const value of values) {
		if (typeof value === 'string' && value) return value;
		if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	}
	return null;
}

export function deadLetterRefFromJob(
	queue: string,
	job: { id?: string | null; data?: unknown; retryCount?: number | null; retryLimit?: number | null },
): DeadLetterJobRef {
	const data = (job.data ?? {}) as Record<string, unknown>;
	const restaurantId = typeof data.restaurantId === 'string' ? data.restaurantId : null;
	const productId = firstString(data.productId);
	const sourceId = firstString(data.itemId, data.sessionId)
		?? (restaurantId && productId ? `${restaurantId}:${productId}` : productId);
	const retryCount = job.retryCount ?? 0;
	const retryLimit = job.retryLimit ?? 0;
	return {
		queue,
		jobId: job.id ?? null,
		restaurantId,
		sourceId,
		attempt: retryCount + 1,
		retriesLeft: Math.max(0, retryLimit - retryCount),
		payload: job.data,
	};
}

export async function runWithDeadLetter<T>(
	ref: DeadLetterJobRef,
	run: () => Promise<T>,
): Promise<T> {
	try {
		return await runWithTenantContext(ref.restaurantId, run);
	} catch (err) {
		if ((ref.retriesLeft ?? 0) > 0) throw err;
		console.error(`[dlq] "${ref.queue}" job ${ref.jobId ?? '-'} dead-lettered after ${ref.attempt ?? 1} attempt(s):`, err);
		await recordDeadLetter({ ...ref, error: err });
		throw err;
	}
}

export interface DeadLetterRow {
	id: number;
	queue: string;
	restaurantId: string | null;
	restaurantName: string | null;
	sourceId: string | null;
	jobId: string | null;
	errorClass: string;
	errorMessage: string;
	stack: string | null;
	payload: unknown;
	attempt: number;
	occurrences: number;
	status: string;
	firstSeenAt: Date;
	lastSeenAt: Date;
	reviewedAt: Date | null;
	reviewedBy: string | null;
}

export interface DeadLetterFilter {
	queue?: string;
	status?: string;
	restaurantId?: string;
}

function filterClause(filter: DeadLetterFilter) {
	const clauses = [
		filter.queue ? eq(deadLetterQueue.queue, filter.queue) : undefined,
		filter.status ? eq(deadLetterQueue.status, filter.status) : undefined,
		filter.restaurantId ? forTenant(filter.restaurantId).scope(deadLetterQueue.restaurantId) : undefined,
	].filter(Boolean);
	return clauses.length > 0 ? and(...clauses) : undefined;
}

export async function listDeadLetters(
	filter: DeadLetterFilter = {},
	limit = 50,
	offset = 0,
): Promise<DeadLetterRow[]> {
	// tenant-scope-ok: admin audit view over every tenant's failed jobs; reachable
	// only from the (admin) route group, which isAdminUser() already gates.
	const rows = await db
		.select({
			id: deadLetterQueue.id,
			queue: deadLetterQueue.queue,
			restaurantId: deadLetterQueue.restaurantId,
			restaurantName: restaurants.name,
			sourceId: deadLetterQueue.sourceId,
			jobId: deadLetterQueue.jobId,
			errorClass: deadLetterQueue.errorClass,
			errorMessage: deadLetterQueue.errorMessage,
			stack: deadLetterQueue.stack,
			payload: deadLetterQueue.payload,
			attempt: deadLetterQueue.attempt,
			occurrences: deadLetterQueue.occurrences,
			status: deadLetterQueue.status,
			firstSeenAt: deadLetterQueue.firstSeenAt,
			lastSeenAt: deadLetterQueue.lastSeenAt,
			reviewedAt: deadLetterQueue.reviewedAt,
			reviewedBy: deadLetterQueue.reviewedBy,
		})
		.from(deadLetterQueue)
		.leftJoin(restaurants, eq(restaurants.id, deadLetterQueue.restaurantId))
		.where(filterClause(filter))
		.orderBy(desc(deadLetterQueue.lastSeenAt))
		.limit(limit)
		.offset(offset);
	return rows as DeadLetterRow[];
}

export async function countDeadLetters(filter: DeadLetterFilter = {}): Promise<number> {
	// tenant-scope-ok: admin audit counter across every tenant, same gate as listDeadLetters.
	return db.$count(deadLetterQueue, filterClause(filter));
}

export async function deadLetterQueueBreakdown(): Promise<Array<{ queue: string; pending: number; total: number }>> {
	// tenant-scope-ok: admin dashboard rollup across every tenant, same gate as listDeadLetters.
	const rows = await db
		.select({
			queue: deadLetterQueue.queue,
			pending: sql<number>`count(*) filter (where ${deadLetterQueue.status} = 'pending')::int`,
			total: sql<number>`count(*)::int`,
		})
		.from(deadLetterQueue)
		.groupBy(deadLetterQueue.queue)
		.orderBy(desc(sql`count(*)`));
	return rows;
}

export async function pendingDeadLetterCount(): Promise<number> {
	return countDeadLetters({ status: 'pending' });
}

export type DeadLetterEntry = Omit<DeadLetterRow, 'restaurantName'>;

export async function getDeadLetter(id: number): Promise<DeadLetterEntry | null> {
	if (!Number.isInteger(id) || id <= 0) return null;
	// tenant-scope-ok: admin audit lookup by primary key; the caller is admin-gated.
	const [row] = await db
		.select()
		.from(deadLetterQueue)
		.where(eq(deadLetterQueue.id, id))
		.limit(1);
	return (row as DeadLetterEntry | undefined) ?? null;
}

export async function setDeadLetterStatus(
	id: number,
	status: DeadLetterStatus,
	reviewedBy: string | null,
): Promise<boolean> {
	if (!Number.isInteger(id) || id <= 0) return false;
	const rows = await db
		.update(deadLetterQueue)
		.set({ status, reviewedAt: new Date(), reviewedBy })
		.where(eq(deadLetterQueue.id, id))
		.returning({ id: deadLetterQueue.id });
	return rows.length > 0;
}

export async function purgeDeadLetters(now: Date = new Date()): Promise<{ purged: number }> {
	const dayMs = 24 * 60 * 60 * 1000;
	const resolvedCutoff = new Date(now.getTime() - DEAD_LETTER_RESOLVED_RETENTION_DAYS * dayMs);
	const pendingCutoff = new Date(now.getTime() - DEAD_LETTER_PENDING_RETENTION_DAYS * dayMs);
	const rows = await db
		.delete(deadLetterQueue)
		.where(or(
			and(inArray(deadLetterQueue.status, RESOLVED_STATUSES), lt(deadLetterQueue.lastSeenAt, resolvedCutoff)),
			and(eq(deadLetterQueue.status, 'pending'), lt(deadLetterQueue.lastSeenAt, pendingCutoff)),
		))
		.returning({ id: deadLetterQueue.id });
	return { purged: rows.length };
}
