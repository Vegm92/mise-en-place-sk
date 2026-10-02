export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
	[key: string]: unknown;
}

export interface Logger {
	debug(message: string, fields?: LogFields): void;
	info(message: string, fields?: LogFields): void;
	warn(message: string, fields?: LogFields): void;
	error(message: string, fields?: LogFields): void;
}

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const SENSITIVE_KEYS = new Set([
	'email',
	'token',
	'access_token',
	'refresh_token',
	'password',
	'authorization',
	'cookie',
	'set-cookie',
	'secret',
]);

function isSensitiveKey(key: string): boolean {
	return SENSITIVE_KEYS.has(key.toLowerCase());
}

function serializeFieldValue(key: string, value: unknown): unknown {
	if (isSensitiveKey(key)) return '[redacted]';
	if (value instanceof Error) {
		return { name: value.name, message: value.message, stack: value.stack ?? null };
	}
	if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
		const obj: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			if (v !== undefined) obj[k] = serializeFieldValue(k, v);
		}
		return obj;
	}
	return value;
}

function serializeFields(fields: LogFields | undefined): LogFields {
	const out: LogFields = {};
	if (!fields) return out;
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) out[key] = serializeFieldValue(key, value);
	}
	return out;
}

function formatFieldValue(value: unknown): string {
	if (typeof value === 'string') return /\s/.test(value) ? JSON.stringify(value) : value;
	if (value === null || value === undefined) return String(value);
	if (typeof value === 'object') return JSON.stringify(value);
	return String(value);
}

function writePretty(level: LogLevel, subsystem: string, message: string, ts: string, fields: LogFields): void {
	const time = ts.slice(11, 19);
	const rendered = Object.entries(fields).map(([key, value]) => `${key}=${formatFieldValue(value)}`);
	const suffix = rendered.length > 0 ? ` ${rendered.join(' ')}` : '';
	console[level](`${time} ${level.toUpperCase().padEnd(5)} [${subsystem}] ${message}${suffix}`);
}

function writeJsonLine(level: LogLevel, subsystem: string, message: string, ts: string, fields: LogFields): void {
	console.log(JSON.stringify({ level, message, ts, subsystem, ...fields }));
}

export function createLogger(subsystem: string): Logger {
	function emit(level: LogLevel, message: string, fields?: LogFields): void {
		const ts = new Date().toISOString();
		const safeFields = serializeFields(fields);
		if (IS_PRODUCTION) writeJsonLine(level, subsystem, message, ts, safeFields);
		else writePretty(level, subsystem, message, ts, safeFields);
	}
	return {
		debug: (message, fields) => emit('debug', message, fields),
		info: (message, fields) => emit('info', message, fields),
		warn: (message, fields) => emit('warn', message, fields),
		error: (message, fields) => emit('error', message, fields),
	};
}
