import fs from 'node:fs';
import path from 'node:path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import {
	UPLOADS_DIR, STORAGE_DRIVER,
	AWS_ENDPOINT_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET_NAME, AWS_DEFAULT_REGION, AWS_S3_URL_STYLE,
} from './env.js';

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
		});
	}

	async save(key: string, buf: Buffer): Promise<void> {
		await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buf }));
	}

	async read(key: string): Promise<Buffer> {
		const { Body } = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
		return Buffer.from(await Body!.transformToByteArray());
	}

	async delete(key: string): Promise<void> {
		await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
	}
}

const _storage =
	STORAGE_DRIVER === 'railway' ? new RailwayBucketDriver() :
	new LocalDriver();
export function getStorage() { return _storage; }
