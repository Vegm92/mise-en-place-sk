import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
	UPLOADS_DIR, STORAGE_DRIVER,
	AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME, AWS_DEFAULT_REGION, AWS_S3_URL_STYLE,
	STORAGE_CONNECT_TIMEOUT_MS, STORAGE_TIMEOUT_MS, STORAGE_MAX_ATTEMPTS,
} from './env.js';
import { withTimeout, TimeoutError } from './with-timeout.js';

const RETRY_BASE_MS = 500;

const TRANSIENT_NAMES = new Set([
	'TimeoutError', 'RequestTimeout', 'RequestTimeoutException', 'NetworkingError', 'AbortError',
	'ECONNRESET', 'ECONNREFUSED', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND',
]);

export function isTransientStorageError(err: unknown): boolean {
	if (err instanceof TimeoutError) return true;
	const e = err as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } };
	const status = e?.$metadata?.httpStatusCode;
	if (typeof status === 'number') return status === 429 || status >= 500;
	return TRANSIENT_NAMES.has(e?.name ?? '') || TRANSIENT_NAMES.has(e?.code ?? '');
}

export async function withStorageRetry<T>(
	label: string,
	fn: (signal: AbortSignal) => Promise<T>,
	attempts: number = STORAGE_MAX_ATTEMPTS,
	timeoutMs: number = STORAGE_TIMEOUT_MS,
): Promise<T> {
	const total = Math.max(1, attempts);
	let lastError: unknown;
	for (let attempt = 0; attempt < total; attempt++) {
		try {
			return await withTimeout(label, timeoutMs, fn);
		} catch (err) {
			lastError = err;
			if (!isTransientStorageError(err) || attempt === total - 1) throw err;
			console.warn(`[storage] ${label} failed on attempt ${attempt + 1}/${total}, retrying:`, err);
			await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_MS * 2 ** attempt));
		}
	}
	throw lastError;
}

class LocalDriver {
	private base: string;
	constructor() { this.base = path.resolve(process.cwd(), UPLOADS_DIR); }

	async save(key: string, buf: Buffer): Promise<void> {
		const dest = path.resolve(this.base, key);
		if (!dest.startsWith(this.base + path.sep) && dest !== this.base) {
			throw new Error(`Invalid storage key: ${key}`);
		}
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.writeFileSync(dest, buf);
	}

	async read(key: string): Promise<Buffer> {
		const fp = path.resolve(this.base, key);
		if (!fp.startsWith(this.base + path.sep) && fp !== this.base) {
			throw new Error(`Invalid storage key: ${key}`);
		}
		return fs.readFileSync(fp);
	}

	async delete(key: string): Promise<void> {
		try {
			const fp = path.resolve(this.base, key);
			if (fp.startsWith(this.base + path.sep) && fs.existsSync(fp)) fs.unlinkSync(fp);
		} catch {
		}
	}
}

class RailwayBucketDriver {
	private client: S3Client;
	private bucket: string;

	constructor() {
		if (!AWS_ENDPOINT_URL || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET_NAME) {
			throw new Error('AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and AWS_S3_BUCKET_NAME are required for Railway bucket storage');
		}
		this.bucket = AWS_S3_BUCKET_NAME;
		this.client = new S3Client({
			endpoint: AWS_ENDPOINT_URL,
			region: AWS_DEFAULT_REGION,
			forcePathStyle: AWS_S3_URL_STYLE === 'path',
			credentials: { accessKeyId: AWS_ACCESS_KEY_ID, secretAccessKey: AWS_SECRET_ACCESS_KEY },
			maxAttempts: 1,
			requestHandler: {
				connectionTimeout: STORAGE_CONNECT_TIMEOUT_MS,
				requestTimeout: STORAGE_TIMEOUT_MS,
			},
		});
	}

	async save(key: string, buf: Buffer): Promise<void> {
		await withStorageRetry(`storage.save ${key}`, (signal) =>
			this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buf }), { abortSignal: signal }));
	}

	async read(key: string): Promise<Buffer> {
		return withStorageRetry(`storage.read ${key}`, async (signal) => {
			const { Body } = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: signal });
			return Buffer.from(await Body!.transformToByteArray());
		});
	}

	async delete(key: string): Promise<void> {
		await withStorageRetry(`storage.delete ${key}`, (signal) =>
			this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: signal }));
	}
}

const _storage =
	STORAGE_DRIVER === 'railway' ? new RailwayBucketDriver() :
	new LocalDriver();
export function getStorage() { return _storage; }
