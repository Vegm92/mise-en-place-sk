import { sql } from 'drizzle-orm';
import * as v from 'valibot';
import { db, runWithTenantContext } from './db';
import { createLogger } from './log';
import { sqlRows } from './sql-rows';
import { getBoss } from './queue';
import { markQueued } from './batch';
import { EXTRACTION_QUEUE } from './contracts/extraction-contract.js';

const log = createLogger('dlq');

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

export async function runJob<T>(
	job: { name: string; id: string; data?: unknown },
	run: () => Promise<T>,
): Promise<T> {
	const restaurantId = (job.data as { restaurantId?: unknown } | null | undefined)?.restaurantId;
	try {
		return await (typeof restaurantId === 'string' && restaurantId ? runWithTenantContext(restaurantId, run) : run());
	} catch (err) {
		log.error('job failed', { queue: job.name, jobId: job.id, err });
		throw err;
	}
}

export interface DeadLetterRow {
	id: string;
	queue: string;
	restaurantName: string | null;
	errorClass: string | null;
	errorMessage: string;
	payload: unknown;
	retryCount: number;
	createdOn: Date;
	failedOn: Date;
}

const Timestamp = v.pipe(v.union([v.string(), v.date()]), v.transform((t) => new Date(t)));

const FailedJobRow = v.object({
	id: v.string(),
	name: v.string(),
	restaurant_name: v.nullable(v.string()),
	error_class: v.nullable(v.string()),
	error_message: v.nullable(v.string()),
	data: v.unknown(),
	retry_count: v.number(),
	created_on: Timestamp,
	completed_on: Timestamp,
});

function queueClause(queue?: string) {
	return queue ? sql`AND j.name = ${queue}` : sql``;
}

export async function listDeadLetters(queue = '', limit = 50, offset = 0): Promise<DeadLetterRow[]> {
	// tenant-scope-ok: admin audit view over every tenant's failed pg-boss jobs;
	// reachable only from the (admin) route group, which isAdminUser() gates.
	const rows = sqlRows(await db.execute(sql`
		SELECT j.id::text AS id, j.name, r.name AS restaurant_name,
			j.output->>'errorClass' AS error_class,
			COALESCE(j.output->>'message', j.output->>'error', j.output::text) AS error_message,
			j.data, j.retry_count, j.created_on, j.completed_on
		FROM pgboss.job j
		LEFT JOIN restaurants r ON r.id::text = j.data->>'restaurantId'
		WHERE j.state = 'failed' ${queueClause(queue)}
		ORDER BY j.completed_on DESC
		LIMIT ${limit} OFFSET ${offset}
	`), FailedJobRow);
	return rows.map((r) => ({
		id: r.id,
		queue: r.name,
		restaurantName: r.restaurant_name,
		errorClass: r.error_class,
		errorMessage: redactString(r.error_message ?? '', MAX_MESSAGE_CHARS),
		payload: serializePayload(r.data),
		retryCount: r.retry_count,
		createdOn: r.created_on,
		failedOn: r.completed_on,
	}));
}

const CountRow = v.object({ name: v.string(), failed: v.number() });

export async function deadLetterQueueBreakdown(windowHours?: number): Promise<Array<{ queue: string; failed: number }>> {
	const since = windowHours ? sql`AND completed_on > now() - ${`${windowHours} hours`}::interval` : sql``;
	// tenant-scope-ok: platform-wide ops counter over pg-boss's own job table.
	const rows = sqlRows(await db.execute(sql`
		SELECT name, COUNT(*)::int AS failed
		FROM pgboss.job
		WHERE state = 'failed' ${since}
		GROUP BY name
		ORDER BY COUNT(*) DESC
	`), CountRow);
	return rows.map((r) => ({ queue: r.name, failed: r.failed }));
}

export async function countDeadLetters(queue = ''): Promise<number> {
	const breakdown = await deadLetterQueueBreakdown();
	return breakdown.filter((q) => !queue || q.queue === queue).reduce((n, q) => n + q.failed, 0);
}

export interface DeadLetterGrowth {
	windowHours: number;
	pending: number;
	byQueue: Array<{ queue: string; pending: number }>;
}

export async function deadLetterGrowth(windowHours = 24): Promise<DeadLetterGrowth> {
	const byQueue = (await deadLetterQueueBreakdown(windowHours)).map((q) => ({ queue: q.queue, pending: q.failed }));
	return { windowHours, pending: byQueue.reduce((n, q) => n + q.pending, 0), byQueue };
}

export type DeadLetterActionResult = { ok: true } | { ok: false; error: 'notFound' | 'itemNotRequeueable' };

async function failedJob(queue: string, id: string) {
	const boss = await getBoss();
	const job = await boss.getJobById<{ itemId?: unknown }>(queue, id);
	return job?.state === 'failed' ? { boss, job } : null;
}

export async function retryDeadLetter(queue: string, id: string): Promise<DeadLetterActionResult> {
	const found = await failedJob(queue, id);
	if (!found) return { ok: false, error: 'notFound' };
	const itemId = found.job.data?.itemId;
	if (queue === EXTRACTION_QUEUE && typeof itemId === 'string' && !(await markQueued(itemId))) {
		return { ok: false, error: 'itemNotRequeueable' };
	}
	await found.boss.retry(queue, id);
	return { ok: true };
}

export async function discardDeadLetter(queue: string, id: string): Promise<DeadLetterActionResult> {
	const found = await failedJob(queue, id);
	if (!found) return { ok: false, error: 'notFound' };
	await found.boss.deleteJob(queue, id);
	return { ok: true };
}
